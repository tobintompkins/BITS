import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed QR check-in tokens.
 * Token format: `{attendeeId}.{signature}`
 * Signature = HMAC-SHA256(attendeeId + ":" + eventId, secret)
 */

function getSecret() {
  return (
    process.env.BITS_CHECKIN_HMAC_SECRET ||
    process.env.CLERK_SECRET_KEY ||
    "bits-dev-checkin-secret"
  );
}

export function signCheckInPayload(attendeeId: string, eventId: string) {
  const body = `${attendeeId}:${eventId}`;
  const signature = createHmac("sha256", getSecret()).update(body).digest("hex");
  return `${attendeeId}.${signature}`;
}

export function verifyCheckInPayload(token: string, eventId: string) {
  const [attendeeId, signature] = token.split(".");
  if (!attendeeId || !signature) {
    return { ok: false as const, message: "Invalid check-in token." };
  }
  const expected = createHmac("sha256", getSecret())
    .update(`${attendeeId}:${eventId}`)
    .digest("hex");
  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false as const, message: "Check-in token signature mismatch." };
    }
  } catch {
    return { ok: false as const, message: "Invalid check-in token." };
  }
  return { ok: true as const, attendeeId };
}
