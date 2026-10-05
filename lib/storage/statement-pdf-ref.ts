const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REMOTE_PREFIX = "s3v1:";
const LOCAL_PREFIX = "private/statements/";

export const STATEMENT_PDF_REMOTE_REF_PREFIX = REMOTE_PREFIX;

export type StatementPdfBackend = "local" | "s3";

export type ParsedStatementPdfRef =
  | {
      ok: true;
      backend: StatementPdfBackend;
      objectKey: string;
      storageKey: string;
    }
  | { ok: false; reason: "UNSAFE_KEY" | "UNKNOWN_REF" };

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function normalizeStorageKey(storageKey: string) {
  return storageKey.replace(/\\/g, "/").trim();
}

export function isUuidStatementId(value: string) {
  return isUuid(value);
}

export function logicalStatementPdfObjectKey(
  organizationId: string,
  statementId: string,
  fileName: string,
) {
  return `${LOCAL_PREFIX}${organizationId}/${statementId}/${fileName}`;
}

export function isSafeLogicalStatementPdfKey(
  objectKey: string,
  organizationId: string,
  statementId: string,
) {
  if (!objectKey || objectKey.includes("\0")) return false;
  if (objectKey.includes("..")) return false;
  if (objectKey.startsWith("/")) return false;
  if (/^[A-Za-z]:\//.test(objectKey)) return false;
  if (/[\u0000-\u001F\u007F]/.test(objectKey)) return false;
  const prefix = `${LOCAL_PREFIX}${organizationId}/${statementId}`;
  return objectKey === `${prefix}.pdf` || objectKey.startsWith(`${prefix}/`);
}

export function parseStatementPdfStorageRef(
  storageKey: string,
  organizationId: string,
  statementId: string,
): ParsedStatementPdfRef {
  if (!storageKey || storageKey.includes("\0")) {
    return { ok: false, reason: "UNSAFE_KEY" };
  }
  if (/^https?:\/\//i.test(storageKey) || storageKey.includes("://")) {
    return { ok: false, reason: "UNKNOWN_REF" };
  }
  const normalized = normalizeStorageKey(storageKey);
  if (!normalized || normalized.startsWith("/")) {
    return { ok: false, reason: "UNSAFE_KEY" };
  }
  if (/^[A-Za-z]:\//.test(normalized)) {
    return { ok: false, reason: "UNSAFE_KEY" };
  }

  if (normalized.startsWith(REMOTE_PREFIX)) {
    const objectKey = normalized.slice(REMOTE_PREFIX.length);
    if (!objectKey || objectKey.includes(":") || objectKey.includes("://")) {
      return { ok: false, reason: "UNKNOWN_REF" };
    }
    if (!isSafeLogicalStatementPdfKey(objectKey, organizationId, statementId)) {
      return { ok: false, reason: "UNSAFE_KEY" };
    }
    return {
      ok: true,
      backend: "s3",
      objectKey,
      storageKey: `${REMOTE_PREFIX}${objectKey}`,
    };
  }

  if (normalized.startsWith("s3") && normalized.includes(":")) {
    return { ok: false, reason: "UNKNOWN_REF" };
  }

  if (!isSafeLogicalStatementPdfKey(normalized, organizationId, statementId)) {
    return { ok: false, reason: "UNSAFE_KEY" };
  }
  return {
    ok: true,
    backend: "local",
    objectKey: normalized,
    storageKey: normalized,
  };
}

export function buildStatementPdfStorageRef(
  backend: StatementPdfBackend,
  organizationId: string,
  statementId: string,
  fileName: string,
) {
  const objectKey = logicalStatementPdfObjectKey(
    organizationId,
    statementId,
    fileName,
  );
  return backend === "s3" ? `${REMOTE_PREFIX}${objectKey}` : objectKey;
}
