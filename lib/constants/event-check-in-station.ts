/** Blueprint 7.3I — check-in station foundation constants. */

export const EVENT_CHECK_IN_STATION_STATUSES = ["ACTIVE", "CLOSED"] as const;

export type EventCheckInStationStatus =
  (typeof EVENT_CHECK_IN_STATION_STATUSES)[number];

export const EVENT_CHECK_IN_STATION_NAME_MAX = 80;
export const EVENT_CHECK_IN_STATION_DEVICE_LABEL_MAX = 80;

/** Blueprint 7.3J — list page bounds. */
export const EVENT_CHECK_IN_STATION_LIST_DEFAULT_PAGE_SIZE = 25;
export const EVENT_CHECK_IN_STATION_LIST_MAX_PAGE_SIZE = 100;

export function normalizeStationName(name: string) {
  return name.trim().toLowerCase();
}
