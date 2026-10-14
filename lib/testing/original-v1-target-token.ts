import { createHash, timingSafeEqual } from "node:crypto";

export const ORIGINAL_V1_ACCEPTANCE_FLAG = "1";
export const ORIGINAL_V1_TARGET_TOKEN_MIN_LENGTH = 16;
export const ORIGINAL_V1_TARGET_HEADER = "authorization";

export function originalV1TargetFingerprint(
  token: string,
  databaseUrl: string,
) {
  return createHash("sha256")
    .update(`bits-original-v1-acceptance\n${token}\n${databaseUrl}`)
    .digest("hex");
}

export function timingSafeStringEquals(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function bearerTokenFromAuthorization(header: string | null) {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1] ?? null;
}
