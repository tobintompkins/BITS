import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  staffReenterRegisteredAttendee: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/services/staff-check-out.service", () => ({
  staffCheckOutRegisteredAttendee: vi.fn(),
  staffReenterRegisteredAttendee: mocks.staffReenterRegisteredAttendee,
}));

import { POST } from "@/app/api/events/[id]/re-entries/route";
import { CheckInError } from "@/lib/errors/check-in-errors";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const ATTENDEE_ID = "00000000-0000-4000-8000-00000000a001";
const ATTENDANCE_ID = "00000000-0000-4000-8000-00000000c001";

function makeRequest(
  body: unknown,
  options?: { headers?: Record<string, string> },
) {
  return new Request(`http://localhost/api/events/${EVENT_ID}/re-entries`, {
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

describe("POST /api/events/[id]/re-entries (7.3X)", () => {
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
    mocks.staffReenterRegisteredAttendee.mockResolvedValue({
      attendanceId: ATTENDANCE_ID,
      eventId: EVENT_ID,
      attendeeId: ATTENDEE_ID,
      status: "PRESENT",
      firstCheckedInAt: new Date("2030-01-15T15:00:00.000Z"),
      lastCheckedInAt: new Date("2030-01-15T16:30:00.000Z"),
      checkedOutAt: null,
      checkInCount: 2,
      outcome: "REENTERED",
    });
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(401);
    expect(mocks.staffReenterRegisteredAttendee).not.toHaveBeenCalled();
  });

  it("invokes 7.3W once and returns only safe fields", async () => {
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.data.outcome).toBe("REENTERED");
    expect(json.data.checkInCount).toBe(2);
    expect(json.data.checkedOutAt).toBeNull();
    expect(json.data).not.toHaveProperty("email");
    expect(mocks.staffReenterRegisteredAttendee).toHaveBeenCalledTimes(1);
  });

  it("returns 200 for already-present idempotent outcomes", async () => {
    mocks.staffReenterRegisteredAttendee.mockResolvedValueOnce({
      attendanceId: ATTENDANCE_ID,
      eventId: EVENT_ID,
      attendeeId: ATTENDEE_ID,
      status: "PRESENT",
      firstCheckedInAt: new Date("2030-01-15T15:00:00.000Z"),
      lastCheckedInAt: new Date("2030-01-15T16:30:00.000Z"),
      checkedOutAt: null,
      checkInCount: 2,
      outcome: "ALREADY_PRESENT",
    });
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(200);
  });

  it("maps re-entry disabled as conflict", async () => {
    mocks.staffReenterRegisteredAttendee.mockRejectedValueOnce(
      new CheckInError("REENTRY_DISABLED", "Re-entry is disabled."),
    );
    const response = await POST(makeRequest({ attendeeId: ATTENDEE_ID }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("REENTRY_DISABLED");
  });

  it("rejects non-JSON content type", async () => {
    const request = new Request(
      `http://localhost/api/events/${EVENT_ID}/re-entries`,
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          host: "localhost",
        },
        body: "nope",
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(415);
    expect(mocks.staffReenterRegisteredAttendee).not.toHaveBeenCalled();
  });
});
