import type { EventCheckInStationStatus } from "@/lib/constants/event-check-in-station";

export type CheckInStationDto = {
  id: string;
  eventId: string;
  name: string;
  deviceLabel: string | null;
  status: EventCheckInStationStatus;
  openedAt: string;
  closedAt: string | null;
  lastActivityAt: string | null;
  outcome?: "CREATED" | "CLOSED" | "ALREADY_CLOSED";
};

export type CheckInStationListDto = {
  items: CheckInStationDto[];
  total: number;
  page: number;
  pageSize: number;
};

export type CheckInStationApiFailure = {
  ok: false;
  status: number;
  code?: string;
  error: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export type CheckInStationListResult =
  | { ok: true; status: number; data: CheckInStationListDto }
  | CheckInStationApiFailure;

export type CheckInStationMutationResult =
  | { ok: true; status: number; data: CheckInStationDto }
  | CheckInStationApiFailure;

function isStationDto(value: unknown): value is CheckInStationDto {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.id === "string" &&
    typeof data.eventId === "string" &&
    typeof data.name === "string" &&
    (data.deviceLabel === null || typeof data.deviceLabel === "string") &&
    (data.status === "ACTIVE" || data.status === "CLOSED") &&
    typeof data.openedAt === "string" &&
    (data.closedAt === null || typeof data.closedAt === "string") &&
    (data.lastActivityAt === null || typeof data.lastActivityAt === "string")
  );
}

function isStationListDto(value: unknown): value is CheckInStationListDto {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    Array.isArray(data.items) &&
    data.items.every(isStationDto) &&
    typeof data.total === "number" &&
    typeof data.page === "number" &&
    typeof data.pageSize === "number"
  );
}

function parseFailure(
  response: Response,
  payload: unknown,
  fallback: string,
): CheckInStationApiFailure {
  const errorBody =
    payload && typeof payload === "object"
      ? (payload as {
          error?: string;
          code?: string;
          fieldErrors?: Record<string, string[] | undefined>;
        })
      : {};

  return {
    ok: false,
    status: response.status,
    code: errorBody.code,
    error: errorBody.error ?? fallback,
    fieldErrors: errorBody.fieldErrors,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Build list request — never include tenant/actor IDs. */
export function buildListCheckInStationsRequest(input: {
  eventId: string;
  page?: number;
  pageSize?: number;
  status?: EventCheckInStationStatus;
}) {
  const params = new URLSearchParams();
  if (input.page != null) params.set("page", String(input.page));
  if (input.pageSize != null) params.set("pageSize", String(input.pageSize));
  if (input.status) params.set("status", input.status);
  const query = params.toString();
  return {
    url: `/api/events/${input.eventId}/check-in-stations${query ? `?${query}` : ""}`,
    init: {
      method: "GET" as const,
      credentials: "same-origin" as const,
    },
  };
}

/** Build open request — only name + optional deviceLabel. */
export function buildOpenCheckInStationRequest(input: {
  eventId: string;
  name: string;
  deviceLabel?: string | null;
}) {
  const body: { name: string; deviceLabel?: string } = {
    name: input.name,
  };
  if (input.deviceLabel) {
    body.deviceLabel = input.deviceLabel;
  }
  return {
    url: `/api/events/${input.eventId}/check-in-stations`,
    init: {
      method: "POST" as const,
      credentials: "same-origin" as const,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  };
}

/** Build close request — empty JSON object only. */
export function buildCloseCheckInStationRequest(input: {
  eventId: string;
  stationId: string;
}) {
  return {
    url: `/api/events/${input.eventId}/check-in-stations/${input.stationId}/close`,
    init: {
      method: "POST" as const,
      credentials: "same-origin" as const,
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  };
}

export async function listCheckInStations(input: {
  eventId: string;
  page?: number;
  pageSize?: number;
  status?: EventCheckInStationStatus;
  signal?: AbortSignal;
}): Promise<CheckInStationListResult> {
  const { url, init } = buildListCheckInStationsRequest(input);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: input.signal });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Network error. Check your connection and try again.",
    };
  }

  const payload = await readJson(response);
  if (response.ok) {
    const data =
      payload && typeof payload === "object" && "data" in payload
        ? (payload as { data: unknown }).data
        : null;
    if (!isStationListDto(data)) {
      return {
        ok: false,
        status: response.status,
        error: "Unexpected server response.",
      };
    }
    return { ok: true, status: response.status, data };
  }

  return parseFailure(response, payload, "Unable to load stations.");
}

/**
 * Bounded ACTIVE-station loader for staff check-in (7.3O).
 * Pages through the 7.3K list using max page size so options are not silently truncated.
 */
export async function listAllActiveCheckInStations(input: {
  eventId: string;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; stations: CheckInStationDto[] }
  | CheckInStationApiFailure
> {
  const pageSize = 100;
  const maxPages = 10;
  const stations: CheckInStationDto[] = [];
  let page = 1;

  while (page <= maxPages) {
    const result = await listCheckInStations({
      eventId: input.eventId,
      page,
      pageSize,
      status: "ACTIVE",
      signal: input.signal,
    });
    if (!result.ok) return result;

    stations.push(...result.data.items);
    if (stations.length >= result.data.total) {
      return { ok: true, stations };
    }
    if (result.data.items.length === 0) {
      return { ok: true, stations };
    }
    page += 1;
  }

  return { ok: true, stations };
}

export async function openCheckInStation(input: {
  eventId: string;
  name: string;
  deviceLabel?: string | null;
  signal?: AbortSignal;
}): Promise<CheckInStationMutationResult> {
  const { url, init } = buildOpenCheckInStationRequest(input);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: input.signal });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Network error. Check your connection and try again.",
    };
  }

  const payload = await readJson(response);
  if (response.ok) {
    const data =
      payload && typeof payload === "object" && "data" in payload
        ? (payload as { data: unknown }).data
        : null;
    if (!isStationDto(data)) {
      return {
        ok: false,
        status: response.status,
        error: "Unexpected server response.",
      };
    }
    return { ok: true, status: response.status, data };
  }

  return parseFailure(response, payload, "Unable to open station.");
}

export async function closeCheckInStation(input: {
  eventId: string;
  stationId: string;
  signal?: AbortSignal;
}): Promise<CheckInStationMutationResult> {
  const { url, init } = buildCloseCheckInStationRequest(input);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: input.signal });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Network error. Check your connection and try again.",
    };
  }

  const payload = await readJson(response);
  if (response.ok) {
    const data =
      payload && typeof payload === "object" && "data" in payload
        ? (payload as { data: unknown }).data
        : null;
    if (!isStationDto(data)) {
      return {
        ok: false,
        status: response.status,
        error: "Unexpected server response.",
      };
    }
    return { ok: true, status: response.status, data };
  }

  return parseFailure(response, payload, "Unable to close station.");
}

export function mapCheckInStationFailureMessage(
  failure: CheckInStationApiFailure,
) {
  if (failure.status === 401) {
    return "Your session has expired. Sign in again and retry.";
  }
  if (failure.status === 403) {
    return "You do not have permission to manage check-in stations.";
  }
  if (failure.status === 404) {
    return "That station or event could not be found.";
  }
  if (failure.status === 409 && failure.code === "STATION_NAME_CONFLICT") {
    return failure.error || "An active station with this name already exists.";
  }
  if (failure.status === 0) return failure.error;
  return failure.error || "Unable to complete the station request.";
}
