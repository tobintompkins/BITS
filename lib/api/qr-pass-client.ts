/**
 * Blueprint 7.3R/7.3S — browser client for QR pass API.
 * Never persists rawToken; callers must keep it in ephemeral component memory only.
 */

export type QrPassMetadata = {
  id: string;
  eventId: string;
  registrationId: string;
  attendeeId: string | null;
  bindingType: "PARTY" | "ATTENDEE";
  purpose: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  rotatedAt: string | null;
};

export type QrPassSecretResponse = {
  id: string;
  eventId: string;
  registrationId: string;
  attendeeId: string | null;
  purpose: string;
  expiresAt: string;
  reused: boolean;
  rawToken: string | null;
};

export type QrPassRevokeResponse = {
  id: string;
  eventId: string;
  registrationId: string;
  attendeeId: string | null;
  purpose: string;
  status: string;
  transitioned: boolean;
  revokedAt: string | null;
};

export type QrPassClientResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string };

function basePath(eventId: string, registrationId: string) {
  return `/api/events/${eventId}/registrations/${registrationId}/qr-passes`;
}

function mapFailure(status: number, body: unknown): QrPassClientResult<never> {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const error =
    typeof record.error === "string" ? record.error : "Request failed.";
  const code = typeof record.code === "string" ? record.code : undefined;
  return { ok: false, status, error, code };
}

export function mapQrPassFailureMessage(result: {
  status: number;
  error: string;
  code?: string;
}) {
  if (result.status === 401) return "Sign in is required.";
  if (result.status === 403) return "You do not have permission to manage QR passes.";
  if (result.status === 404) return "Registration or pass was not found.";
  if (result.status === 409) {
    if (result.code === "CHECK_IN_DISABLED") {
      return "QR passes are not enabled for this event.";
    }
    if (result.code === "REGISTRATION_NOT_ELIGIBLE") {
      return "This registration is not eligible for a QR pass.";
    }
    return result.error || "Unable to update the QR pass.";
  }
  return result.error || "Unable to manage the QR pass.";
}

export async function listQrPasses(
  eventId: string,
  registrationId: string,
): Promise<QrPassClientResult<{ items: QrPassMetadata[] }>> {
  const response = await fetch(basePath(eventId, registrationId), {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return mapFailure(response.status, body);
  const data = (body as { data?: { items?: QrPassMetadata[] } }).data;
  if (!data?.items) {
    return { ok: false, status: response.status, error: "Invalid response." };
  }
  return { ok: true, status: response.status, data: { items: data.items } };
}

export async function issueQrPass(
  eventId: string,
  registrationId: string,
  attendeeId?: string | null,
): Promise<QrPassClientResult<QrPassSecretResponse>> {
  const response = await fetch(basePath(eventId, registrationId), {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attendeeId: attendeeId === undefined ? undefined : attendeeId,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return mapFailure(response.status, body);
  const data = (body as { data?: QrPassSecretResponse }).data;
  if (!data?.id) {
    return { ok: false, status: response.status, error: "Invalid response." };
  }
  return { ok: true, status: response.status, data };
}

export async function rotateQrPass(
  eventId: string,
  registrationId: string,
  passId: string,
): Promise<QrPassClientResult<QrPassSecretResponse>> {
  const response = await fetch(
    `${basePath(eventId, registrationId)}/${passId}/rotate`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return mapFailure(response.status, body);
  const data = (body as { data?: QrPassSecretResponse }).data;
  if (!data?.id) {
    return { ok: false, status: response.status, error: "Invalid response." };
  }
  return { ok: true, status: response.status, data };
}

export async function revokeQrPass(
  eventId: string,
  registrationId: string,
  passId: string,
): Promise<QrPassClientResult<QrPassRevokeResponse>> {
  const response = await fetch(
    `${basePath(eventId, registrationId)}/${passId}/revoke`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return mapFailure(response.status, body);
  const data = (body as { data?: QrPassRevokeResponse }).data;
  if (!data?.id) {
    return { ok: false, status: response.status, error: "Invalid response." };
  }
  return { ok: true, status: response.status, data };
}
