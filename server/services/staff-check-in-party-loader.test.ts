import "dotenv/config";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  requireEventPermission: vi.fn(),
  findFirstRegistration: vi.fn(),
  findManyAttendance: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/event-permissions", () => ({
  requireEventPermission: mocks.requireEventPermission,
  getEventAccess: vi.fn(),
}));

vi.mock("@/server/repositories/event-attendance.repository", () => ({
  findAttendanceByEventAttendee: vi.fn(),
  lockAttendanceForEventAttendee: vi.fn(),
}));

vi.mock("@/server/repositories/event-check-in.repository", () => ({
  findCheckInSettings: vi.fn(),
  lockCheckInSettingsForEvent: vi.fn(),
  prisma: {
    eventRegistration: {
      findFirst: mocks.findFirstRegistration,
    },
    eventAttendanceRecord: {
      findMany: mocks.findManyAttendance,
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  assertActionAllowed: vi.fn(),
}));

import { getStaffCheckInPartyAttendees } from "@/server/services/staff-check-in.service";

describe("getStaffCheckInPartyAttendees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({ id: "org-1" });
    mocks.requireEventPermission.mockResolvedValue({
      canOperateCheckIn: true,
    });
  });

  it("returns only safe fields for a same-event registration", async () => {
    mocks.findFirstRegistration.mockResolvedValue({
      id: "reg-1",
      eventId: "event-1",
      confirmationCode: "ABC123",
      status: "CONFIRMED",
      attendees: [
        {
          id: "a1",
          firstName: "Ada",
          lastName: "Lovelace",
          status: "REGISTERED",
        },
      ],
    });
    mocks.findManyAttendance.mockResolvedValue([
      { attendeeId: "a1", status: "EXPECTED" },
    ]);

    const party = await getStaffCheckInPartyAttendees("event-1", "reg-1");
    expect(party).toEqual({
      eventId: "event-1",
      registrationId: "reg-1",
      confirmationCode: "ABC123",
      registrationStatus: "CONFIRMED",
      attendees: [
        {
          id: "a1",
          firstName: "Ada",
          lastName: "Lovelace",
          status: "REGISTERED",
          attendanceStatus: "EXPECTED",
        },
      ],
    });
    expect(JSON.stringify(party)).not.toMatch(/secret@example|nuts|dietary/i);
    expect(mocks.findFirstRegistration).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org-1",
          eventId: "event-1",
          id: "reg-1",
        },
      }),
    );
  });

  it("rejects unauthorized actors", async () => {
    mocks.requireEventPermission.mockRejectedValueOnce(
      new Error("You do not have permission to check in attendees."),
    );
    await expect(
      getStaffCheckInPartyAttendees("event-1", "reg-1"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
