import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  staffCheckOutRegisteredAttendee: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/services/staff-check-out.service", () => ({
  staffCheckOutRegisteredAttendee: mocks.staffCheckOutRegisteredAttendee,
  staffReenterRegisteredAttendee: vi.fn(),
}));

import { POST } from "@/app/api/events/[id]/check-outs/route";
import { CheckInError } from "@/lib/errors/check-in-errors";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const ATTENDEE_ID = "00000000-0000-4000-8000-00000000a001";
const ATTENDANCE_ID = "00000000-0000-4000-8000-00000000c001";
const STATION_ID = "00000000-0000-4000-8000-00000000b001";

function makeRequest(
  body: unknown,
  options?: { headers?: Record<string, string>; eventId?: string },
) {
  const eventId = options?.eventId ?? EVENT_ID;
  return new Request(`http://localhost/api/events/${eventId}/check-outs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost",
      origin: "http://localhost",
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/events/[id]/check-outs (7.3X)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "staff@example.com" },
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "user-1",
      primaryEmail: "staff@example.com",
    });
    mocks.staffCheckOutRegisteredAttendee.mockResolvedValue({
      attendanceId: ATTENDANCE_ID,
      eventId: EVENT_ID,
      attendeeId: ATTENDEE_ID,
      status: "CHECKED_OUT",
      firstCheckedInAt: new Date("2030-01-15T15:00:00.000Z"),
      lastCheckedInAt: new Date("2030-01-15T15:00:00.000Z"),
      checkedOutAt: new Date("2030-01-15T16:00:00.000Z"),
      checkInCount: 1,
      outcome: "CHECKED_OUT",
    });
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(401);
    expect(mocks.staffCheckOutRegisteredAttendee).not.toHaveBeenCalled();
  });

  it("invokes 7.3W once and returns only safe fields", async () => {
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(Object.keys(json.data).sort()).toEqual([
      "attendanceId",
      "attendeeId",
      "checkInCount",
      "checkedOutAt",
      "eventId",
      "firstCheckedInAt",
      "lastCheckedInAt",
      "outcome",
      "status",
    ]);
    expect(json.data).not.toHaveProperty("email");
    expect(json.data).not.toHaveProperty("firstName");
    expect(mocks.staffCheckOutRegisteredAttendee).toHaveBeenCalledTimes(1);
    expect(mocks.staffCheckOutRegisteredAttendee).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        attendeeId: ATTENDEE_ID,
        stationId: undefined,
        operationKey: undefined,
      },
      expect.objectContaining({ userAccountId: "user-1" }),
    );
  });

  it("returns 200 for already-checked-out idempotent outcomes", async () => {
    mocks.staffCheckOutRegisteredAttendee.mockResolvedValueOnce({
      attendanceId: ATTENDANCE_ID,
      eventId: EVENT_ID,
      attendeeId: ATTENDEE_ID,
      status: "CHECKED_OUT",
      firstCheckedInAt: new Date("2030-01-15T15:00:00.000Z"),
      lastCheckedInAt: new Date("2030-01-15T15:00:00.000Z"),
      checkedOutAt: new Date("2030-01-15T16:00:00.000Z"),
      checkInCount: 1,
      outcome: "ALREADY_CHECKED_OUT",
    });
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.outcome).toBe("ALREADY_CHECKED_OUT");
  });

  it("passes optional stationId and Idempotency-Key through", async () => {
    const response = await POST(
      makeRequest(
        { attendeeId: ATTENDEE_ID, stationId: STATION_ID },
        { headers: { "idempotency-key": "checkout-key-1" } },
      ),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.staffCheckOutRegisteredAttendee).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        attendeeId: ATTENDEE_ID,
        stationId: STATION_ID,
        operationKey: "checkout-key-1",
      },
      expect.any(Object),
    );
  });

  it("rejects unknown body fields and soft-CSRF mismatches", async () => {
    const unknown = await POST(
      makeRequest({ attendeeId: ATTENDEE_ID, organizationId: "x" }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(unknown.status).toBe(400);
    expect(mocks.staffCheckOutRegisteredAttendee).not.toHaveBeenCalled();

    const csrf = await POST(
      makeRequest(
        { attendeeId: ATTENDEE_ID },
        { headers: { origin: "http://evil.example", host: "localhost" } },
      ),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(csrf.status).toBe(403);
  });

  it("maps disabled check-out and forbidden safely", async () => {
    mocks.staffCheckOutRegisteredAttendee.mockRejectedValueOnce(
      new CheckInError("CHECK_OUT_DISABLED", "Check-out is disabled."),
    );
    const disabled = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(disabled.status).toBe(409);
    expect((await disabled.json()).code).toBe("CHECK_OUT_DISABLED");

    mocks.staffCheckOutRegisteredAttendee.mockRejectedValueOnce(
      new CheckInError("FORBIDDEN", "no"),
    );
    const forbidden = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(forbidden.status).toBe(403);
  });
});
