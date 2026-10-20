export const LEDGER_REVIEW_SCHEMA_COPY =
  "Ledger review storage is not enabled on this database yet. Apply checked-in Prisma migration 20261014200000_add_ledger_review_and_idempotency on verified loopback bits with npm run ledger:review-local-migrate, or on isolated bits_e2e with npm run ledger:review-schema-setup. The application never applies database schema changes at runtime.";

const SCHEMA_CODES = new Set(["P2021", "P2022", "42703", "42P01"]);
const SCHEMA_MARKERS = [
  "reviewversion",
  "ledger_create_idempotency",
  "ledgercreateidempotency",
];

function collectErrorParts(
  error: unknown,
  seen: Set<unknown>,
  parts: { codes: string[]; texts: string[] },
) {
  if (!error || typeof error !== "object" || seen.has(error)) return;
  seen.add(error);
  const record = error as Record<string, unknown>;
  if (typeof record.code === "string") parts.codes.push(record.code);
  if (typeof record.originalCode === "string") parts.codes.push(record.originalCode);
  if (typeof record.kind === "string") parts.texts.push(record.kind);
  if (typeof record.message === "string") parts.texts.push(record.message);
  if (typeof record.originalMessage === "string") {
    parts.texts.push(record.originalMessage);
  }
  if (record.meta && typeof record.meta === "object") {
    const meta = record.meta as Record<string, unknown>;
    for (const key of ["column", "table", "modelName", "model"]) {
      if (typeof meta[key] === "string") parts.texts.push(meta[key]);
    }
  }
  if ("cause" in record) collectErrorParts(record.cause, seen, parts);
}

export function isLedgerReviewSchemaMissingError(error: unknown) {
  const parts = { codes: [] as string[], texts: [] as string[] };
  collectErrorParts(error, new Set(), parts);
  const blob = `${parts.codes.join(" ")} ${parts.texts.join(" ")}`.toLowerCase();
  if (!SCHEMA_MARKERS.some((marker) => blob.includes(marker))) {
    return false;
  }
  if (parts.codes.some((code) => SCHEMA_CODES.has(code))) {
    return true;
  }
  return /does not exist|columnnotfound|undefined_(column|table)|relation .* does not exist/i.test(
    blob,
  );
}

export function ledgerReviewSchemaFailureMessage(error: unknown) {
  return isLedgerReviewSchemaMissingError(error)
    ? LEDGER_REVIEW_SCHEMA_COPY
    : null;
}
