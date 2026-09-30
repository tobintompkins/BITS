import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  requireEventPermission: vi.fn(),
  searchEligibleAttendees: vi.fn(),
  checkInAttendeeById: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/event-permissions", () => ({
  requireEventPermission: mocks.requireEventPermission,
  getEventAccess: vi.fn(),
}));

vi.mock("@/server/repositories/event-check-in.repository", () => ({
  searchEligibleAttendees: mocks.searchEligibleAttendees,
}));

vi.mock("@/server/services/event-check-in.service", () => ({
  checkInAttendeeById: mocks.checkInAttendeeById,
}));

import {
  kioskCheckInAttendee,
  searchKioskCheckInAttendees,
} from "./check-in-kiosk.service";

const ORG_ID = "00000000-0000-4000-8000-00000000o001";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_EVENT_ID = "00000000-0000-4000-8000-00000000e999";

describe("searchKioskCheckInAttendees", () => {
  beforeEach(() => {
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
    mocks.requireEventPermission.mockImplementation(
      async (
        _organizationId: string,
        predicate: (access: { canOperateCheckIn: boolean; canReadCheckIn: boolean }) => boolean,
        message: string,
      ) => {
        if (
          !predicate({ canOperateCheckIn: true, canReadCheckIn: true })
        ) {
          throw new Error(message);
        }
        return { canOperateCheckIn: true };
      },
    );
    mocks.searchEligibleAttendees.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 8,
    });
  });

  it("requires canOperateCheckIn even when the role can read check-in", async () => {
    mocks.requireEventPermission.mockImplementation(
      async (
        _organizationId: string,
        predicate: (access: { canOperateCheckIn: boolean; canReadCheckIn: boolean }) => boolean,
        message: string,
      ) => {
        if (
          !predicate({ canOperateCheckIn: false, canReadCheckIn: true })
        ) {
          throw new Error(message);
        }
        return { canOperateCheckIn: false };
      },
    );

    await expect(
      searchKioskCheckInAttendees(EVENT_ID, "Jane"),
    ).rejects.toThrow(/permission/i);
    expect(mocks.searchEligibleAttendees).not.toHaveBeenCalled();
  });

  it("scopes search to the current organization and event and strips sensitive fields", async () => {
    mocks.searchEligibleAttendees.mockResolvedValue({
      items: [
        {
          id: "00000000-0000-4000-8000-00000000a001",
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.test",
          phone: "207-555-0100",
          dateOfBirth: new Date("2016-01-01"),
          guardianName: "Alex Doe",
          dietaryNotes: "Allergy",
          status: "CONFIRMED",
          registration: {
            id: "reg-1",
            confirmationCode: "ABC123",
            status: "CONFIRMED",
            primaryContactName: "Alex Doe",
          },
          attendanceRecords: [],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 8,
    });

    const result = await searchKioskCheckInAttendees(EVENT_ID, "Jane");

    expect(mocks.searchEligibleAttendees).toHaveBeenCalledWith(
      ORG_ID,
      EVENT_ID,
      "Jane",
      1,
      8,
    );
    expect(mocks.searchEligibleAttendees.mock.calls[0][1]).not.toBe(
      OTHER_EVENT_ID,
    );
    expect(result.items).toEqual([
      {
        id: "00000000-0000-4000-8000-00000000a001",
        displayName: "Jane D.",
        status: "eligible",
        statusLabel: "Ready to check in",
        canCheckIn: true,
      },
    ]);
    const payload = JSON.stringify(result.items);
    expect(payload).not.toContain("jane@example.test");
    expect(payload).not.toContain("Allergy");
    expect(payload).not.toContain("ABC123");
  });
});

describe("kioskCheckInAttendee", () => {
  it("reuses the existing staff search check-in path", async () => {
    const actor = { userAccountId: "user-1", email: "staff@example.test" };
    mocks.checkInAttendeeById.mockResolvedValue({
      alreadyPresent: false,
      attendance: { id: "att-1" },
    });

    await kioskCheckInAttendee(
      {
        eventId: EVENT_ID,
        attendeeId: "00000000-0000-4000-8000-00000000a001",
        operationKey: "op-1",
      },
      actor,
    );

    expect(mocks.checkInAttendeeById).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        attendeeId: "00000000-0000-4000-8000-00000000a001",
        source: "STAFF_SEARCH",
        operationKey: "op-1",
      },
      actor,
    );
  });
});
