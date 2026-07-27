import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildStaffPartyCheckInRequest,
  mapStaffPartyCheckInFailureMessage,
  submitStaffPartyCheckIn,
} from "@/lib/api/staff-party-check-in-client";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const REGISTRATION_ID = "00000000-0000-4000-8000-00000000d001";
const A = "00000000-0000-4000-8000-00000000a001";
const B = "00000000-0000-4000-8000-00000000a002";

describe("staff party check-in client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a 7.3G request with only selected attendeeIds", () => {
    const { url, init } = buildStaffPartyCheckInRequest({
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID,
      attendeeIds: [A, B],
      idempotencyKey: "party-1",
    });

    expect(url).toBe(
      `/api/events/${EVENT_ID}/registrations/${REGISTRATION_ID}/check-ins`,
    );
    expect(JSON.parse(init.body)).toEqual({ attendeeIds: [A, B] });
    expect(init.body).not.toMatch(/organizationId|source|actor|all/);
    expect(init.headers).toMatchObject({
      "Idempotency-Key": "party-1",
    });
  });

  it("parses aggregate and per-attendee outcomes without optimistic assumptions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          eventId: EVENT_ID,
          registrationId: REGISTRATION_ID,
          requestedCount: 2,
          newlyCheckedInCount: 1,
          alreadyPresentCount: 1,
          attendees: [
            {
              attendeeId: A,
              attendanceId: "00000000-0000-4000-8000-00000000c001",
              status: "PRESENT",
              firstCheckedInAt: "2030-01-15T15:30:00.000Z",
              lastCheckedInAt: "2030-01-15T15:30:00.000Z",
              checkInCount: 1,
              outcome: "ALREADY_PRESENT",
            },
            {
              attendeeId: B,
              attendanceId: "00000000-0000-4000-8000-00000000c002",
              status: "PRESENT",
              firstCheckedInAt: "2030-01-15T15:45:00.000Z",
              lastCheckedInAt: "2030-01-15T15:45:00.000Z",
              checkInCount: 1,
              outcome: "CHECKED_IN",
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitStaffPartyCheckIn({
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID,
      attendeeIds: [A, B],
      idempotencyKey: "k",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.newlyCheckedInCount).toBe(1);
      expect(result.data.alreadyPresentCount).toBe(1);
      expect(result.data.attendees.map((row) => row.outcome)).toEqual([
        "ALREADY_PRESENT",
        "CHECKED_IN",
      ]);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps atomic failures safely and does not retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: "Cancelled attendees cannot check in.",
        code: "ATTENDEE_CANCELLED",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitStaffPartyCheckIn({
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID,
      attendeeIds: [A, B],
      idempotencyKey: "once",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(mapStaffPartyCheckInFailureMessage(result)).toMatch(/not eligible/i);
      expect(mapStaffPartyCheckInFailureMessage(result)).not.toMatch(
        /stack|prisma|select/i,
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps network and auth failures safely", () => {
    expect(
      mapStaffPartyCheckInFailureMessage({
        ok: false,
        status: 0,
        error: "Network error. Check your connection and try again.",
      }),
    ).toMatch(/network/i);

    expect(
      mapStaffPartyCheckInFailureMessage({
        ok: false,
        status: 401,
        error: "Unauthorized",
      }),
    ).toMatch(/session/i);
  });
});
