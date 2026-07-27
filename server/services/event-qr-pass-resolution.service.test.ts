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
import { QrPassRawTokenInput } from "@/lib/events/qr-pass-raw-token-input";
import {
  generateQrFallbackCode,
  generateQrPassToken,
  hashQrFallbackCode,
  hashQrPassToken,
} from "@/lib/events/qr-pass-token";
import {
  createAttendanceFoundationFixture,
  type AttendanceFoundationFixture,
} from "@/server/repositories/event-attendance.fixtures";
import { persistHashOnlyQrPass } from "@/server/repositories/event-qr-pass.repository";
import {
  eventQrPassResolutionApi,
  resolveQrPassForCheckIn,
} from "@/server/services/event-qr-pass-resolution.service";

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

describe("Blueprint 7.3T resolution API surface", () => {
  it("exposes only resolve (no check-in / issue / scan helpers)", () => {
    expect(Object.keys(eventQrPassResolutionApi)).toEqual([
      "resolveQrPassForCheckIn",
    ]);
    expect(eventQrPassResolutionApi).not.toHaveProperty("checkIn");
    expect(eventQrPassResolutionApi).not.toHaveProperty("issueQrPass");
  });
});

describe.runIf(dbReady)("Blueprint 7.3T QR pass resolution (database)", () => {
  let fx: AttendanceFoundationFixture;
  const actor = { userAccountId: "" as string, email: "op@example.com" };
  const now = new Date("2030-01-15T15:30:00.000Z");

  beforeAll(async () => {
    fx = await createAttendanceFoundationFixture();
    actor.userAccountId = fx.createdByUserId;
    await prisma.eventCheckInSettings.updateMany({
      where: { eventId: { in: [fx.eventId, fx.altEventId] } },
      data: {
        checkInEnabled: true,
        qrPassEnabled: true,
        checkInOpensAt: null,
        checkInClosesAt: null,
      },
    });
    await prisma.eventRegistration.update({
      where: { id: fx.registrationId },
      data: { status: "CONFIRMED" },
    });
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

  beforeEach(() => {
    mocks.findPrimaryOrganization.mockResolvedValue({ id: fx.organizationId });
    mocks.requireEventPermission.mockResolvedValue({
      canOperateCheckIn: true,
      userAccountId: actor.userAccountId,
    });
    mocks.assertActionAllowed.mockResolvedValue(undefined);
  });

  async function wipe() {
    await prisma.eventQrPass.deleteMany({
      where: { eventId: { in: [fx.eventId, fx.altEventId] } },
    });
  }

  async function mintParty(raw = generateQrPassToken()) {
    const pass = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: null,
      tokenHash: hashQrPassToken(raw),
      fallbackCodeHash: hashQrFallbackCode(generateQrFallbackCode()),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      createdAt: now,
    });
    return { raw, pass };
  }

  it("resolves a valid party token to a safe party binding", async () => {
    await wipe();
    const { raw, pass } = await mintParty();
    const result = await resolveQrPassForCheckIn(
      {
        eventId: fx.eventId,
        rawToken: QrPassRawTokenInput.fromUnknown(raw)!,
        now,
      },
      actor,
    );

    expect(result.eligibility).toBe("USABLE");
    expect(result.bindingType).toBe("PARTY");
    expect(result.passId).toBe(pass.id);
    expect(result.registrationId).toBe(fx.registrationId);
    expect(result.attendeeId).toBeNull();
    expect(result.eligibleAttendeeIds).toEqual(
      expect.arrayContaining([fx.guestAttendeeId, fx.memberAttendeeId]),
    );
    expect(result).not.toHaveProperty("tokenHash");
    expect(result).not.toHaveProperty("rawToken");
    expect(result).not.toHaveProperty("organizationId");
    expect(JSON.stringify(result)).not.toContain(raw);
    expect(JSON.stringify(result)).not.toContain(pass.tokenHash);
  });

  it("resolves an attendee-bound token to that attendee only", async () => {
    await wipe();
    const raw = generateQrPassToken();
    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: fx.guestAttendeeId,
      tokenHash: hashQrPassToken(raw),
      fallbackCodeHash: hashQrFallbackCode(generateQrFallbackCode()),
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });

    const result = await resolveQrPassForCheckIn(
      { eventId: fx.eventId, rawToken: raw, now },
      actor,
    );
    expect(result.bindingType).toBe("ATTENDEE");
    expect(result.attendeeId).toBe(fx.guestAttendeeId);
    expect(result.eligibleAttendeeIds).toEqual([fx.guestAttendeeId]);
  });

  it("masks unknown, overlong, cross-event, and cross-tenant tokens identically", async () => {
    await wipe();
    const { raw } = await mintParty();

    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.eventId, rawToken: "not-a-real-token", now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QR_PASS" });

    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.eventId, rawToken: "x".repeat(200), now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QR_PASS" });

    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.altEventId, rawToken: raw, now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QR_PASS" });

    mocks.findPrimaryOrganization.mockResolvedValueOnce({
      id: fx.otherOrganizationId,
    });
    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.foreignEventId, rawToken: raw, now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QR_PASS" });
  });

  it("treats expired, revoked, and replaced tokens as unusable", async () => {
    await wipe();
    const expiredRaw = generateQrPassToken();
    const expired = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash: hashQrPassToken(expiredRaw),
      fallbackCodeHash: hashQrFallbackCode(generateQrFallbackCode()),
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
      expiresAt: new Date("2020-01-02T00:00:00.000Z"),
    });
    // Clock-stale ACTIVE rows still occupy the unique index until marked EXPIRED.
    await prisma.eventQrPass.update({
      where: { id: expired.id },
      data: { status: "EXPIRED" },
    });
    // Re-persist as ACTIVE with past expiry via raw SQL to exercise clock check.
    await prisma.$executeRaw`
      UPDATE "event_qr_passes"
      SET "status" = 'ACTIVE',
          "expiresAt" = ${new Date("2020-01-02T00:00:00.000Z")},
          "createdAt" = ${new Date("2020-01-01T00:00:00.000Z")}
      WHERE "id" = ${expired.id}::uuid
    `;
    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.eventId, rawToken: expiredRaw, now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QR_PASS" });
    await prisma.eventQrPass.update({
      where: { id: expired.id },
      data: { status: "EXPIRED" },
    });

    const revokedRaw = generateQrPassToken();
    const revoked = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.otherRegistrationId,
      tokenHash: hashQrPassToken(revokedRaw),
      fallbackCodeHash: hashQrFallbackCode(generateQrFallbackCode()),
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });
    await prisma.eventQrPass.update({
      where: { id: revoked.id },
      data: { status: "REVOKED", revokedAt: now },
    });
    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.eventId, rawToken: revokedRaw, now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QR_PASS" });

    const oldRaw = generateQrPassToken();
    const successorRaw = generateQrPassToken();
    const successor = await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash: hashQrPassToken(successorRaw),
      fallbackCodeHash: hashQrFallbackCode(generateQrFallbackCode()),
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });
    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      tokenHash: hashQrPassToken(oldRaw),
      fallbackCodeHash: hashQrFallbackCode(generateQrFallbackCode()),
      status: "REPLACED",
      revokedAt: now,
      replacedByTokenId: successor.id,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });
    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.eventId, rawToken: oldRaw, now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_QR_PASS" });
  });

  it("rejects ineligible registration and disabled check-in after scoped token", async () => {
    await wipe();
    const { raw } = await mintParty();

    await prisma.eventRegistration.update({
      where: { id: fx.registrationId },
      data: { status: "CANCELLED" },
    });
    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.eventId, rawToken: raw, now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "REGISTRATION_NOT_ELIGIBLE" });
    await prisma.eventRegistration.update({
      where: { id: fx.registrationId },
      data: { status: "CONFIRMED" },
    });

    await prisma.eventCheckInSettings.update({
      where: { eventId: fx.eventId },
      data: { checkInEnabled: false },
    });
    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.eventId, rawToken: raw, now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "CHECK_IN_DISABLED" });
    await prisma.eventCheckInSettings.update({
      where: { eventId: fx.eventId },
      data: { checkInEnabled: true },
    });
  });

  it("does not mutate token or attendance state on repeated resolution", async () => {
    await wipe();
    const { raw, pass } = await mintParty();
    const beforeAttendance = await prisma.eventAttendanceRecord.count({
      where: { eventId: fx.eventId },
    });
    const beforeActions = await prisma.eventAttendanceAction.count({
      where: { eventId: fx.eventId },
    });

    const first = await resolveQrPassForCheckIn(
      { eventId: fx.eventId, rawToken: raw, now },
      actor,
    );
    const second = await resolveQrPassForCheckIn(
      { eventId: fx.eventId, rawToken: `BITS-CI:${raw}`, now },
      actor,
    );
    expect(second.passId).toBe(first.passId);

    const stored = await prisma.eventQrPass.findUniqueOrThrow({
      where: { id: pass.id },
    });
    expect(stored.lastUsedAt).toBeNull();
    expect(stored.status).toBe("ACTIVE");
    expect(
      await prisma.eventAttendanceRecord.count({
        where: { eventId: fx.eventId },
      }),
    ).toBe(beforeAttendance);
    expect(
      await prisma.eventAttendanceAction.count({
        where: { eventId: fx.eventId },
      }),
    ).toBe(beforeActions);
  });

  it("denies unauthorized staff without revealing pass data", async () => {
    await wipe();
    const { raw } = await mintParty();
    mocks.requireEventPermission.mockImplementationOnce(async () => {
      throw new Error("You do not have permission to resolve QR passes.");
    });
    await expect(
      resolveQrPassForCheckIn(
        { eventId: fx.eventId, rawToken: raw, now },
        actor,
      ),
    ).rejects.toBeInstanceOf(CheckInError);
  });
});
