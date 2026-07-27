import { buildQrPassPayload } from "@/lib/events/qr-pass-token";
import type { QrPassMetadata } from "@/lib/api/qr-pass-client";

/** Ephemeral in-memory secret held only during the display lifecycle. */
export type EphemeralQrSecret = {
  passId: string;
  rawToken: string;
  expiresAt: string;
};

export function toQrDisplayPayload(rawToken: string) {
  return buildQrPassPayload(rawToken);
}

export function assertQrPayloadHasNoPii(payload: string) {
  const lower = payload.toLowerCase();
  return (
    !lower.includes("@") &&
    !lower.includes("email") &&
    !lower.includes("phone") &&
    !/^[a-f0-9-]{36}$/i.test(payload)
  );
}

export function pickActivePartyPass(items: QrPassMetadata[]) {
  return (
    items.find(
      (row) =>
        row.status === "ACTIVE" &&
        row.bindingType === "PARTY" &&
        !row.attendeeId,
    ) ?? null
  );
}

export function clearEphemeralSecret(): null {
  return null;
}

export function shouldOfferRotation(activePass: QrPassMetadata | null) {
  return Boolean(activePass);
}
