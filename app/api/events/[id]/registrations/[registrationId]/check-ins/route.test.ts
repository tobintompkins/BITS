import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  staffCheckInSelectedParty: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/services/staff-check-in.service", () => ({
  staffCheckInSelectedParty: mocks.staffCheckInSelectedParty,
}));

import { POST } from "@/app/api/events/[id]/registrations/[registrationId]/check-ins/route";
import { CheckInError } from "@/lib/errors/check-in-errors";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const REGISTRATION_ID = "00000000-0000-4000-8000-00000000d001";
const ATTENDEE_A = "00000000-0000-4000-8000-00000000a001";
const ATTENDEE_B = "00000000-0000-4000-8000-00000000a002";
const STATION_ID = "00000000-0000-4000-8000-00000000b001";

function makeRequest(
  body: unknown,
  options?: {
    headers?: Record<string, string>;
    eventId?: string;
    registrationId?: string;
  },
) {
  const eventId = options?.eventId ?? EVENT_ID;
  const registrationId = options?.registrationId ?? REGISTRATION_ID;
  return new Request(
    `http://localhost/api/events/${eventId}/registrations/${registrationId}/check-ins`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost",
        origin: "http://localhost",
        ...(options?.headers ?? {}),
      },
      body: JSON.stringify(body),
    },
  );
}

function context(
  eventId = EVENT_ID,
  registrationId = REGISTRATION_ID,
) {
  return {
    params: Promise.resolve({ id: eventId, registrationId }),
  };
}

