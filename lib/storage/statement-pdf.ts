import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReadStream } from "node:fs";

/**
 * Private contribution-statement PDF adapter (local development).
 *
 * Files live under a path Next.js does not serve:
 *   `{BITS_FILE_STORAGE_ROOT|cwd}/storage/private/statements/{orgId}/{statementId}/`
 *
 * storageKey format:
 *   `private/statements/{orgId}/{statementId}/{file}.pdf`
 *
 * Production follow-up: replace this adapter with a private object-store
 * bucket and short-lived signed URLs. Keep serving through the authenticated
 * portal API — never a public static URL.
 */

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");
const MAX_IDENTIFIER_LENGTH = 80;
const MAX_STATEMENT_PDF_BYTES = 15 * 1024 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function storageRoot() {
  return (
    process.env.BITS_FILE_STORAGE_ROOT?.trim() ||
    /* turbopackIgnore: true */ process.cwd()
  );
}

export function getPrivateStatementStorageRoot() {
  return path.join(storageRoot(), "storage", "private", "statements");
}

export function sanitizeStatementPdfFileName(identifier: string) {
  const safe = identifier
    .trim()
    .replaceAll("..", "")
    .replace(/[/\\]+/g, "_")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .replace(/\.pdf$/i, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_IDENTIFIER_LENGTH);
  return `${safe || "statement"}.pdf`;
}

function normalizeStorageKey(storageKey: string) {
  return storageKey.replace(/\\/g, "/").trim();
}

/**
 * Reject absolute paths, traversal, and keys that do not stay under the
 * authorized organization + statement prefix.
 */
