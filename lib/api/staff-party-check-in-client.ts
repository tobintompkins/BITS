export type StaffPartyCheckInAttendeeResult = {
  attendeeId: string;
  attendanceId: string;
  status: "PRESENT";
  firstCheckedInAt: string | null;
  lastCheckedInAt: string | null;
  checkInCount: number;
  outcome: "CHECKED_IN" | "ALREADY_PRESENT";
};

export type StaffPartyCheckInApiSuccess = {
  eventId: string;
  registrationId: string;
  requestedCount: number;
  newlyCheckedInCount: number;
  alreadyPresentCount: number;
  attendees: StaffPartyCheckInAttendeeResult[];
};

export type StaffPartyCheckInApiFailure = {
  ok: false;
  status: number;
  code?: string;
  error: string;
};

export type StaffPartyCheckInApiResult =
  | { ok: true; status: number; data: StaffPartyCheckInApiSuccess }
  | StaffPartyCheckInApiFailure;

function isStaffPartyCheckInApiSuccess(
  value: unknown,
): value is StaffPartyCheckInApiSuccess {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.eventId === "string" &&
    typeof data.registrationId === "string" &&
    typeof data.requestedCount === "number" &&
    typeof data.newlyCheckedInCount === "number" &&
    typeof data.alreadyPresentCount === "number" &&
    Array.isArray(data.attendees)
  );
}

/** Build the exact 7.3G/7.3N request — never include tenant/actor/source/timestamps. */
export function buildStaffPartyCheckInRequest(input: {
  eventId: string;
  registrationId: string;
  attendeeIds: string[];
  idempotencyKey: string;
  stationId?: string;
}) {
  const body: { attendeeIds: string[]; stationId?: string } = {
    attendeeIds: input.attendeeIds,
  };
  if (input.stationId) {
    body.stationId = input.stationId;
  }
  return {
    url: `/api/events/${input.eventId}/registrations/${input.registrationId}/check-ins`,
    init: {
      method: "POST" as const,
      credentials: "same-origin" as const,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  };
}

export async function submitStaffPartyCheckIn(input: {
  eventId: string;
  registrationId: string;
  attendeeIds: string[];
  idempotencyKey: string;
  stationId?: string;
  signal?: AbortSignal;
}): Promise<StaffPartyCheckInApiResult> {
  const { url, init } = buildStaffPartyCheckInRequest(input);
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

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    const data =
      payload && typeof payload === "object" && "data" in payload
        ? (payload as { data: unknown }).data
        : null;
    if (!isStaffPartyCheckInApiSuccess(data)) {
      return {
        ok: false,
        status: response.status,
        error: "Unexpected server response.",
      };
    }
    return { ok: true, status: response.status, data };
  }

  const errorBody =
    payload && typeof payload === "object"
      ? (payload as { error?: string; code?: string })
      : {};

  return {
    ok: false,
    status: response.status,
    code: errorBody.code,
    error: errorBody.error ?? "Unable to complete party check-in.",
  };
}

export function mapStaffPartyCheckInFailureMessage(
  failure: StaffPartyCheckInApiFailure,
) {
  if (failure.status === 401) {
    return "Your session has expired. Sign in again and try again.";
  }
  if (failure.status === 403) {
    return "You do not have permission to check in attendees.";
  }
  if (failure.status === 404) {
    return "That registration or attendee could not be found.";
  }
  if (failure.status === 409) {
    switch (failure.code) {
      case "CHECK_IN_DISABLED":
        return "Check-in is disabled for this event.";
      case "CHECK_IN_NOT_OPEN":
        return "Check-in is not open yet.";
      case "CHECK_IN_CLOSED":
        return "Check-in has closed.";
      case "STATION_CLOSED":
        return "This check-in station is closed.";
      case "REGISTRATION_NOT_ELIGIBLE":
      case "ATTENDEE_CANCELLED":
      case "ATTENDEE_WAITLISTED":
        return "This registration or attendee is not eligible for check-in.";
      default:
        return failure.error;
    }
  }
  if (failure.status === 0) return failure.error;
  return failure.error || "Unable to complete party check-in.";
}
