const DATABASE_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "P1000",
  "P1001",
  "P1017",
]);

export function isDatabaseUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code =
    "code" in error && error.code != null ? String(error.code) : "";
  if (DATABASE_UNAVAILABLE_CODES.has(code)) return true;
  const message =
    "message" in error && error.message != null ? String(error.message) : "";
  return /econnrefused|can't reach database server|connection refused/i.test(
    message,
  );
}
