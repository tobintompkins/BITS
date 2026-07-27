import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Event featured-image storage.
 *
 * Public/published event images may live under public uploads for simple serving.
 * Private event images should use private storage and be served only after auth.
 *
 * Keys:
 * - public: `/uploads/events/{orgId}/{eventId}/featured{ext}`
 * - private: `private/events/{orgId}/{eventId}/featured{ext}`
 */

export const MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export function validateEventImageFile(file: File) {
  if (file.size <= 0) return { ok: false as const, message: "File is empty." };
  if (file.size > MAX_EVENT_IMAGE_BYTES) {
    return { ok: false as const, message: "Image must be 5MB or smaller." };
  }
  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXT.has(extension)) {
    return { ok: false as const, message: "Image must be JPG, PNG, or WEBP." };
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return { ok: false as const, message: "Image must be JPG, PNG, or WEBP." };
  }
  return { ok: true as const, extension };
}

export async function saveEventFeaturedImage(
  organizationId: string,
  eventId: string,
  file: File,
  options?: { isPrivate?: boolean },
) {
  const validation = validateEventImageFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const isPrivate = Boolean(options?.isPrivate);
  const fileName = `featured${validation.extension}`;

  if (isPrivate) {
    const dir = path.join(
      process.cwd(),
      "storage",
      "private",
      "events",
      organizationId,
      eventId,
    );
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));
    const storageKey = `private/events/${organizationId}/${eventId}/${fileName}`;
    return {
      storageKey,
      publicUrl: `/api/events/${eventId}/image`,
    };
  }

  const dir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "events",
    organizationId,
    eventId,
  );
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));
  const storageKey = `/uploads/events/${organizationId}/${eventId}/${fileName}`;
  return { storageKey, publicUrl: storageKey };
}

export async function removeEventFeaturedImage(fileKey: string | null | undefined) {
  if (!fileKey) return;
  const candidates = [
    path.join(process.cwd(), "storage", fileKey.replace(/^private\//, "private/")),
    path.join(
      process.cwd(),
      "public",
      fileKey.startsWith("/") ? fileKey.slice(1) : fileKey,
    ),
  ];
  for (const absolute of candidates) {
    try {
      await unlink(absolute);
    } catch {
      // ignore missing
    }
  }
}

export function resolveEventImageAbsolutePath(fileKey: string) {
  if (fileKey.startsWith("private/")) {
    return path.join(process.cwd(), "storage", fileKey);
  }
  const relative = fileKey.startsWith("/") ? fileKey.slice(1) : fileKey;
  return path.join(process.cwd(), "public", relative);
}
