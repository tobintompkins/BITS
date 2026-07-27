import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  checkInViaQrTokenForStaffApi: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/services/qr-staff-check-in.service", () => ({
  checkInViaQrTokenForStaffApi: mocks.checkInViaQrTokenForStaffApi,
}));

import { POST } from "@/app/api/events/[id]/qr-check-in/route";
import { CheckInError } from "@/lib/errors/check-in-errors";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const ATTENDEE_ID = "00000000-0000-4000-8000-00000000e004";
const RAW = "opaque-raw-token-value-abcdefghijklmnopqrstuv";

function ctx() {
  return { params: Promise.resolve({ id: EVENT_ID }) };
}

function makePost(body: unknown, headers?: Record<string, string>) {
  return new Request(`http://localhost/api/events/${EVENT_ID}/qr-check-in`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost",
      origin: "http://localhost",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST .../qr-check-in (7.3U)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "op@example.com" },
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "user-1",
      primaryEmail: "op@example.com",
    });
    mocks.checkInViaQrTokenForStaffApi.mockResolvedValue({
      kind: "SINGLE",
      result: {
        attendanceId: "00000000-0000-4000-8000-00000000e005",
        eventId: EVENT_ID,
        attendeeId: ATTENDEE_ID,
        status: "PRESENT",
        firstCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
        lastCheckedInAt: new Date("2030-01-15T15:30:00.000Z"),
        checkInCount: 1,
        alreadyPresent: false,
      },
    });
  });

  it("checks in via orchestrator once with no-store and no token echo", async () => {
    const response = await POST(
      makePost({ token: RAW, attendeeIds: [ATTENDEE_ID] }),
      ctx(),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    const json = await response.json();
    expect(json.data.kind).toBe("SINGLE");
    expect(json.data.attendeeId).toBe(ATTENDEE_ID);
    expect(JSON.stringify(json)).not.toContain(RAW);
    expect(mocks.checkInViaQrTokenForStaffApi).toHaveBeenCalledTimes(1);
    expect(mocks.checkInViaQrTokenForStaffApi).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT_ID,
        token: RAW,
        attendeeIds: [ATTENDEE_ID],
      }),
      expect.objectContaining({ userAccountId: "user-1" }),
    );
  });

  it("maps selection and station conflicts safely", async () => {
    mocks.checkInViaQrTokenForStaffApi.mockRejectedValueOnce(
      new CheckInError(
        "VALIDATION",
        "Select at least one attendee for this party pass.",
      ),
    );
    const missing = await POST(makePost({ token: RAW }), ctx());
    expect(missing.status).toBe(400);

    mocks.checkInViaQrTokenForStaffApi.mockRejectedValueOnce(
      new CheckInError("STATION_CLOSED", "Station is closed."),
    );
    const closed = await POST(
      makePost({
        token: RAW,
        attendeeIds: [ATTENDEE_ID],
        stationId: "00000000-0000-4000-8000-00000000e006",
      }),
      ctx(),
    );
    expect(closed.status).toBe(409);
    expect(JSON.stringify(await closed.json())).not.toContain(RAW);
  });
});
