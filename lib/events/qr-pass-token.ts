import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Opaque bearer QR pass token — never store raw value. */
export function generateQrPassToken() {
  return randomBytes(32).toString("base64url");
}

export function hashQrPassToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function qrPassTokensMatch(rawToken: string, tokenHash: string) {
  const hashed = hashQrPassToken(rawToken);
  try {
    const a = Buffer.from(hashed, "hex");
    const b = Buffer.from(tokenHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Short human-entry fallback that is not a database ID. */
export function generateQrFallbackCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let code = "";
  for (let i = 0; i < 10; i += 1) {
    code += alphabet[bytes[i]! % alphabet.length];
  }
  return code;
}

/** Hash fallback codes the same way as bearer tokens (uppercase-normalized). */
export function hashQrFallbackCode(code: string) {
  return hashQrPassToken(code.trim().toUpperCase());
}

/** Payload encoded in the QR image — opaque token only, no PII. */
export function buildQrPassPayload(rawToken: string) {
  return `BITS-CI:${rawToken}`;
}

export function parseQrPassPayload(input: string) {
  const trimmed = input.trim();
  if (trimmed.startsWith("BITS-CI:")) {
    return trimmed.slice("BITS-CI:".length).trim();
  }
  return trimmed;
}
