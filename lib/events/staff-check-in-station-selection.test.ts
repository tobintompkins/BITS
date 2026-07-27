import { describe, expect, it } from "vitest";

import type { CheckInStationDto } from "@/lib/api/check-in-station-client";
import {
  FORBIDDEN_STATION_SELECTION_STORAGE_KEYS,
  isStationClosedCheckInFailure,
  partyCheckInSuccessMessage,
  reconcileStationSelection,
  singleCheckInSuccessMessage,
  STAFF_CHECK_IN_NO_STATION_VALUE,
  stationIdForCheckInRequest,
  stationOptionLabel,
  toSelectableCheckInStations,
} from "@/lib/events/staff-check-in-station-selection";

const active: CheckInStationDto = {
  id: "00000000-0000-4000-8000-00000000b001",
  eventId: "00000000-0000-4000-8000-00000000e001",
  name: "Welcome Desk",
  deviceLabel: "Lobby tablet",
  status: "ACTIVE",
  openedAt: "2030-01-15T15:00:00.000Z",
  closedAt: null,
  lastActivityAt: "2030-01-15T15:00:00.000Z",
};

const closed: CheckInStationDto = {
  ...active,
  id: "00000000-0000-4000-8000-00000000b002",
  name: "Closed Desk",
  status: "CLOSED",
  closedAt: "2030-01-15T16:00:00.000Z",
};

describe("staff check-in station selection helpers", () => {
  it("defaults to no station and omits the field from requests", () => {
    expect(STAFF_CHECK_IN_NO_STATION_VALUE).toBe("");
    expect(stationIdForCheckInRequest("")).toBeUndefined();
    expect(stationIdForCheckInRequest("   ")).toBeUndefined();
    expect(
      stationIdForCheckInRequest(active.id),
    ).toBe(active.id);
  });

  it("offers only ACTIVE stations with safe labels", () => {
    const options = toSelectableCheckInStations([active, closed]);
    expect(options).toHaveLength(1);
    expect(options[0]?.id).toBe(active.id);
    expect(stationOptionLabel(options[0]!)).toBe(
      "Welcome Desk · Lobby tablet",
    );
    expect(stationOptionLabel({ ...options[0]!, deviceLabel: null })).toBe(
      "Welcome Desk",
    );
  });

  it("clears stale selections that leave the ACTIVE list", () => {
    expect(
      reconcileStationSelection(active.id, [
        { id: active.id, name: active.name, deviceLabel: null },
      ]),
    ).toEqual({ stationId: active.id, clearedStale: false });

    expect(
      reconcileStationSelection(active.id, []),
    ).toEqual({
      stationId: STAFF_CHECK_IN_NO_STATION_VALUE,
      clearedStale: true,
    });
  });

  it("detects closed-station failures without auto-retry semantics", () => {
    expect(
      isStationClosedCheckInFailure({
        status: 409,
        code: "STATION_CLOSED",
      }),
    ).toBe(true);
    expect(
      isStationClosedCheckInFailure({
        status: 404,
        code: "NOT_FOUND",
      }),
    ).toBe(false);
  });

  it("keeps already-present feedback free of attribution claims", () => {
    expect(
      singleCheckInSuccessMessage({
        attendeeName: "Doe, Jane",
        alreadyPresent: true,
        stationName: "Welcome Desk",
      }),
    ).toMatch(/already checked in/i);
    expect(
      singleCheckInSuccessMessage({
        attendeeName: "Doe, Jane",
        alreadyPresent: true,
        stationName: "Welcome Desk",
      }),
    ).not.toMatch(/Welcome Desk|activity|attributed/i);

    expect(
      singleCheckInSuccessMessage({
        attendeeName: "Doe, Jane",
        alreadyPresent: false,
        stationName: "Welcome Desk",
      }),
    ).toContain("Welcome Desk");
  });

  it("mentions station only when party check-in newly attributed", () => {
    expect(
      partyCheckInSuccessMessage({
        newlyCheckedInCount: 0,
        alreadyPresentCount: 2,
        requestedCount: 2,
        stationName: "Welcome Desk",
      }),
    ).not.toContain("Welcome Desk");

    expect(
      partyCheckInSuccessMessage({
        newlyCheckedInCount: 1,
        alreadyPresentCount: 1,
        requestedCount: 2,
        stationName: "Welcome Desk",
      }),
    ).toContain("Welcome Desk");
  });

  it("documents that selection must not use browser persistence APIs", () => {
    expect(FORBIDDEN_STATION_SELECTION_STORAGE_KEYS).toEqual([
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "cookie",
    ]);
  });
});
