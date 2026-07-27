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
  checkInViaQrTokenForStaffApi,
  resolveQrTokenForStaffApi,
} from "@/server/services/qr-staff-check-in.service";

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

describe.runIf(dbReady)("Blueprint 7.3U QR staff check-in orchestration", () => {
  let fx: AttendanceFoundationFixture;
  const actor = { userAccountId: "" as string, email: "op@example.com" };
  const now = new Date("2030-01-15T15:30:00.000Z");

  beforeAll(async () => {
    fx = await createAttendanceFoundationFixture();
    actor.userAccountId = fx.createdByUserId;
    await prisma.eventCheckInSettings.updateMany({
      where: { eventId: fx.eventId },
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
    await prisma.eventAttendanceAction.deleteMany({
      where: { eventId: fx.eventId },
    });
    await prisma.eventAttendanceRecord.deleteMany({
      where: { eventId: fx.eventId },
    });
    await prisma.eventCheckInIdempotency.deleteMany({
      where: { eventId: fx.eventId },
    });
    await prisma.eventQrPass.deleteMany({ where: { eventId: fx.eventId } });
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

  async function wipeAttendance() {
    await prisma.eventAttendanceAction.deleteMany({
      where: { eventId: fx.eventId },
    });
    await prisma.eventAttendanceRecord.deleteMany({
      where: { eventId: fx.eventId },
    });
    await prisma.eventCheckInIdempotency.deleteMany({
      where: { eventId: fx.eventId },
    });
    await prisma.eventQrPass.deleteMany({ where: { eventId: fx.eventId } });
  }

  async function mintParty(raw = generateQrPassToken()) {
    await persistHashOnlyQrPass({
      organizationId: fx.organizationId,
      eventId: fx.eventId,
      registrationId: fx.registrationId,
      attendeeId: null,
      tokenHash: hashQrPassToken(raw),
      fallbackCodeHash: hashQrFallbackCode(generateQrFallbackCode()),
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    });
    return raw;
  }

  async function mintAttendee(raw = generateQrPassToken()) {
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
    return raw;
  }

  it("resolves party without mutating attendance", async () => {
    await wipeAttendance();
    const raw = await mintParty();
    const before = await prisma.eventAttendanceRecord.count({
      where: { eventId: fx.eventId },
    });
    const resolved = await resolveQrTokenForStaffApi(
      { eventId: fx.eventId, token: raw, now },
      actor,
    );
    expect(resolved.bindingType).toBe("PARTY");
    expect(resolved.eligibleAttendeeIds).toContain(fx.guestAttendeeId);
    expect(
      await prisma.eventAttendanceRecord.count({
        where: { eventId: fx.eventId },
      }),
    ).toBe(before);
  });

  it("checks in an attendee-bound pass and rejects conflicting selection", async () => {
    await wipeAttendance();
    const raw = await mintAttendee();

    await expect(
      checkInViaQrTokenForStaffApi(
        {
          eventId: fx.eventId,
          token: raw,
          attendeeIds: [fx.memberAttendeeId],
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const outcome = await checkInViaQrTokenForStaffApi(
      { eventId: fx.eventId, token: raw, now },
      actor,
    );
    expect(outcome.kind).toBe("SINGLE");
    if (outcome.kind === "SINGLE") {
      expect(outcome.result.attendeeId).toBe(fx.guestAttendeeId);
      expect(outcome.result.alreadyPresent).toBe(false);
    }

    const again = await checkInViaQrTokenForStaffApi(
      { eventId: fx.eventId, token: raw, now },
      actor,
    );
    expect(again.kind).toBe("SINGLE");
    if (again.kind === "SINGLE") {
      expect(again.result.alreadyPresent).toBe(true);
      expect(again.result.checkInCount).toBe(1);
    }
  });

  it("requires explicit party selection within eligible attendees", async () => {
    await wipeAttendance();
    const raw = await mintParty();

    await expect(
      checkInViaQrTokenForStaffApi(
        { eventId: fx.eventId, token: raw, now },
        actor,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await expect(
      checkInViaQrTokenForStaffApi(
        {
          eventId: fx.eventId,
          token: raw,
          attendeeIds: [fx.otherAttendeeId],
          now,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const outcome = await checkInViaQrTokenForStaffApi(
      {
        eventId: fx.eventId,
        token: raw,
        attendeeIds: [fx.guestAttendeeId],
        now,
      },
      actor,
    );
    expect(outcome.kind).toBe("PARTY");
    if (outcome.kind === "PARTY") {
      expect(outcome.result.attendees).toHaveLength(1);
      expect(outcome.result.attendees[0]?.attendeeId).toBe(fx.guestAttendeeId);
    }

    const memberPresent = await prisma.eventAttendanceRecord.findFirst({
      where: {
        eventId: fx.eventId,
        attendeeId: fx.memberAttendeeId,
        status: "PRESENT",
      },
    });
    expect(memberPresent).toBeNull();
  });

  it("rejects invalid tokens generically", async () => {
    await wipeAttendance();
    await expect(
      checkInViaQrTokenForStaffApi(
        { eventId: fx.eventId, token: "not-real", now },
        actor,
      ),
    ).rejects.toBeInstanceOf(CheckInError);
  });
});
