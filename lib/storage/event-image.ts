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

const FEATURED_IMAGE_KEY =
  /^(?:private|\/uploads)\/events\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/featured\.(?:jpg|jpeg|png|webp)$/i;

export async function removeEventFeaturedImage(fileKey: string | null | undefined) {
  const absolute = fileKey ? resolveEventImageAbsolutePath(fileKey) : null;
  if (!absolute) return;
  try {
    await unlink(absolute);
  } catch {
    // ignore missing
  }
}

export function resolveEventImageAbsolutePath(fileKey: string) {
  const key = fileKey.replace(/\\/g, "/");
  if (!FEATURED_IMAGE_KEY.test(key)) return null;
  const relative = key.startsWith("/") ? key.slice(1) : key;
  const root = key.startsWith("private/")
    ? path.resolve(process.cwd(), "storage")
    : path.resolve(process.cwd(), "public");
  const absolute = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!absolute.startsWith(prefix)) return null;
  return absolute;
}
