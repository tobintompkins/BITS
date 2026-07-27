import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  staffCheckInRegisteredAttendee: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/services/staff-check-in.service", () => ({
  staffCheckInRegisteredAttendee: mocks.staffCheckInRegisteredAttendee,
}));

import { POST } from "@/app/api/events/[id]/check-ins/route";
import { CheckInError } from "@/lib/errors/check-in-errors";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const ATTENDEE_ID = "00000000-0000-4000-8000-00000000a001";
const STATION_ID = "00000000-0000-4000-8000-00000000b001";

function makeRequest(
  body: unknown,
  options?: { headers?: Record<string, string>; eventId?: string },
) {
  const eventId = options?.eventId ?? EVENT_ID;
  return new Request(`http://localhost/api/events/${eventId}/check-ins`, {
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

describe("POST /api/events/[id]/check-ins", () => {
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
    mocks.staffCheckInRegisteredAttendee.mockResolvedValue({
      attendanceId: "00000000-0000-4000-8000-00000000c001",
      eventId: EVENT_ID,
      attendeeId: ATTENDEE_ID,
      status: "PRESENT",
      firstCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
      lastCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
      checkInCount: 1,
      alreadyPresent: false,
    });
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(401);
    expect(mocks.staffCheckInRegisteredAttendee).not.toHaveBeenCalled();
  });

  it("invokes the 7.3C service once and returns only safe fields", async () => {
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(Object.keys(json.data).sort()).toEqual([
      "alreadyPresent",
      "attendanceId",
      "attendeeId",
      "checkInCount",
      "eventId",
      "firstCheckedInAt",
      "lastCheckedInAt",
      "status",
    ]);
    expect(json.data).not.toHaveProperty("email");
    expect(mocks.staffCheckInRegisteredAttendee).toHaveBeenCalledTimes(1);
    expect(mocks.staffCheckInRegisteredAttendee).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        attendeeId: ATTENDEE_ID,
        stationId: undefined,
        operationKey: undefined,
      },
      expect.objectContaining({ userAccountId: "user-1" }),
    );
  });

  it("passes optional stationId to the 7.3M service without station domain logic", async () => {
    const response = await POST(
      makeRequest({ attendeeId: ATTENDEE_ID, stationId: STATION_ID }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(response.status).toBe(201);
    expect(mocks.staffCheckInRegisteredAttendee).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT_ID,
        attendeeId: ATTENDEE_ID,
        stationId: STATION_ID,
      }),
      expect.any(Object),
    );
    const json = await response.json();
    expect(json.data).not.toHaveProperty("stationId");
    expect(json.data).not.toHaveProperty("deviceLabel");
  });

  it("rejects blank and malformed stationId at the API boundary", async () => {
    const blank = await POST(
      makeRequest({ attendeeId: ATTENDEE_ID, stationId: "" }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(blank.status).toBe(400);
    expect(mocks.staffCheckInRegisteredAttendee).not.toHaveBeenCalled();

    const malformed = await POST(
      makeRequest({ attendeeId: ATTENDEE_ID, stationId: "not-a-uuid" }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(malformed.status).toBe(400);
  });

  it("maps closed and missing stations safely", async () => {
    mocks.staffCheckInRegisteredAttendee.mockRejectedValueOnce(
      new CheckInError("STATION_CLOSED", "This check-in station is closed."),
    );
    const closed = await POST(
      makeRequest({ attendeeId: ATTENDEE_ID, stationId: STATION_ID }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(closed.status).toBe(409);
    expect(await closed.json()).toMatchObject({ code: "STATION_CLOSED" });

    mocks.staffCheckInRegisteredAttendee.mockRejectedValueOnce(
      new CheckInError("NOT_FOUND", "Check-in station not found."),
    );
    const missing = await POST(
      makeRequest({ attendeeId: ATTENDEE_ID, stationId: STATION_ID }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("passes Idempotency-Key through as operationKey", async () => {
    await POST(
      makeRequest(
        { attendeeId: ATTENDEE_ID },
        { headers: { "idempotency-key": "retry-1" } },
      ),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(mocks.staffCheckInRegisteredAttendee).toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: "retry-1" }),
      expect.any(Object),
    );
  });

  it("rejects malformed ids and unknown body fields", async () => {
    const badId = await POST(makeRequest({ attendeeId: "bad" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(badId.status).toBe(400);

    const unknown = await POST(
      makeRequest({
        attendeeId: ATTENDEE_ID,
        source: "WALK_IN",
      }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(unknown.status).toBe(400);
    expect(mocks.staffCheckInRegisteredAttendee).not.toHaveBeenCalled();
  });

  it("maps domain and unexpected errors safely", async () => {
    mocks.staffCheckInRegisteredAttendee.mockRejectedValueOnce(
      new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found."),
    );
    const missing = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(missing.status).toBe(404);

    mocks.staffCheckInRegisteredAttendee.mockRejectedValueOnce(
      new CheckInError("CHECK_IN_DISABLED", "Check-in is disabled."),
    );
    const disabled = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(disabled.status).toBe(409);

    mocks.staffCheckInRegisteredAttendee.mockRejectedValueOnce(
      new Error("SELECT * FROM secret_table failed"),
    );
    const unexpected = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(unexpected.status).toBe(500);
    expect(await unexpected.text()).not.toMatch(/secret_table/);
  });

  it("rejects cross-origin browser requests", async () => {
    const response = await POST(
      makeRequest(
        { attendeeId: ATTENDEE_ID },
        { headers: { origin: "http://evil.example", host: "localhost" } },
      ),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(response.status).toBe(403);
    expect(mocks.staffCheckInRegisteredAttendee).not.toHaveBeenCalled();
  });

  it("returns 200 for already-present idempotent success", async () => {
    mocks.staffCheckInRegisteredAttendee.mockResolvedValueOnce({
      attendanceId: "00000000-0000-4000-8000-00000000c001",
      eventId: EVENT_ID,
      attendeeId: ATTENDEE_ID,
      status: "PRESENT",
      firstCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
      lastCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
      checkInCount: 1,
      alreadyPresent: true,
    });
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.alreadyPresent).toBe(true);
  });

  it("requires the check-in operate permission via the 7.3C service", async () => {
    mocks.staffCheckInRegisteredAttendee.mockRejectedValueOnce(
      new CheckInError(
        "FORBIDDEN",
        "You do not have permission to check in attendees.",
      ),
    );
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(403);
  });
});
