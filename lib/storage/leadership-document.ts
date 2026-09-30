import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Leadership document storage adapter (local development).
 *
 * Files are stored outside public static assets:
 *   `{BITS_FILE_STORAGE_ROOT|cwd}/storage/private/leadership-documents/{organizationId}/`
 *
 * storageKey format: `private/leadership-documents/{organizationId}/{file}`
 * Downloads must go through `/api/leadership-documents/[id]/download`
 * after org-admin authorization. Never expose fileKey or filesystem paths.
 *
 * This adapter is separate from member document storage.
 */

export const MAX_LEADERSHIP_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const LEADERSHIP_DOCUMENT_STORAGE_SEGMENT = "leadership-documents";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".doc",
  ".docx",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".js",
  ".mjs",
  ".cjs",
  ".php",
  ".py",
  ".rb",
  ".jar",
  ".com",
  ".msi",
  ".dll",
  ".scr",
  ".vbs",
  ".wsf",
]);

export type LeadershipDocumentValidationResult =
  | { ok: true; extension: string; sanitizedFileName: string; mimeType: string }
  | { ok: false; message: string };

function storageRoot() {
  return process.env.BITS_FILE_STORAGE_ROOT?.trim() || process.cwd();
}

export function sanitizeLeadershipFileName(fileName: string) {
  const normalized = fileName.replaceAll("\\", "/");
  const base = path.basename(normalized).replace(/[^\w.\-()+ ]+/g, "_");
  return base.slice(0, 180) || "document";
}

export function leadershipDocumentStoragePrefix(organizationId: string) {
  return path.posix.join(
    "private",
    LEADERSHIP_DOCUMENT_STORAGE_SEGMENT,
    organizationId,
  );
}

export function isLeadershipDocumentStorageKey(
  fileKey: string,
  organizationId: string,
) {
  const normalized = fileKey.replaceAll("\\", "/");
  if (
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    normalized.includes("\0")
  ) {
    return false;
  }
  const prefix = `${leadershipDocumentStoragePrefix(organizationId)}/`;
  return normalized.startsWith(prefix) && normalized !== prefix;
}

export function validateLeadershipDocumentFile(
  file: File,
): LeadershipDocumentValidationResult {
  if (file.size <= 0) {
    return { ok: false, message: "File is empty." };
  }

  if (file.size > MAX_LEADERSHIP_DOCUMENT_BYTES) {
    return { ok: false, message: "Document must be 10MB or smaller." };
  }

  const extension = path.extname(file.name).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(extension)) {
    return { ok: false, message: "Executable files are not allowed." };
  }

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      message: "Document must be a PDF, JPG, PNG, DOC, or DOCX file.",
    };
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      message: "Document must be a PDF, JPG, PNG, DOC, or DOCX file.",
    };
  }

  const mimeType =
    file.type ||
    (extension === ".pdf"
      ? "application/pdf"
      : extension === ".png"
        ? "image/png"
        : extension === ".doc"
          ? "application/msword"
          : extension === ".docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "image/jpeg");

  return {
    ok: true,
    extension,
    sanitizedFileName: sanitizeLeadershipFileName(file.name),
    mimeType,
  };
}

export async function saveLeadershipDocumentFile(
  organizationId: string,
  file: File,
): Promise<{
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}> {
  const validation = validateLeadershipDocumentFile(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const relativeKey = leadershipDocumentStoragePrefix(organizationId);
  const uploadsDir = path.join(storageRoot(), "storage", relativeKey);
  await mkdir(uploadsDir, { recursive: true });

  const storedName = `${randomUUID()}${validation.extension}`;
  const absolutePath = path.join(uploadsDir, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return {
    storageKey: `${relativeKey}/${storedName}`,
    fileName: validation.sanitizedFileName,
    mimeType: validation.mimeType,
    fileSize: file.size,
  };
}

export function resolveLeadershipDocumentAbsolutePath(
  fileKey: string,
  organizationId: string,
) {
  if (!isLeadershipDocumentStorageKey(fileKey, organizationId)) {
    return null;
  }
  const normalized = fileKey.replaceAll("\\", "/");
  return path.join(storageRoot(), "storage", normalized);
}

export async function leadershipDocumentFileExists(
  fileKey: string,
  organizationId: string,
) {
  const absolutePath = resolveLeadershipDocumentAbsolutePath(
    fileKey,
    organizationId,
  );
  if (!absolutePath) return false;
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeLeadershipDocumentFile(
  fileKey: string,
  organizationId: string,
) {
  const absolutePath = resolveLeadershipDocumentAbsolutePath(
    fileKey,
    organizationId,
  );
  if (!absolutePath) return;
  try {
    await unlink(absolutePath);
  } catch {
    // Missing files are ignored during cleanup.
  }
}
