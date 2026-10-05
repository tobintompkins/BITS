import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReadStream } from "node:fs";
import type { Readable } from "node:stream";

import {
  resolveStatementPdfS3Config,
  resolveStatementPdfWriteConfig,
} from "@/lib/storage/statement-pdf-config";
import {
  buildStatementPdfStorageRef,
  parseStatementPdfStorageRef,
} from "@/lib/storage/statement-pdf-ref";
import {
  deleteRemoteStatementPdf,
  openRemoteStatementPdf,
  writeRemoteStatementPdf,
} from "@/lib/storage/statement-pdf-s3";

/**
 * Private contribution-statement PDF adapter.
 *
 * Artifact identity is stored in `ContributionStatement.pdfStorageKey`:
 *   local legacy: `private/statements/{orgId}/{statementId}/{file}.pdf`
 *   remote:       `s3v1:private/statements/{orgId}/{statementId}/{file}.pdf`
 *
 * Reads dispatch on that identity. A global new-write backend switch never
 * reinterprets an existing key. Remote failures never fall back to local
 * files. Serve bytes only through authenticated staff/portal routes.
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
  return parseStatementPdfStorageRef(storageKey, organizationId, statementId)
    .ok;
}

export function resolveStatementPdfAbsolutePath(storageKey: string) {
  const normalized = normalizeStorageKey(storageKey).replace(/^\/+/, "");
  return path.join(storageRoot(), "storage", normalized);
}

export type StatementPdfOpenResult =
  | {
      ok: true;
      stream: ReadStream | Readable;
      absolutePath?: string;
      byteLength?: number;
    }
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
  const parsed = parseStatementPdfStorageRef(
    input.storageKey,
    input.organizationId,
    input.statementId,
  );
  if (!parsed.ok) {
    return { ok: false, reason: "UNAVAILABLE" };
  }
  if (parsed.backend === "s3") {
    const config = resolveStatementPdfS3Config();
    if (!config.ok || config.backend !== "s3") {
      return { ok: false, reason: "UNAVAILABLE" };
    }
    return openRemoteStatementPdf(config, {
      objectKey: parsed.objectKey,
      checksum: input.checksum,
    });
  }

  const absolutePath = resolveStatementPdfAbsolutePath(parsed.objectKey);

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
  const config = resolveStatementPdfWriteConfig();
  const backend = config.ok ? config.backend : "local";
  return buildStatementPdfStorageRef(
    backend,
    organizationId,
    statementId,
    sanitizeStatementPdfFileName(fileName),
  );
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
  const parsed = parseStatementPdfStorageRef(
    input.storageKey,
    input.organizationId,
    input.statementId,
  );
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason === "UNKNOWN_REF" ? "UNSAFE_KEY" : "UNSAFE_KEY" };
  }
  const writeConfig = resolveStatementPdfWriteConfig();
  if (parsed.backend === "s3") {
    if (!writeConfig.ok || writeConfig.backend !== "s3") {
      return { ok: false, reason: "UNAVAILABLE" };
    }
    return writeRemoteStatementPdf(writeConfig, {
      objectKey: parsed.objectKey,
      bytes: input.bytes,
    });
  }
  if (!writeConfig.ok || writeConfig.backend !== "local") {
    return { ok: false, reason: "UNAVAILABLE" };
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

  const absolutePath = resolveStatementPdfAbsolutePath(parsed.objectKey);
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
  const parsed = parseStatementPdfStorageRef(
    input.storageKey,
    input.organizationId,
    input.statementId,
  );
  if (!parsed.ok) return;
  if (parsed.backend === "s3") {
    const config = resolveStatementPdfS3Config();
    if (!config.ok || config.backend !== "s3") return;
    await deleteRemoteStatementPdf(config, parsed.objectKey);
    return;
  }

  const absolutePath = resolveStatementPdfAbsolutePath(parsed.objectKey);
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
