export const MANUAL_CREATE_TOKEN_STORAGE_PREFIX =
  "bits.ledger.create-manual-donation:";

export function parseCreateOperationToken(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function manualCreateTokenStorageKey(batchId: string) {
  return `${MANUAL_CREATE_TOKEN_STORAGE_PREFIX}${batchId}`;
}

function createOperationToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "";
}

export function readOrCreateManualDonationOperationToken(batchId: string) {
  if (typeof sessionStorage === "undefined") {
    return createOperationToken();
  }
  const key = manualCreateTokenStorageKey(batchId);
  const existing = parseCreateOperationToken(sessionStorage.getItem(key));
  if (existing) return existing;
  const next = createOperationToken();
  if (next) sessionStorage.setItem(key, next);
  return next;
}

export function clearManualDonationOperationToken(batchId: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(manualCreateTokenStorageKey(batchId));
}
