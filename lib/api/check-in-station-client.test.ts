import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCloseCheckInStationRequest,
  buildListCheckInStationsRequest,
  buildOpenCheckInStationRequest,
  closeCheckInStation,
  listAllActiveCheckInStations,
  listCheckInStations,
  mapCheckInStationFailureMessage,
  openCheckInStation,
} from "@/lib/api/check-in-station-client";

const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const STATION_ID = "00000000-0000-4000-8000-00000000a001";

const station = {
  id: STATION_ID,
  eventId: EVENT_ID,
  name: "Welcome Desk",
  deviceLabel: "Lobby tablet",
  status: "ACTIVE" as const,
  openedAt: "2030-01-15T15:30:00.000Z",
  closedAt: null,
  lastActivityAt: "2030-01-15T15:30:00.000Z",
};

describe("check-in station client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds list URLs with page, pageSize, and status only", () => {
    const { url, init } = buildListCheckInStationsRequest({
      eventId: EVENT_ID,
      page: 2,
      pageSize: 25,
      status: "ACTIVE",
    });
    expect(url).toBe(
      `/api/events/${EVENT_ID}/check-in-stations?page=2&pageSize=25&status=ACTIVE`,
    );
    expect(init.method).toBe("GET");
    expect(url).not.toMatch(/organizationId|actor|tenant/);
  });

  it("builds open body with only allowed fields", () => {
    const { url, init } = buildOpenCheckInStationRequest({
      eventId: EVENT_ID,
      name: "Welcome Desk",
      deviceLabel: "Lobby tablet",
    });
    expect(url).toBe(`/api/events/${EVENT_ID}/check-in-stations`);
    expect(JSON.parse(init.body)).toEqual({
      name: "Welcome Desk",
      deviceLabel: "Lobby tablet",
    });
    expect(init.body).not.toMatch(
      /organizationId|openedBy|status|openedAt|audit|ipAddress/,
    );
  });

  it("builds close with empty object body", () => {
    const { url, init } = buildCloseCheckInStationRequest({
      eventId: EVENT_ID,
      stationId: STATION_ID,
    });
    expect(url).toBe(
      `/api/events/${EVENT_ID}/check-in-stations/${STATION_ID}/close`,
    );
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("pages ACTIVE stations for staff check-in without truncating silently", async () => {
    const page1 = Array.from({ length: 100 }, (_, index) => ({
      ...station,
      id: `00000000-0000-4000-8000-00000000a${index.toString(16).padStart(3, "0")}`,
      name: `Desk ${index}`,
      status: "ACTIVE" as const,
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            items: page1,
            total: 101,
            page: 1,
            pageSize: 100,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            items: [{ ...station, id: STATION_ID, name: "Last Desk" }],
            total: 101,
            page: 2,
            pageSize: 100,
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAllActiveCheckInStations({ eventId: EVENT_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stations).toHaveLength(101);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("status=ACTIVE");
  });

  it("lists stations from authoritative server data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          items: [station],
          total: 1,
          page: 1,
          pageSize: 25,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await listCheckInStations({
      eventId: EVENT_ID,
      page: 1,
      status: "ACTIVE",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0]).not.toHaveProperty("organizationId");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("opens a station once and returns CREATED outcome", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: { ...station, outcome: "CREATED" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await openCheckInStation({
      eventId: EVENT_ID,
      name: "Welcome Desk",
      deviceLabel: "Lobby tablet",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.outcome).toBe("CREATED");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("closes once and surfaces ALREADY_CLOSED", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          ...station,
          status: "CLOSED",
          closedAt: "2030-01-15T16:00:00.000Z",
          outcome: "ALREADY_CLOSED",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await closeCheckInStation({
      eventId: EVENT_ID,
      stationId: STATION_ID,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.outcome).toBe("ALREADY_CLOSED");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps safe failure messages including name conflict", () => {
    expect(
      mapCheckInStationFailureMessage({
        ok: false,
        status: 409,
        code: "STATION_NAME_CONFLICT",
        error: "An active station with this name already exists for the event.",
      }),
    ).toMatch(/already exists/i);

    expect(
      mapCheckInStationFailureMessage({
        ok: false,
        status: 403,
        error: "Forbidden",
      }),
    ).toMatch(/permission/i);

    expect(
      mapCheckInStationFailureMessage({
        ok: false,
        status: 401,
        error: "Unauthorized",
      }),
    ).toMatch(/session/i);

    expect(
      mapCheckInStationFailureMessage({
        ok: false,
        status: 500,
        error: "Unable to open station.",
      }),
    ).not.toMatch(/stack|select|prisma|organizationId/i);
  });

  it("does not retry a single open call", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Unable to open station." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await openCheckInStation({ eventId: EVENT_ID, name: "Desk" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
