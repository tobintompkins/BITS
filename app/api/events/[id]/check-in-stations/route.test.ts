import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  openCheckInStationLifecycle: vi.fn(),
  listCheckInStationsLifecycle: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/services/check-in-station-lifecycle.service", () => ({
  openCheckInStationLifecycle: mocks.openCheckInStationLifecycle,
  listCheckInStationsLifecycle: mocks.listCheckInStationsLifecycle,
}));

import { GET, POST } from "@/app/api/events/[id]/check-in-stations/route";
import { CheckInError } from "@/lib/errors/check-in-errors";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";

function makePost(body: unknown, headers?: Record<string, string>) {
  return new Request(
    `http://localhost/api/events/${EVENT_ID}/check-in-stations`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost",
        origin: "http://localhost",
        ...(headers ?? {}),
      },
      body: JSON.stringify(body),
    },
  );
}

describe("GET/POST /api/events/[id]/check-in-stations", () => {
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
    mocks.openCheckInStationLifecycle.mockResolvedValue({
      id: "00000000-0000-4000-8000-00000000a001",
      eventId: EVENT_ID,
      name: "Welcome Desk",
      deviceLabel: "Lobby tablet",
      status: "ACTIVE",
      openedAt: new Date("2030-01-15T15:30:00.000Z"),
      closedAt: null,
      lastActivityAt: new Date("2030-01-15T15:30:00.000Z"),
      transitioned: true,
    });
    mocks.listCheckInStationsLifecycle.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const response = await POST(makePost({ name: "Desk" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(401);
    expect(mocks.openCheckInStationLifecycle).not.toHaveBeenCalled();
  });

  it("invokes 7.3J open once and returns only safe fields", async () => {
    const response = await POST(
      makePost({ name: "Welcome Desk", deviceLabel: "Lobby tablet" }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(Object.keys(json.data).sort()).toEqual([
      "closedAt",
      "deviceLabel",
      "eventId",
      "id",
      "lastActivityAt",
      "name",
      "openedAt",
      "outcome",
      "status",
    ]);
    expect(json.data.outcome).toBe("CREATED");
    expect(json.data).not.toHaveProperty("organizationId");
    expect(mocks.openCheckInStationLifecycle).toHaveBeenCalledTimes(1);
    expect(mocks.openCheckInStationLifecycle).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        name: "Welcome Desk",
        deviceLabel: "Lobby tablet",
      },
      expect.objectContaining({ userAccountId: "user-1" }),
    );
  });

  it("rejects unknown fields, CSRF mismatch, and maps conflicts safely", async () => {
    const unknown = await POST(
      makePost({ name: "Desk", status: "ACTIVE" }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(unknown.status).toBe(400);
    expect(mocks.openCheckInStationLifecycle).not.toHaveBeenCalled();

    const csrf = await POST(
      makePost(
        { name: "Desk" },
        { origin: "http://evil.example", host: "localhost" },
      ),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(csrf.status).toBe(403);

    mocks.openCheckInStationLifecycle.mockRejectedValueOnce(
      new CheckInError(
        "VALIDATION",
        "An active station with this name already exists for the event.",
      ),
    );
    const conflict = await POST(makePost({ name: "Desk" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      code: "STATION_NAME_CONFLICT",
    });

    mocks.openCheckInStationLifecycle.mockRejectedValueOnce(
      new Error("SELECT * FROM secret_stations failed"),
    );
    const unexpected = await POST(makePost({ name: "Desk" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(unexpected.status).toBe(500);
    expect(await unexpected.text()).not.toMatch(/secret_stations/);
  });

  it("lists through 7.3J with query validation", async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/events/${EVENT_ID}/check-in-stations?page=1&pageSize=10&status=ACTIVE`,
      ),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(response.status).toBe(200);
    expect(mocks.listCheckInStationsLifecycle).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        status: "ACTIVE",
        page: 1,
        pageSize: 10,
      },
      expect.any(Object),
    );

    const bad = await GET(
      new Request(
        `http://localhost/api/events/${EVENT_ID}/check-in-stations?status=OPEN`,
      ),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(bad.status).toBe(400);
  });

  it("requires management permission via the 7.3J service", async () => {
    mocks.openCheckInStationLifecycle.mockRejectedValueOnce(
      new CheckInError(
        "FORBIDDEN",
        "You do not have permission to manage check-in stations.",
      ),
    );
    const response = await POST(makePost({ name: "Desk" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(403);
  });
});
