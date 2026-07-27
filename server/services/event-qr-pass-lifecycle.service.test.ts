import "dotenv/config";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  requireEventPermission: vi.fn(),
  assertActionAllowed: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/event-permissions", () => ({
  requireEventPermission: mocks.requireEventPermission,
  getEventAccess: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  assertActionAllowed: mocks.assertActionAllowed,
}));

import { prisma } from "@/lib/db/prisma";
import { CheckInError } from "@/lib/errors/check-in-errors";
import { hashQrPassToken } from "@/lib/events/qr-pass-token";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";
import {
  eventQrPassLifecycleApi,
  issueQrPassLifecycle,
  rotateQrPassLifecycle,
  revokeQrPassLifecycle,
} from "@/server/services/event-qr-pass-lifecycle.service";

async function canReachDatabase() {
  if (!process.env.DATABASE_URL) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const dbReady = await canReachDatabase();

describe("Blueprint 7.3Q QR pass lifecycle API surface", () => {
  it("exposes only issue/rotate/revoke (+ safe dto) and no public delivery helpers", () => {
    expect(Object.keys(eventQrPassLifecycleApi).sort()).toEqual([
      "issueQrPassLifecycle",
      "listQrPassesLifecycle",
      "revokeQrPassLifecycle",
      "rotateQrPassLifecycle",
      "toSafeQrPassDto",
    ]);
    expect(eventQrPassLifecycleApi).not.toHaveProperty("renderQrImage");
    expect(eventQrPassLifecycleApi).not.toHaveProperty("sendQrPassEmail");
    expect(eventQrPassLifecycleApi).not.toHaveProperty("scanQrPass");
  });
});

describe.runIf(dbReady)("Blueprint 7.3Q QR pass lifecycle service (database)", () => {
  let fx: AttendanceFoundationFixture;
  const actor = { userAccountId: "" as string, email: "staff@example.com" };
  const now = new Date("2030-01-15T15:30:00.000Z");

  beforeAll(async () => {
    fx = await createAttendanceFoundationFixture();
    actor.userAccountId = fx.createdByUserId;
    await prisma.eventCheckInSettings.updateMany({
      where: { eventId: { in: [fx.eventId, fx.altEventId] } },
      data: { checkInEnabled: true, qrPassEnabled: true },
    });
  });

  afterAll(async () => {
    if (!fx) return;
    await prisma.auditEvent.deleteMany({
      where: {
        organizationId: fx.organizationId,
        action: {
          in: [
            "EVENT_QR_PASS_ISSUED",
            "EVENT_QR_PASS_ROTATED",
            "EVENT_QR_PASS_REVOKED",
          ],
        },
        entityType: "EventQrPass",
      },
    });
    await prisma.eventQrPass.deleteMany({
      where: {
        eventId: { in: [fx.eventId, fx.altEventId, fx.foreignEventId] },
      },
    });
    await fx.cleanup();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    mocks.findPrimaryOrganization.mockResolvedValue({ id: fx.organizationId });
    mocks.requireEventPermission.mockResolvedValue({
      canOperateCheckIn: true,
      canManageCheckIn: true,
      canManageRegistration: true,
      userAccountId: actor.userAccountId,
    });
    mocks.assertActionAllowed.mockResolvedValue(undefined);
  });

  async function wipe() {
    const passIds = (
      await prisma.eventQrPass.findMany({
        where: { eventId: { in: [fx.eventId, fx.altEventId] } },
        select: { id: true },
      })
    ).map((row) => row.id);
    if (passIds.length > 0) {
      await prisma.auditEvent.deleteMany({
        where: {
          organizationId: fx.organizationId,
          entityId: { in: passIds },
          action: {
            in: [
              "EVENT_QR_PASS_ISSUED",
              "EVENT_QR_PASS_ROTATED",
              "EVENT_QR_PASS_REVOKED",
            ],
          },
        },
      });
    }
    await prisma.eventQrPass.deleteMany({
      where: { eventId: { in: [fx.eventId, fx.altEventId] } },
    });
  }

  it("allows authorized staff to issue one eligible party pass", async () => {
    await wipe();
    const result = await issueQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        now,
      },
      actor,
    );

    expect(result.reused).toBe(false);
    expect(result.rawToken).toBeTruthy();
    expect(result.purpose).toBe("EVENT_CHECK_IN");
    expect(result.attendeeId).toBeNull();
    expect(result.expiresAt.getTime()).toBeGreaterThan(now.getTime());

    const stored = await prisma.eventQrPass.findUniqueOrThrow({
      where: { id: result.passId },
    });
    expect(stored.tokenHash).toBe(hashQrPassToken(result.rawToken!));
    expect(JSON.stringify(stored)).not.toContain(result.rawToken);
    expect(stored).not.toHaveProperty("rawToken");
    expect(stored).not.toHaveProperty("fallbackCode");

    const audits = await prisma.auditEvent.findMany({
      where: {
        organizationId: fx.organizationId,
        entityId: result.passId,
        action: "EVENT_QR_PASS_ISSUED",
      },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]?.changeMetadata)).not.toContain(
      result.rawToken,
    );
    expect(JSON.stringify(audits[0]?.changeMetadata)).not.toContain(
      stored.tokenHash,
    );
  });

  it("issues an attendee-bound pass for the same registration", async () => {
    await wipe();
    const result = await issueQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        attendeeId: fx.guestAttendeeId,
        now,
      },
      actor,
    );
    expect(result.attendeeId).toBe(fx.guestAttendeeId);
    expect(result.rawToken).toBeTruthy();
  });

  it("rejects ineligible registration statuses", async () => {
    await wipe();
    await prisma.eventRegistration.update({
      where: { id: fx.registrationId },
      data: { status: "WAITLISTED" },
    });
    await expect(
      issueQrPassLifecycle(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_NOT_ELIGIBLE" });
    await prisma.eventRegistration.update({
      where: { id: fx.registrationId },
      data: { status: "CONFIRMED" },
    });
  });

  it("rejects cross-tenant and mismatched event/registration/attendee refs", async () => {
    await wipe();
    await expect(
      issueQrPassLifecycle(
        {
          eventId: fx.foreignEventId,
          registrationId: fx.foreignRegistrationId,
          now,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(CheckInError);

    await expect(
      issueQrPassLifecycle(
        {
          eventId: fx.eventId,
          registrationId: fx.altRegistrationId,
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      issueQrPassLifecycle(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          attendeeId: fx.altAttendeeId,
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "ATTENDEE_NOT_FOUND" });
  });

  it("duplicate issue returns metadata without fabricating a raw token", async () => {
    await wipe();
    const first = await issueQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        now,
      },
      actor,
    );
    const second = await issueQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        now,
      },
      actor,
    );
    expect(second.reused).toBe(true);
    expect(second.rawToken).toBeNull();
    expect(second.passId).toBe(first.passId);

    const activeCount = await prisma.eventQrPass.count({
      where: {
        organizationId: fx.organizationId,
        registrationId: fx.registrationId,
        attendeeId: null,
        status: "ACTIVE",
      },
    });
    expect(activeCount).toBe(1);
  });

  it("bounds expiry to event end plus 24 hours", async () => {
    await wipe();
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: fx.eventId },
      select: { endDateTime: true },
    });
    const result = await issueQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        now,
      },
      actor,
    );
    const expected = new Date(
      Math.max(event.endDateTime.getTime(), now.getTime()) + 24 * 60 * 60 * 1000,
    );
    expect(result.expiresAt.toISOString()).toBe(expected.toISOString());
  });

  it("rotation invalidates the old pass and sets replacement lineage", async () => {
    await wipe();
    const issued = await issueQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        now,
      },
      actor,
    );
    const rotated = await rotateQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        now: new Date(now.getTime() + 1000),
      },
      actor,
    );

    expect(rotated.passId).not.toBe(issued.passId);
    expect(rotated.rawToken).toBeTruthy();
    expect(rotated.rawToken).not.toBe(issued.rawToken);

    const previous = await prisma.eventQrPass.findUniqueOrThrow({
      where: { id: issued.passId },
    });
    expect(previous.status).toBe("REPLACED");
    expect(previous.replacedByTokenId).toBe(rotated.passId);

    const active = await prisma.eventQrPass.findMany({
      where: {
        registrationId: fx.registrationId,
        attendeeId: null,
        status: "ACTIVE",
      },
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(rotated.passId);
  });

  it("simultaneous rotations leave one active successor (no lineage fork)", async () => {
    await wipe();
    await issueQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        now,
      },
      actor,
    );

    const [a, b] = await Promise.all([
      rotateQrPassLifecycle(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          now: new Date(now.getTime() + 2000),
        },
        actor,
      ),
      rotateQrPassLifecycle(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          now: new Date(now.getTime() + 2000),
        },
        actor,
      ),
    ]);

    const active = await prisma.eventQrPass.findMany({
      where: {
        registrationId: fx.registrationId,
        attendeeId: null,
        status: "ACTIVE",
      },
    });
    expect(active).toHaveLength(1);
    expect([a.passId, b.passId]).toContain(active[0]?.id);

    const replaced = await prisma.eventQrPass.findMany({
      where: {
        registrationId: fx.registrationId,
        status: "REPLACED",
      },
    });
    for (const row of replaced) {
      expect(row.replacedByTokenId).toBeTruthy();
    }
  });

  it("revocation is effective, historical, and idempotent with one audit", async () => {
    await wipe();
    const issued = await issueQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        now,
      },
      actor,
    );

    const first = await revokeQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        passId: issued.passId,
        now: new Date(now.getTime() + 3000),
      },
      actor,
    );
    expect(first.transitioned).toBe(true);
    expect(first.status).toBe("REVOKED");

    const second = await revokeQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        passId: issued.passId,
        now: new Date(now.getTime() + 4000),
      },
      actor,
    );
    expect(second.transitioned).toBe(false);
    expect(second.status).toBe("REVOKED");

    const stillThere = await prisma.eventQrPass.findUniqueOrThrow({
      where: { id: issued.passId },
    });
    expect(stillThere.status).toBe("REVOKED");

    const audits = await prisma.auditEvent.findMany({
      where: {
        organizationId: fx.organizationId,
        entityId: issued.passId,
        action: "EVENT_QR_PASS_REVOKED",
      },
    });
    expect(audits).toHaveLength(1);
  });

  it("simultaneous revocations produce one transition and one audit", async () => {
    await wipe();
    const issued = await issueQrPassLifecycle(
      {
        eventId: fx.eventId,
        registrationId: fx.registrationId,
        now,
      },
      actor,
    );

    const results = await Promise.all([
      revokeQrPassLifecycle(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          passId: issued.passId,
          now: new Date(now.getTime() + 5000),
        },
        actor,
      ),
      revokeQrPassLifecycle(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          passId: issued.passId,
          now: new Date(now.getTime() + 5000),
        },
        actor,
      ),
    ]);

    expect(results.filter((row) => row.transitioned)).toHaveLength(1);
    const audits = await prisma.auditEvent.findMany({
      where: {
        organizationId: fx.organizationId,
        entityId: issued.passId,
        action: "EVENT_QR_PASS_REVOKED",
      },
    });
    expect(audits).toHaveLength(1);
  });

  it("rolls back pass persistence when the surrounding transaction fails", async () => {
    await wipe();
    const { persistHashOnlyQrPass } = await import(
      "@/server/repositories/event-qr-pass.repository"
    );
    const { hashQrFallbackCode, hashQrPassToken, generateQrPassToken } =
      await import("@/lib/events/qr-pass-token");

    await expect(
      prisma.$transaction(async (tx) => {
        await persistHashOnlyQrPass(
          {
            organizationId: fx.organizationId,
            eventId: fx.eventId,
            registrationId: fx.registrationId,
            tokenHash: hashQrPassToken(generateQrPassToken()),
            fallbackCodeHash: hashQrFallbackCode("ROLLBACK01"),
            expiresAt: new Date(now.getTime() + 60_000),
            createdAt: now,
          },
          tx,
        );
        throw new Error("forced rollback after qr pass create");
      }),
    ).rejects.toThrow(/forced rollback/);

    expect(
      await prisma.eventQrPass.count({
        where: { registrationId: fx.registrationId },
      }),
    ).toBe(0);
  });

  it("rejects when QR passes are disabled in settings", async () => {
    await wipe();
    await prisma.eventCheckInSettings.update({
      where: { eventId: fx.eventId },
      data: { qrPassEnabled: false },
    });
    await expect(
      issueQrPassLifecycle(
        {
          eventId: fx.eventId,
          registrationId: fx.registrationId,
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "CHECK_IN_DISABLED" });
    await prisma.eventCheckInSettings.update({
      where: { eventId: fx.eventId },
      data: { qrPassEnabled: true },
    });
  });
});
