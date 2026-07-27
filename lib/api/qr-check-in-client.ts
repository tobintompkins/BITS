/**
 * Blueprint 7.3V — browser client for 7.3U QR resolve/check-in APIs.
 * Never persists rawToken; callers keep it in ephemeral component memory only.
 */

export type QrResolveResponse = {
  passId: string;
  eventId: string;
  registrationId: string;
  bindingType: "PARTY" | "ATTENDEE";
  attendeeId: string | null;
  eligibleAttendeeIds: string[];
  expiresAt: string;
  eligibility: "USABLE";
};

export type QrCheckInSingleResponse = {
  kind: "SINGLE";
  attendanceId: string;
  eventId: string;
  attendeeId: string;
  status: string;
  firstCheckedInAt: string | null;
  lastCheckedInAt: string | null;
  checkInCount: number;
  alreadyPresent: boolean;
};

export type QrCheckInPartyResponse = {
  kind: "PARTY";
  eventId: string;
  registrationId: string;
  requestedCount: number;
  newlyCheckedInCount: number;
  alreadyPresentCount: number;
  attendees: Array<{
    attendanceId: string;
    attendeeId: string;
    status: string;
    outcome: string;
    firstCheckedInAt: string | null;
    lastCheckedInAt: string | null;
    checkInCount: number;
  }>;
};

export type QrCheckInClientResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string };

function mapFailure(status: number, body: unknown): QrCheckInClientResult<never> {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const error =
    typeof record.error === "string" ? record.error : "Request failed.";
  const code = typeof record.code === "string" ? record.code : undefined;
  return { ok: false, status, error, code };
}

export function mapQrCheckInFailureMessage(result: {
  status: number;
  error: string;
  code?: string;
}) {
  if (result.status === 401) return "Sign in is required.";
  if (result.status === 403) {
    return "You do not have permission to check in with QR passes.";
  }
  if (result.status === 429) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (result.code === "INVALID_QR_PASS") {
    return "This pass cannot be used. Ask for a new pass if needed.";
  }
  if (result.code === "CHECK_IN_DISABLED") {
    return "Check-in is not enabled for this event.";
  }
  if (result.code === "CHECK_IN_NOT_OPEN") {
    return "Check-in has not opened yet.";
  }
  if (result.code === "CHECK_IN_CLOSED") {
    return "Check-in has closed.";
  }
  if (result.code === "STATION_CLOSED") {
    return "This check-in station is closed. Choose another station or none.";
  }
  if (result.code === "REGISTRATION_NOT_ELIGIBLE") {
    return "This registration is not eligible for check-in.";
  }
  return result.error || "Unable to complete QR check-in.";
}

export async function resolveQrCheckInToken(input: {
  eventId: string;
  token: string;
  signal?: AbortSignal;
}): Promise<QrCheckInClientResult<QrResolveResponse>> {
  const response = await fetch(
    `/api/events/${input.eventId}/qr-check-in/resolve`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: input.token }),
      signal: input.signal,
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return mapFailure(response.status, body);
  const data = (body as { data?: QrResolveResponse }).data;
  if (!data?.passId) {
    return { ok: false, status: response.status, error: "Invalid response." };
  }
  return { ok: true, status: response.status, data };
}

export async function submitQrCheckIn(input: {
  eventId: string;
  token: string;
  attendeeIds?: string[];
  stationId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
}): Promise<
  QrCheckInClientResult<QrCheckInSingleResponse | QrCheckInPartyResponse>
> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }
  const response = await fetch(`/api/events/${input.eventId}/qr-check-in`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers,
    body: JSON.stringify({
      token: input.token,
      ...(input.attendeeIds ? { attendeeIds: input.attendeeIds } : {}),
      ...(input.stationId ? { stationId: input.stationId } : {}),
    }),
    signal: input.signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return mapFailure(response.status, body);
  const data = (body as { data?: QrCheckInSingleResponse | QrCheckInPartyResponse })
    .data;
  if (!data?.kind) {
    return { ok: false, status: response.status, error: "Invalid response." };
  }
  return { ok: true, status: response.status, data };
}
