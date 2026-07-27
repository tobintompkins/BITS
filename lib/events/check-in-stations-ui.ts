import {
  EVENT_CHECK_IN_STATION_DEVICE_LABEL_MAX,
  EVENT_CHECK_IN_STATION_LIST_DEFAULT_PAGE_SIZE,
  EVENT_CHECK_IN_STATION_NAME_MAX,
  type EventCheckInStationStatus,
} from "@/lib/constants/event-check-in-station";

export type OpenStationFormValues = {
  name: string;
  deviceLabel: string;
};

export type OpenStationFieldErrors = {
  name?: string;
  deviceLabel?: string;
};

export type StationListQueryState = {
  page: number;
  pageSize: number;
  status?: EventCheckInStationStatus;
};

/** Client-side open form validation — server remains authoritative. */
export function validateOpenStationForm(
  values: OpenStationFormValues,
): OpenStationFieldErrors {
  const errors: OpenStationFieldErrors = {};
  const name = values.name.trim();
  if (!name) {
    errors.name = "Station name is required.";
  } else if (name.length > EVENT_CHECK_IN_STATION_NAME_MAX) {
    errors.name = `Station name must be at most ${EVENT_CHECK_IN_STATION_NAME_MAX} characters.`;
  }

  const deviceLabel = values.deviceLabel.trim();
  if (deviceLabel.length > EVENT_CHECK_IN_STATION_DEVICE_LABEL_MAX) {
    errors.deviceLabel = `Device label must be at most ${EVENT_CHECK_IN_STATION_DEVICE_LABEL_MAX} characters.`;
  }

  return errors;
}

export function hasOpenStationFieldErrors(errors: OpenStationFieldErrors) {
  return Boolean(errors.name || errors.deviceLabel);
}

export function normalizeOpenStationPayload(values: OpenStationFormValues) {
  const name = values.name.trim();
  const deviceLabel = values.deviceLabel.trim();
  return {
    name,
    deviceLabel: deviceLabel ? deviceLabel : null,
  };
}

export function emptyOpenStationForm(): OpenStationFormValues {
  return { name: "", deviceLabel: "" };
}

export function parseStationListQuery(input: {
  page?: string | null;
  pageSize?: string | null;
  status?: string | null;
}): StationListQueryState {
  const pageRaw = Number(input.page ?? "1");
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const sizeRaw = Number(
    input.pageSize ?? String(EVENT_CHECK_IN_STATION_LIST_DEFAULT_PAGE_SIZE),
  );
  const pageSize =
    Number.isFinite(sizeRaw) && sizeRaw >= 1
      ? Math.min(100, Math.floor(sizeRaw))
      : EVENT_CHECK_IN_STATION_LIST_DEFAULT_PAGE_SIZE;

  const status =
    input.status === "ACTIVE" || input.status === "CLOSED"
      ? input.status
      : undefined;

  return { page, pageSize, status };
}

/** Reset to page 1 when status filter changes. */
export function nextStationListQueryOnFilterChange(
  current: StationListQueryState,
  status: EventCheckInStationStatus | "",
): StationListQueryState {
  return {
    ...current,
    page: 1,
    status: status === "" ? undefined : status,
  };
}

export function clampStationListPage(input: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(input.total / input.pageSize));
  if (input.total === 0) return 1;
  return Math.min(Math.max(1, input.page), totalPages);
}

export function stationStatusLabel(status: EventCheckInStationStatus) {
  return status === "ACTIVE" ? "Active" : "Closed";
}

export function closeStationButtonLabel(stationName: string) {
  return `Close station ${stationName}`;
}

export function closeStationConfirmCopy(stationName: string) {
  return {
    title: "Close check-in station?",
    message: `Close “${stationName}”? This ends the administrative session. Stations are not yet attached to check-in actions.`,
    confirmLabel: "Close station",
  };
}

export function openStationSuccessMessage(stationName: string) {
  return `Opened station “${stationName}”.`;
}

export function closeStationSuccessMessage(
  stationName: string,
  outcome: "CLOSED" | "ALREADY_CLOSED",
) {
  if (outcome === "ALREADY_CLOSED") {
    return `“${stationName}” was already closed.`;
  }
  return `Closed station “${stationName}”.`;
}

/** Guard duplicate mouse/keyboard submits while a mutation is pending. */
export function canStartStationMutation(pending: boolean) {
  return !pending;
}

/** Ignore stale list responses when a newer request generation is in flight. */
export function shouldApplyStationListResponse(
  requestGeneration: number,
  latestGeneration: number,
) {
  return requestGeneration === latestGeneration;
}

export function formatStationDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Fields that must never appear in rendered station rows or client storage. */
export const FORBIDDEN_STATION_UI_FIELDS = [
  "organizationId",
  "openedByUserId",
  "closedByUserId",
  "ipAddress",
  "userAgent",
  "fingerprint",
  "nameNormalized",
] as const;

export function stationRowHasForbiddenFields(
  row: Record<string, unknown>,
): boolean {
  return FORBIDDEN_STATION_UI_FIELDS.some((key) => key in row);
}
