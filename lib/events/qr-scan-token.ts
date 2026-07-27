import { EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH } from "@/lib/constants/event-qr-pass";
import { parseQrPassPayload } from "@/lib/events/qr-pass-token";

/**
 * Blueprint 7.3V — normalize a scanned/pasted pass value before API submit.
 * Does not log or persist the value.
 */
export function normalizeScannedQrToken(raw: string): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH) {
    return null;
  }
  const opaque = parseQrPassPayload(raw);
  if (
    opaque.length === 0 ||
    opaque.length > EVENT_QR_PASS_RAW_TOKEN_MAX_LENGTH
  ) {
    return null;
  }
  return opaque;
}

export function isQrCameraDecoderAvailable() {
  if (typeof window === "undefined") return false;
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    "BarcodeDetector" in window
  );
}