describe("POST /api/events/[id]/registrations/[registrationId]/check-ins", () => {
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
    mocks.staffCheckInSelectedParty.mockResolvedValue({
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID,
      requestedCount: 2,
      newlyCheckedInCount: 2,
      alreadyPresentCount: 0,
      attendees: [
        {
          attendeeId: ATTENDEE_A,
          attendanceId: "00000000-0000-4000-8000-00000000c001",
          status: "PRESENT",
          firstCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
          lastCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
          checkInCount: 1,
          outcome: "CHECKED_IN",
        },
        {
          attendeeId: ATTENDEE_B,
          attendanceId: "00000000-0000-4000-8000-00000000c002",
          status: "PRESENT",
          firstCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
          lastCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
          checkInCount: 1,
          outcome: "CHECKED_IN",
        },
      ],
    });
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const response = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A] }),
      context(),
    );
    expect(response.status).toBe(401);
    expect(mocks.staffCheckInSelectedParty).not.toHaveBeenCalled();
  });

  it("invokes the 7.3F service once and returns only safe fields", async () => {
    const response = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A, ATTENDEE_B] }),
      context(),
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(Object.keys(json.data).sort()).toEqual([
      "alreadyPresentCount",
      "attendees",
      "eventId",
      "newlyCheckedInCount",
      "registrationId",
      "requestedCount",
    ]);
    expect(Object.keys(json.data.attendees[0]).sort()).toEqual([
      "attendanceId",
      "attendeeId",
      "checkInCount",
      "firstCheckedInAt",
      "lastCheckedInAt",
      "outcome",
      "status",
    ]);
    expect(json.data).not.toHaveProperty("email");
    expect(JSON.stringify(json)).not.toMatch(/staff@example|Guest|dietary/i);
    expect(mocks.staffCheckInSelectedParty).toHaveBeenCalledTimes(1);
    expect(mocks.staffCheckInSelectedParty).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        registrationId: REGISTRATION_ID,
        attendeeIds: [ATTENDEE_A, ATTENDEE_B],
        stationId: undefined,
        operationKey: undefined,
      },
      expect.objectContaining({ userAccountId: "user-1" }),
    );
  });

  it("passes optional stationId to the 7.3M service", async () => {
    const response = await POST(
      makeRequest({
        attendeeIds: [ATTENDEE_A, ATTENDEE_B],
        stationId: STATION_ID,
      }),
      context(),
    );
    expect(response.status).toBe(201);
    expect(mocks.staffCheckInSelectedParty).toHaveBeenCalledWith(
      expect.objectContaining({
        attendeeIds: [ATTENDEE_A, ATTENDEE_B],
        stationId: STATION_ID,
      }),
      expect.any(Object),
    );
    const json = await response.json();
    expect(json.data).not.toHaveProperty("stationId");
    expect(JSON.stringify(json)).not.toMatch(/deviceLabel|fingerprint/i);
  });

  it("rejects blank stationId at the API boundary", async () => {
    const response = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A], stationId: "" }),
      context(),
    );
    expect(response.status).toBe(400);
    expect(mocks.staffCheckInSelectedParty).not.toHaveBeenCalled();
  });

  it("passes Idempotency-Key through as operationKey", async () => {
    await POST(
      makeRequest(
        { attendeeIds: [ATTENDEE_A] },
        { headers: { "idempotency-key": "party-retry-1" } },
      ),
      context(),
    );
    expect(mocks.staffCheckInSelectedParty).toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: "party-retry-1" }),
      expect.any(Object),
    );
  });

  it("rejects malformed ids, empty/non-array bodies, and unknown fields", async () => {
    const badReg = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A] }),
      context(EVENT_ID, "bad"),
    );
    expect(badReg.status).toBe(400);

    const empty = await POST(makeRequest({ attendeeIds: [] }), context());
    expect(empty.status).toBe(400);

    const nonArray = await POST(
      makeRequest({ attendeeIds: ATTENDEE_A }),
      context(),
    );
    expect(nonArray.status).toBe(400);

    const unknown = await POST(
      makeRequest({
        attendeeIds: [ATTENDEE_A],
        source: "WALK_IN",
        all: true,
      }),
      context(),
    );
    expect(unknown.status).toBe(400);
    expect(mocks.staffCheckInSelectedParty).not.toHaveBeenCalled();
  });

  it("dedupes duplicate attendeeIds before calling the service", async () => {
    await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A, ATTENDEE_A, ATTENDEE_B] }),
      context(),
    );
    expect(mocks.staffCheckInSelectedParty).toHaveBeenCalledWith(
      expect.objectContaining({
        attendeeIds: [ATTENDEE_A, ATTENDEE_B],
      }),
      expect.any(Object),
    );
  });

  it("maps domain and unexpected errors safely", async () => {
    mocks.staffCheckInSelectedParty.mockRejectedValueOnce(
      new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found."),
    );
    const missing = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A] }),
      context(),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: "Not found",
      code: "NOT_FOUND",
    });

    mocks.staffCheckInSelectedParty.mockRejectedValueOnce(
      new CheckInError("CHECK_IN_DISABLED", "Check-in is disabled."),
    );
    const disabled = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A] }),
      context(),
    );
    expect(disabled.status).toBe(409);

    mocks.staffCheckInSelectedParty.mockRejectedValueOnce(
      new CheckInError("REGISTRATION_NOT_ELIGIBLE", "Not eligible."),
    );
    const ineligible = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A] }),
      context(),
    );
    expect(ineligible.status).toBe(409);

    mocks.staffCheckInSelectedParty.mockRejectedValueOnce(
      new Error("UPDATE secret_party_table SET x=1 failed"),
    );
    const unexpected = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A] }),
      context(),
    );
    expect(unexpected.status).toBe(500);
    expect(await unexpected.text()).not.toMatch(/secret_party_table/);
  });

  it("rejects cross-origin browser requests", async () => {
    const response = await POST(
      makeRequest(
        { attendeeIds: [ATTENDEE_A] },
        { headers: { origin: "http://evil.example", host: "localhost" } },
      ),
      context(),
    );
    expect(response.status).toBe(403);
    expect(mocks.staffCheckInSelectedParty).not.toHaveBeenCalled();
  });

  it("returns 200 when the whole selection is already present", async () => {
    mocks.staffCheckInSelectedParty.mockResolvedValueOnce({
      eventId: EVENT_ID,
      registrationId: REGISTRATION_ID,
      requestedCount: 1,
      newlyCheckedInCount: 0,
      alreadyPresentCount: 1,
      attendees: [
        {
          attendeeId: ATTENDEE_A,
          attendanceId: "00000000-0000-4000-8000-00000000c001",
          status: "PRESENT",
          firstCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
          lastCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
          checkInCount: 1,
          outcome: "ALREADY_PRESENT",
        },
      ],
    });
    const response = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A] }),
      context(),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.alreadyPresentCount).toBe(1);
  });

  it("requires check-in operate permission via the 7.3F service", async () => {
    mocks.staffCheckInSelectedParty.mockRejectedValueOnce(
      new CheckInError(
        "FORBIDDEN",
        "You do not have permission to check in attendees.",
      ),
    );
    const response = await POST(
      makeRequest({ attendeeIds: [ATTENDEE_A] }),
      context(),
    );
    expect(response.status).toBe(403);
  });
});
