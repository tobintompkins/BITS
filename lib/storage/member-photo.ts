import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export type PhotoValidationResult =
  | { ok: true; extension: string }
  | { ok: false; message: string };

export function validateMemberPhotoFile(file: File): PhotoValidationResult {
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, message: "Photo must be 5MB or smaller." };
  }

  const extension = path.extname(file.name).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      message: "Photo must be a JPG, PNG, or WEBP file.",
    };
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      message: "Photo must be a JPG, PNG, or WEBP file.",
    };
  }

  return { ok: true, extension };
}

export function getMemberPhotoPublicUrl(
  photoStorageKey: string | null | undefined,
  photoUrl: string | null | undefined,
) {
  if (photoUrl?.trim()) {
    return photoUrl;
  }

  if (!photoStorageKey) {
    return null;
  }

  if (photoStorageKey.startsWith("/")) {
    return photoStorageKey;
  }

  return `/${photoStorageKey}`;
}

export async function saveMemberPhoto(
  organizationId: string,
  memberId: string,
  file: File,
): Promise<{ storageKey: string; publicUrl: string }> {
  const validation = validateMemberPhotoFile(file);

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const uploadsDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "members",
    organizationId,
    memberId,
  );
  await mkdir(uploadsDir, { recursive: true });

  const fileName = `photo${validation.extension}`;
  const absolutePath = path.join(uploadsDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(absolutePath, buffer);

  const storageKey = `/uploads/members/${organizationId}/${memberId}/${fileName}`;

  return {
    storageKey,
    publicUrl: storageKey,
  };
}

export async function removeMemberPhotoFile(
  photoStorageKey: string | null | undefined,
) {
  if (!photoStorageKey) {
    return;
  }

  const relativePath = photoStorageKey.startsWith("/")
    ? photoStorageKey.slice(1)
    : photoStorageKey;
  const absolutePath = path.join(process.cwd(), "public", relativePath);

  try {
    await unlink(absolutePath);
  } catch {
    // Ignore missing files during cleanup.
  }
}
