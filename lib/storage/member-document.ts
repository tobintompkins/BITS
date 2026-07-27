import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Member document storage adapter (local development).
 *
 * NEW files are stored under a private path (not served by Next.js static):
 *   `{BITS_FILE_STORAGE_ROOT|cwd}/storage/private/members/{org}/{member}/documents/`
 *
 * storageKey format: `private/members/{orgId}/{memberId}/documents/{file}`
 * fileUrl / publicUrl: API placeholder only (`/api/member-documents`).
 * Callers must expose downloads via `/api/member-documents/[id]/download`
 * after permission checks — never a public static URL for new files.
 *
 * Legacy files may still live under `public/uploads/members/...`.
 * resolve/remove helpers check private first, then legacy public paths.
 *
 * Production notes:
 * - Replace this adapter with S3/R2/GCS behind the same API.
 * - Prefer private buckets + signed/temporary download URLs.
 * - Keep `fileKey` as the opaque storage identifier; do not expose raw
 *   bucket paths or credentials to the client.
 * - Always serve downloads through the authenticated API route.
 */

export const MAX_MEMBER_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Placeholder public URL — UI should use `/api/member-documents/[id]/download`. */
export const MEMBER_DOCUMENT_API_PLACEHOLDER = "/api/member-documents";

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

export type DocumentValidationResult =
  | { ok: true; extension: string; sanitizedFileName: string; mimeType: string }
  | { ok: false; message: string };

function storageRoot() {
  return process.env.BITS_FILE_STORAGE_ROOT?.trim() || process.cwd();
}

function projectRoot() {
  return /* turbopackIgnore: true */ process.cwd();
}

export function sanitizeFileName(fileName: string) {
  const base = path.basename(fileName).replace(/[^\w.\-()+ ]+/g, "_");
  return base.slice(0, 180) || "document";
}

export function validateMemberDocumentFile(file: File): DocumentValidationResult {
  if (file.size <= 0) {
    return { ok: false, message: "File is empty." };
  }

  if (file.size > MAX_MEMBER_DOCUMENT_BYTES) {
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
    sanitizedFileName: sanitizeFileName(file.name),
    mimeType,
  };
}

export async function saveMemberDocumentFile(
  organizationId: string,
  memberId: string,
  file: File,
): Promise<{
  storageKey: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}> {
  const validation = validateMemberDocumentFile(file);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const relativeKey = path.posix.join(
    "private",
    "members",
    organizationId,
    memberId,
    "documents",
  );
  const uploadsDir = path.join(storageRoot(), "storage", relativeKey);
  await mkdir(uploadsDir, { recursive: true });

  const storedName = `${randomUUID()}${validation.extension}`;
  const absolutePath = path.join(uploadsDir, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  const storageKey = `${relativeKey}/${storedName}`;

  return {
    storageKey,
    publicUrl: MEMBER_DOCUMENT_API_PLACEHOLDER,
    fileName: validation.sanitizedFileName,
    mimeType: validation.mimeType,
    fileSize: file.size,
  };
}

function candidateAbsolutePaths(fileKey: string) {
  const normalized = fileKey.startsWith("/") ? fileKey.slice(1) : fileKey;
  const root = storageRoot();
  const cwd = projectRoot();
  const candidates: string[] = [];

  // Private storage (current)
  if (normalized.startsWith("private/")) {
    candidates.push(path.join(root, "storage", normalized));
  } else if (normalized.startsWith("storage/private/")) {
    candidates.push(path.join(root, normalized));
  }

  // Legacy public uploads
  if (normalized.startsWith("uploads/")) {
    candidates.push(path.join(cwd, "public", normalized));
  } else if (normalized.startsWith("public/uploads/")) {
    candidates.push(path.join(cwd, normalized));
  } else {
    // Fallback: try private then public for bare relative keys
    candidates.push(path.join(root, "storage", "private", normalized));
    candidates.push(path.join(cwd, "public", "uploads", normalized));
    candidates.push(path.join(cwd, "public", normalized));
  }

  return [...new Set(candidates)];
}

async function pathExists(absolutePath: string) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function removeMemberDocumentFile(
  fileKey: string | null | undefined,
) {
  if (!fileKey) return;

  for (const absolutePath of candidateAbsolutePaths(fileKey)) {
    try {
      await unlink(absolutePath);
      return;
    } catch {
      // Try next candidate.
    }
  }
}

export function resolveLocalDocumentAbsolutePath(fileKey: string) {
  const candidates = candidateAbsolutePaths(fileKey);
  // Prefer private path first (index 0 when key is private/...), else first candidate.
  return candidates[0] ?? path.join(storageRoot(), "storage", fileKey);
}

/** Async resolve that picks the first existing path (private, then legacy). */
export async function resolveExistingLocalDocumentAbsolutePath(fileKey: string) {
  for (const absolutePath of candidateAbsolutePaths(fileKey)) {
    if (await pathExists(absolutePath)) {
      return absolutePath;
    }
  }
  return resolveLocalDocumentAbsolutePath(fileKey);
}
