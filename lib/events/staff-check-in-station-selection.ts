import type { CheckInStationDto } from "@/lib/api/check-in-station-client";

/** Sentinel for the optional “No station” choice — never persisted. */
export const STAFF_CHECK_IN_NO_STATION_VALUE = "";

export type SelectableCheckInStation = {
  id: string;
  name: string;
  deviceLabel: string | null;
};

export function toSelectableCheckInStations(
  stations: CheckInStationDto[],
): SelectableCheckInStation[] {
  return stations
    .filter((row) => row.status === "ACTIVE")
    .map((row) => ({
      id: row.id,
      name: row.name,
      deviceLabel: row.deviceLabel,
    }));
}

export function stationOptionLabel(station: SelectableCheckInStation) {
  if (station.deviceLabel) {
    return `${station.name} · ${station.deviceLabel}`;
  }
  return station.name;
}

/** Include stationId only when a real station is selected (7.3N optional-field rule). */
export function stationIdForCheckInRequest(selectedStationId: string) {
  const trimmed = selectedStationId.trim();
  if (!trimmed || trimmed === STAFF_CHECK_IN_NO_STATION_VALUE) {
    return undefined;
  }
  return trimmed;
}

/**
 * Drop a selection that disappeared from the refreshed ACTIVE list.
 * Returns whether the selection was cleared due to staleness.
 */
export function reconcileStationSelection(
  selectedStationId: string,
  activeStations: SelectableCheckInStation[],
): { stationId: string; clearedStale: boolean } {
  if (
    !selectedStationId ||
    selectedStationId === STAFF_CHECK_IN_NO_STATION_VALUE
  ) {
    return { stationId: STAFF_CHECK_IN_NO_STATION_VALUE, clearedStale: false };
  }
  const stillActive = activeStations.some(
    (row) => row.id === selectedStationId,
  );
  if (stillActive) {
    return { stationId: selectedStationId, clearedStale: false };
  }
  return { stationId: STAFF_CHECK_IN_NO_STATION_VALUE, clearedStale: true };
}

export function isStationClosedCheckInFailure(failure: {
  status: number;
  code?: string;
}) {
  return failure.status === 409 && failure.code === "STATION_CLOSED";
}

export function singleCheckInSuccessMessage(input: {
  attendeeName: string;
  alreadyPresent: boolean;
  stationName?: string | null;
}) {
  if (input.alreadyPresent) {
    return `${input.attendeeName} is already checked in. Attendance count was not increased.`;
  }
  if (input.stationName) {
    return `${input.attendeeName} checked in successfully at ${input.stationName}.`;
  }
  return `${input.attendeeName} checked in successfully.`;
}

export function partyCheckInSuccessMessage(input: {
  newlyCheckedInCount: number;
  alreadyPresentCount: number;
  requestedCount: number;
  stationName?: string | null;
}) {
  const base = `Checked in ${input.newlyCheckedInCount} · already present ${input.alreadyPresentCount} · requested ${input.requestedCount}.`;
  if (input.newlyCheckedInCount > 0 && input.stationName) {
    return `${base} Station: ${input.stationName}.`;
  }
  return base;
}

/** Guards against writing selection outside in-memory React state. */
export const FORBIDDEN_STATION_SELECTION_STORAGE_KEYS = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "cookie",
] as const;
