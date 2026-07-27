import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  EVENT_QR_PASS_PURPOSES,
  EVENT_QR_PASS_STATUSES,
} from "@/lib/constants/event-qr-pass";
import { hashQrFallbackCode, hashQrPassToken } from "@/lib/events/qr-pass-token";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";
import {
  eventQrPassFoundationApi,
  findActiveQrPassByHashAndPurpose,
  listQrPassesForRegistration,
  lockQrPassForUpdate,
  persistHashOnlyQrPass,
  QrPassFoundationError,
  toSafeQrPassDto,
} from "@/server/repositories/event-qr-pass.repository";

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

async function canReachDatabase() {
  if (!hasDatabaseUrl) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const dbReady = await canReachDatabase();

function hash(label: string) {
  return createHash("sha256").update(label).digest("hex");
}

function futureExpiry(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

describe("Blueprint 7.3P QR pass foundation API surface", () => {
  it("exposes only persist/find/list/lock/safe-dto helpers", () => {
    expect(Object.keys(eventQrPassFoundationApi).sort()).toEqual([
      "findActiveQrPassByHashAndPurpose",
      "listQrPassesForRegistration",
      "lockQrPassForUpdate",
      "persistHashOnlyQrPass",
      "toSafeQrPassDto",
    ]);
    expect(eventQrPassFoundationApi).not.toHaveProperty("issueQrPass");
    expect(eventQrPassFoundationApi).not.toHaveProperty("generateQrPassToken");
    expect(eventQrPassFoundationApi).not.toHaveProperty("deleteQrPass");
    expect(EVENT_QR_PASS_PURPOSES).toEqual(["EVENT_CHECK_IN"]);
    expect(EVENT_QR_PASS_STATUSES).toEqual([
      "ACTIVE",
      "REVOKED",
      "EXPIRED",
      "REPLACED",
    ]);
  });

  it("safe DTO omits tokenHash and fallbackCodeHash", () => {
    const dto = toSafeQrPassDto({
      id: randomUUID(),
      organizationId: randomUUID(),
      eventId: randomUUID(),
      registrationId: randomUUID(),
      attendeeId: null,
      tokenHash: "a".repeat(64),
      fallbackCodeHash: "b".repeat(64),
      purpose: "EVENT_CHECK_IN",
      status: "ACTIVE",
      expiresAt: futureExpiry(),
      revokedAt: null,
      revokedByUserId: null,
      rotatedAt: null,
      replacedByTokenId: null,
      lastUsedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("fallbackCodeHash");
    expect(serialized).not.toMatch(/"a{64}"/);
    expect(dto).not.toHaveProperty("tokenHash");
    expect(dto).not.toHaveProperty("fallbackCodeHash");
    expect(dto).not.toHaveProperty("rawToken");
    expect(dto).not.toHaveProperty("fallbackCode");
  });
});

describe.runIf(dbReady)("Blueprint 7.3P QR pass foundation (database)", () => {
  let fx: AttendanceFoundationFixture;

  beforeAll(async () => {
    fx = await createAttendanceFoundationFixture();
  });

  afterAll(async () => {
    if (!fx) return;
    await prisma.eventQrPass.deleteMany({
      where: {
        eventId: { in: [fx.eventId, fx.altEventId, fx.foreignEventId] },
      },
    });
    await fx.cleanup();
    await prisma.$disconnect();
  });

  async function wipePasses() {
    await prisma.eventQrPass.deleteMany({
      where: {
        eventId: { in: [fx.eventId, fx.altEventId, fx.foreignEventId] },
      },
    });
  }

  it("migration applied: hash-only columns exist and plaintext fallbackCode does not", async () => {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'event_qr_passes'
    `;
    const names = cols.map((c) => c.column_name);
    expect(names).toContain("tokenHash");
    expect(names).toContain("fallbackCodeHash");
    expect(names).toContain("status");
    expect(names).toContain("replacedByTokenId");
    expect(names).toContain("revokedByUserId");
    expect(names).not.toContain("fallbackCode");
    expect(names).not.toContain("rawToken");
    expect(names).not.toContain("token");
  });

  it("persists a valid hash-only party pass and attendee pass", async () => {
    await wipePasses();
    const party = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: null,
      tokenHash: hash(`party-${fx.registrationId}`),
      fallbackCodeHash: hash(`party-fb-${fx.registrationId}`),
      expiresAt: futureExpiry(),
    });
    expect(party.status).toBe("ACTIVE");
    expect(party.attendeeId).toBeNull();
    expect(party.purpose).toBe("EVENT_CHECK_IN");

    const attendee = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: fx.guestAttendeeId,
      tokenHash: hash(`attendee-${fx.guestAttendeeId}`),
      fallbackCodeHash: hash(`attendee-fb-${fx.guestAttendeeId}`),
      expiresAt: futureExpiry(),
    });
    expect(attendee.attendeeId).toBe(fx.guestAttendeeId);
  });

  it("enforces tokenHash uniqueness", async () => {
    await wipePasses();
    const tokenHash = hash(`uniq-${randomUUID()}`);
    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash,
      fallbackCodeHash: hash(`fb-a-${randomUUID()}`),
      expiresAt: futureExpiry(),
    });
    await expect(
      persistHashOnlyQrPass({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        registrationId: fx.otherRegistrationId,
        tokenHash,
        fallbackCodeHash: hash(`fb-b-${randomUUID()}`),
        expiresAt: futureExpiry(),
      }),
    ).rejects.toBeInstanceOf(QrPassFoundationError);
  });

  it("enforces active party and attendee uniqueness", async () => {
    await wipePasses();
    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: null,
      tokenHash: hash(`party-u1-${randomUUID()}`),
      fallbackCodeHash: hash(`party-ufb1-${randomUUID()}`),
      expiresAt: futureExpiry(),
    });
    await expect(
      persistHashOnlyQrPass({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        attendeeId: null,
        tokenHash: hash(`party-u2-${randomUUID()}`),
        fallbackCodeHash: hash(`party-ufb2-${randomUUID()}`),
        expiresAt: futureExpiry(),
      }),
    ).rejects.toBeInstanceOf(QrPassFoundationError);

    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: fx.guestAttendeeId,
      tokenHash: hash(`att-u1-${randomUUID()}`),
      fallbackCodeHash: hash(`att-ufb1-${randomUUID()}`),
      expiresAt: futureExpiry(),
    });
    await expect(
      persistHashOnlyQrPass({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        attendeeId: fx.guestAttendeeId,
        tokenHash: hash(`att-u2-${randomUUID()}`),
        fallbackCodeHash: hash(`att-ufb2-${randomUUID()}`),
        expiresAt: futureExpiry(),
      }),
    ).rejects.toBeInstanceOf(QrPassFoundationError);

    // Different attendee on same registration is allowed
    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: fx.memberAttendeeId,
      tokenHash: hash(`att-u3-${randomUUID()}`),
      fallbackCodeHash: hash(`att-ufb3-${randomUUID()}`),
      expiresAt: futureExpiry(),
    });
  });

  it("rejects cross-tenant/event/registration/attendee bindings", async () => {
    await wipePasses();
    await expect(
      persistHashOnlyQrPass({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        registrationId: fx.foreignRegistrationId,
        tokenHash: hash(`xreg-${randomUUID()}`),
        fallbackCodeHash: hash(`xreg-fb-${randomUUID()}`),
        expiresAt: futureExpiry(),
      }),
    ).rejects.toMatchObject({ code: "MISMATCH" });

    await expect(
      persistHashOnlyQrPass({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        attendeeId: fx.altAttendeeId,
        tokenHash: hash(`xatt-${randomUUID()}`),
        fallbackCodeHash: hash(`xatt-fb-${randomUUID()}`),
        expiresAt: futureExpiry(),
      }),
    ).rejects.toMatchObject({ code: "MISMATCH" });

    await expect(
      prisma.eventQrPass.create({
        data: {
          organizationId: fx.organizationId,
          eventId: fx.altEventId,
          registrationId: fx.registrationId,
          tokenHash: hash(`xfk-${randomUUID()}`),
          fallbackCodeHash: hash(`xfk-fb-${randomUUID()}`),
          purpose: "EVENT_CHECK_IN",
          status: "ACTIVE",
          expiresAt: futureExpiry(),
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces replacement scope and rejects self-replacement", async () => {
    await wipePasses();
    const successor = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.otherRegistrationId,
      tokenHash: hash(`succ-${randomUUID()}`),
      fallbackCodeHash: hash(`succ-fb-${randomUUID()}`),
      expiresAt: futureExpiry(),
    });

    await expect(
      persistHashOnlyQrPass({
        organizationId: fx.organizationId,
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        tokenHash: hash(`prev-${randomUUID()}`),
        fallbackCodeHash: hash(`prev-fb-${randomUUID()}`),
        status: "REPLACED",
        revokedAt: new Date(),
        replacedByTokenId: successor.id,
        expiresAt: futureExpiry(),
      }),
    ).rejects.toMatchObject({ code: "MISMATCH" });

    const sameScopeSuccessor = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash: hash(`succ2-${randomUUID()}`),
      fallbackCodeHash: hash(`succ2-fb-${randomUUID()}`),
      expiresAt: futureExpiry(),
    });

    const replaced = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash: hash(`prev2-${randomUUID()}`),
      fallbackCodeHash: hash(`prev2-fb-${randomUUID()}`),
      status: "REPLACED",
      revokedAt: new Date(),
      replacedByTokenId: sameScopeSuccessor.id,
      expiresAt: futureExpiry(),
    });
    expect(replaced.replacedByTokenId).toBe(sameScopeSuccessor.id);

    await expect(
      prisma.eventQrPass.create({
        data: {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          organizationId: fx.organizationId,
          eventId: fx.eventId,
          registrationId: fx.otherRegistrationId,
          tokenHash: hash(`self-${randomUUID()}`),
          fallbackCodeHash: hash(`self-fb-${randomUUID()}`),
          purpose: "EVENT_CHECK_IN",
          status: "REPLACED",
          revokedAt: new Date(),
          replacedByTokenId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          expiresAt: futureExpiry(),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects expiresAt not after createdAt at the database", async () => {
    await wipePasses();
    const createdAt = new Date("2030-06-01T12:00:00.000Z");
    await expect(
      prisma.eventQrPass.create({
        data: {
          organizationId: fx.organizationId,
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          tokenHash: hash(`exp-${randomUUID()}`),
          fallbackCodeHash: hash(`exp-fb-${randomUUID()}`),
          purpose: "EVENT_CHECK_IN",
          status: "ACTIVE",
          createdAt,
          expiresAt: createdAt,
        },
      }),
    ).rejects.toThrow();
  });

  it("active lookup enforces purpose/tenant and excludes expired/revoked/replaced", async () => {
    await wipePasses();
    const raw = `raw-${randomUUID()}`;
    const tokenHash = hashQrPassToken(raw);
    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash,
      fallbackCodeHash: hashQrFallbackCode(`FB${randomUUID().slice(0, 8)}`),
      expiresAt: futureExpiry(),
    });

    const found = await findActiveQrPassByHashAndPurpose({
      organizationId: fx.organizationId,
      tokenHash,
      purpose: "EVENT_CHECK_IN",
    });
    expect(found?.tokenHash).toBe(tokenHash);

    const wrongTenant = await findActiveQrPassByHashAndPurpose({
      organizationId: fx.otherOrganizationId,
      tokenHash,
      purpose: "EVENT_CHECK_IN",
    });
    expect(wrongTenant).toBeNull();

    await prisma.eventQrPass.update({
      where: { id: found!.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
      },
    });
    expect(
      await findActiveQrPassByHashAndPurpose({
        organizationId: fx.organizationId,
        tokenHash,
      }),
    ).toBeNull();

    const expiredHash = hash(`expired-${randomUUID()}`);
    const createdAt = new Date("2020-01-01T00:00:00.000Z");
    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.otherRegistrationId,
      tokenHash: expiredHash,
      fallbackCodeHash: hash(`expired-fb-${randomUUID()}`),
      status: "ACTIVE",
      createdAt,
      expiresAt: new Date("2020-01-02T00:00:00.000Z"),
    });
    expect(
      await findActiveQrPassByHashAndPurpose({
        organizationId: fx.organizationId,
        tokenHash: expiredHash,
        now: new Date("2030-01-01T00:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("lists registration history and retains revoked rows (no hard-delete helper)", async () => {
    await wipePasses();
    const active = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash: hash(`hist-a-${randomUUID()}`),
      fallbackCodeHash: hash(`hist-afb-${randomUUID()}`),
      expiresAt: futureExpiry(),
    });
    await prisma.eventQrPass.update({
      where: { id: active.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash: hash(`hist-b-${randomUUID()}`),
      fallbackCodeHash: hash(`hist-bfb-${randomUUID()}`),
      expiresAt: futureExpiry(),
    });

    const listed = await listQrPassesForRegistration({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
    });
    expect(listed).toHaveLength(2);
    expect(listed.some((row) => row.status === "REVOKED")).toBe(true);
    expect(eventQrPassFoundationApi).not.toHaveProperty("deleteQrPass");
  });

  it("locks a scoped pass row for update", async () => {
    await wipePasses();
    const pass = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash: hash(`lock-${randomUUID()}`),
      fallbackCodeHash: hash(`lock-fb-${randomUUID()}`),
      expiresAt: futureExpiry(),
    });

    await prisma.$transaction(async (tx) => {
      const locked = await lockQrPassForUpdate(
        {
          organizationId: fx.organizationId,
          eventId: fx.eventId,
          passId: pass.id,
        },
        tx,
      );
      expect(locked?.id).toBe(pass.id);
    });

    const missing = await lockQrPassForUpdate({
      organizationId: fx.organizationId,
      eventId: fx.altEventId,
      passId: pass.id,
    });
    expect(missing).toBeNull();
  });
});
