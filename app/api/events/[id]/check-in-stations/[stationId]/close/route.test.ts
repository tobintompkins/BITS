import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  closeCheckInStationLifecycle: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/services/check-in-station-lifecycle.service", () => ({
  closeCheckInStationLifecycle: mocks.closeCheckInStationLifecycle,
}));

import { POST } from "@/app/api/events/[id]/check-in-stations/[stationId]/close/route";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const STATION_ID = "00000000-0000-4000-8000-00000000a001";

function makeClose(body: unknown = {}) {
  return new Request(
    `http://localhost/api/events/${EVENT_ID}/check-in-stations/${STATION_ID}/close`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost",
        origin: "http://localhost",
      },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/events/[id]/check-in-stations/[stationId]/close", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "mgr@example.com" },
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "user-1",
      primaryEmail: "mgr@example.com",
    });
    mocks.closeCheckInStationLifecycle.mockResolvedValue({
      id: STATION_ID,
      eventId: EVENT_ID,
      name: "Welcome Desk",
      deviceLabel: null,
      status: "CLOSED",
      openedAt: new Date("2030-01-15T15:30:00.000Z"),
      closedAt: new Date("2030-01-15T16:00:00.000Z"),
      lastActivityAt: new Date("2030-01-15T15:30:00.000Z"),
      transitioned: true,
    });
  });

  it("invokes 7.3J close and returns CLOSED outcome", async () => {
    const response = await POST(makeClose(), {
      params: Promise.resolve({ id: EVENT_ID, stationId: STATION_ID }),
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.outcome).toBe("CLOSED");
    expect(mocks.closeCheckInStationLifecycle).toHaveBeenCalledWith(
      { eventId: EVENT_ID, stationId: STATION_ID },
      expect.objectContaining({ userAccountId: "user-1" }),
    );
  });

  it("returns ALREADY_CLOSED for idempotent repeats", async () => {
    mocks.closeCheckInStationLifecycle.mockResolvedValueOnce({
      id: STATION_ID,
      eventId: EVENT_ID,
      name: "Welcome Desk",
      deviceLabel: null,
      status: "CLOSED",
      openedAt: new Date("2030-01-15T15:30:00.000Z"),
      closedAt: new Date("2030-01-15T16:00:00.000Z"),
      lastActivityAt: new Date("2030-01-15T15:30:00.000Z"),
      transitioned: false,
    });
    const response = await POST(makeClose(), {
      params: Promise.resolve({ id: EVENT_ID, stationId: STATION_ID }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.outcome).toBe("ALREADY_CLOSED");
  });

  it("rejects invented close body fields", async () => {
    const response = await POST(makeClose({ closedAt: "2030-01-15" }), {
      params: Promise.resolve({ id: EVENT_ID, stationId: STATION_ID }),
    });
    expect(response.status).toBe(400);
    expect(mocks.closeCheckInStationLifecycle).not.toHaveBeenCalled();
  });
});