export function isSafeStatementPdfStorageKey(
  storageKey: string,
  organizationId: string,
  statementId: string,
) {
  if (!storageKey || storageKey.includes("\0")) return false;
  if (path.isAbsolute(storageKey)) return false;
  const normalized = normalizeStorageKey(storageKey);
  if (!normalized || normalized.startsWith("/")) return false;
  if (normalized.includes("..")) return false;
  if (/^[A-Za-z]:\//.test(normalized)) return false;

  const prefix = `private/statements/${organizationId}/${statementId}`;
  return normalized === `${prefix}.pdf` || normalized.startsWith(`${prefix}/`);
}

export function resolveStatementPdfAbsolutePath(storageKey: string) {
  const normalized = normalizeStorageKey(storageKey).replace(/^\/+/, "");
  return path.join(storageRoot(), "storage", normalized);
}

export type StatementPdfOpenResult =
  | { ok: true; absolutePath: string; stream: ReadStream }
  | { ok: false; reason: "UNAVAILABLE" };

async function pathStaysInStatementRoot(
  absolutePath: string,
  organizationId: string,
) {
  const allowedRoot = path.join(
    getPrivateStatementStorageRoot(),
    organizationId,
  );
  let resolvedFile: string;
  let resolvedRoot: string;
  try {
    resolvedFile = await realpath(absolutePath);
    resolvedRoot = await realpath(allowedRoot);
  } catch {
    return false;
  }

  const relative = path.relative(resolvedRoot, resolvedFile);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function directoryStaysInOrgRoot(
  absoluteDirectory: string,
  organizationId: string,
) {
  const allowedRoot = path.join(
    getPrivateStatementStorageRoot(),
    organizationId,
  );
  let resolvedDir: string;
  let resolvedRoot: string;
  try {
    resolvedDir = await realpath(absoluteDirectory);
    resolvedRoot = await realpath(allowedRoot);
  } catch {
    return false;
  }
  const relative = path.relative(resolvedRoot, resolvedDir);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readPdfHeader(absolutePath: string) {
  const file = await open(absolutePath, "r");
  try {
    const header = Buffer.alloc(PDF_MAGIC.length);
    const { bytesRead } = await file.read(header, 0, PDF_MAGIC.length, 0);
    return bytesRead === PDF_MAGIC.length && header.equals(PDF_MAGIC);
  } finally {
    await file.close();
  }
}

async function sha256FileHex(absolutePath: string) {
  const hash = createHash("sha256");
  const stream = createReadStream(absolutePath);
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}

function checksumMatches(expected: string, actualHex: string) {
  const normalized = expected.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) return false;
  const expectedBuf = Buffer.from(normalized, "hex");
  const actualBuf = Buffer.from(actualHex, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Open a statement PDF only after path, type, and checksum checks succeed.
 * Callers must not record a successful access if this returns `{ ok: false }`.
 */
export async function openAuthorizedStatementPdf(input: {
  organizationId: string;
  statementId: string;
  storageKey: string;
  checksum: string | null | undefined;
}): Promise<StatementPdfOpenResult> {
  if (
    !isSafeStatementPdfStorageKey(
      input.storageKey,
      input.organizationId,
      input.statementId,
    )
  ) {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  const absolutePath = resolveStatementPdfAbsolutePath(input.storageKey);

  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile() || fileStat.size <= 0) {
      return { ok: false, reason: "UNAVAILABLE" };
    }
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  if (!(await pathStaysInStatementRoot(absolutePath, input.organizationId))) {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  if (!(await readPdfHeader(absolutePath))) {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  if (input.checksum?.trim()) {
    try {
      const actual = await sha256FileHex(absolutePath);
      if (!checksumMatches(input.checksum, actual)) {
        return { ok: false, reason: "UNAVAILABLE" };
      }
    } catch {
      return { ok: false, reason: "UNAVAILABLE" };
    }
  }

  try {
    const stream = await new Promise<ReadStream>((resolve, reject) => {
      const next = createReadStream(absolutePath);
      const fail = (error: Error) => {
        next.destroy();
        reject(error);
      };
      next.once("error", fail);
      next.once("open", () => {
        next.off("error", fail);
        resolve(next);
      });
    });
    return { ok: true, absolutePath, stream };
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }
}

export function buildPrivateStatementPdfStorageKey(
  organizationId: string,
  statementId: string,
  fileName: string,
) {
  return `private/statements/${organizationId}/${statementId}/${sanitizeStatementPdfFileName(fileName)}`;
}

export type WritePrivateStatementPdfResult =
  | { ok: true; checksum: string }
  | {
      ok: false;
      reason: "UNSAFE_KEY" | "INVALID_PDF" | "ALREADY_EXISTS" | "UNAVAILABLE";
    };

/**
 * Exclusive private write for a newly generated statement PDF.
 * Never overwrites an existing file. Callers must not log the path or bytes.
 */
export async function writePrivateStatementPdf(input: {
  organizationId: string;
  statementId: string;
  storageKey: string;
  bytes: Uint8Array;
}): Promise<WritePrivateStatementPdfResult> {
  if (!isUuid(input.organizationId) || !isUuid(input.statementId)) {
    return { ok: false, reason: "UNSAFE_KEY" };
  }
  if (
    !isSafeStatementPdfStorageKey(
      input.storageKey,
      input.organizationId,
      input.statementId,
    )
  ) {
    return { ok: false, reason: "UNSAFE_KEY" };
  }
  if (
    input.bytes.byteLength <= 0 ||
    input.bytes.byteLength > MAX_STATEMENT_PDF_BYTES
  ) {
    return { ok: false, reason: "INVALID_PDF" };
  }
  const header = Buffer.from(
    input.bytes.subarray(0, PDF_MAGIC.length),
  );
  if (!header.equals(PDF_MAGIC)) {
    return { ok: false, reason: "INVALID_PDF" };
  }

  const absolutePath = resolveStatementPdfAbsolutePath(input.storageKey);
  const destDir = path.dirname(absolutePath);
  const orgRoot = path.join(
    getPrivateStatementStorageRoot(),
    input.organizationId,
  );

  try {
    await mkdir(orgRoot, { recursive: true });
    await mkdir(destDir, { recursive: true });
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  if (!(await directoryStaysInOrgRoot(destDir, input.organizationId))) {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const tempPath = path.join(
    destDir,
    `.${randomBytes(16).toString("hex")}.pdf.tmp`,
  );

  try {
    await writeFile(tempPath, Buffer.from(input.bytes), { flag: "wx" });
  } catch {
    return { ok: false, reason: "UNAVAILABLE" };
  }

  let placeholderCreated = false;
  try {
    const placeholder = await open(absolutePath, "wx");
    placeholderCreated = true;
    await placeholder.close();
    await rename(tempPath, absolutePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    if (placeholderCreated) {
      await unlink(absolutePath).catch(() => undefined);
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      return { ok: false, reason: "ALREADY_EXISTS" };
    }
    return { ok: false, reason: "UNAVAILABLE" };
  }

  return { ok: true, checksum };
}

/**
 * Compensating cleanup after a private PDF write if the database record
 * cannot be created. Rejects unsafe keys and does nothing when the file is
 * already gone.
 */
export async function deletePrivateStatementPdf(input: {
  organizationId: string;
  statementId: string;
  storageKey: string;
}): Promise<void> {
  if (!isUuid(input.organizationId) || !isUuid(input.statementId)) return;
  if (
    !isSafeStatementPdfStorageKey(
      input.storageKey,
      input.organizationId,
      input.statementId,
    )
  ) {
    return;
  }

  const absolutePath = resolveStatementPdfAbsolutePath(input.storageKey);
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) return;
  } catch {
    return;
  }

  if (!(await pathStaysInStatementRoot(absolutePath, input.organizationId))) {
    return;
  }

  await unlink(absolutePath).catch(() => undefined);
}
