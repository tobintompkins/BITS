import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
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
