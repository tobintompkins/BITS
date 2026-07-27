import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
]);
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);

export type LogoValidationResult =
  | { ok: true; extension: string }
  | { ok: false; message: string };

export function validateLogoFile(file: File): LogoValidationResult {
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, message: "Logo must be 5MB or smaller." };
  }

  const extension = path.extname(file.name).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      message: "Logo must be a PNG, JPG, or SVG file.",
    };
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      ok: false,
      message: "Logo must be a PNG, JPG, or SVG file.",
    };
  }

  return { ok: true, extension };
}

export function getLogoPublicUrl(logoStorageKey: string | null | undefined) {
  if (!logoStorageKey) {
    return null;
  }

  if (logoStorageKey.startsWith("/")) {
    return logoStorageKey;
  }

  return `/${logoStorageKey}`;
}

export async function saveOrganizationLogo(
  organizationId: string,
  file: File,
): Promise<{ storageKey: string; publicUrl: string }> {
  const validation = validateLogoFile(file);

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const uploadsDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "organizations",
    organizationId,
  );
  await mkdir(uploadsDir, { recursive: true });

  const fileName = `logo${validation.extension}`;
  const absolutePath = path.join(uploadsDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(absolutePath, buffer);

  const storageKey = `/uploads/organizations/${organizationId}/${fileName}`;

  return {
    storageKey,
    publicUrl: storageKey,
  };
}

export async function removeOrganizationLogoFile(
  logoStorageKey: string | null | undefined,
) {
  if (!logoStorageKey) {
    return;
  }

  const relativePath = logoStorageKey.startsWith("/")
    ? logoStorageKey.slice(1)
    : logoStorageKey;
  const absolutePath = path.join(process.cwd(), "public", relativePath);

  try {
    await unlink(absolutePath);
  } catch {
    // Ignore missing files during cleanup.
  }
}
