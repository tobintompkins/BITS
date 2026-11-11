import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
]);
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);
const ORGANIZATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGO_FILE_NAME = /^logo[A-Za-z0-9._-]*\.(?:png|jpg|jpeg|svg)$/i;

const rootStore = new AsyncLocalStorage<string>();
const seamStore = new AsyncLocalStorage<{
  failWrite?: boolean;
  failDuringWrite?: boolean;
  failStagedCleanup?: boolean;
  collideName?: string;
}>();

export function runWithOrganizationLogoRoot<T>(
  root: string,
  fn: () => Promise<T>,
) {
  return rootStore.run(root, fn);
}

export function runWithOrganizationLogoSeams<T>(
  seams: {
    failWrite?: boolean;
    failDuringWrite?: boolean;
    failStagedCleanup?: boolean;
    collideName?: string;
  },
  fn: () => Promise<T>,
) {
  return seamStore.run({ ...seamStore.getStore(), ...seams }, fn);
}

/**
 * Logo files for the isolated acceptance server stay under the gitignored
 * storage root. The path is not taken from a request. A production process
 * and any root outside `e2e/.local` keep the normal public directory.
 */
export function resolveAcceptanceOrganizationLogoRoot(
  env: Record<string, string | undefined>,
  cwd: string,
) {
  if (env.BITS_E2E_ACCEPTANCE !== "1") return null;
  const configured = env.BITS_FILE_STORAGE_ROOT?.trim();
  if (!configured) return null;
  const localRoot = path.resolve(cwd, "e2e", ".local");
  const resolved = path.resolve(configured);
  const relative = path.relative(localRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return path.join(resolved, "organization-logos");
}

function publicRoot() {
  return (
    rootStore.getStore() ??
    resolveAcceptanceOrganizationLogoRoot(process.env, process.cwd()) ??
    path.join(process.cwd(), "public")
  );
}

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

  if (
    logoStorageKey.startsWith("/") ||
    /^https?:\/\//i.test(logoStorageKey)
  ) {
    return logoStorageKey;
  }

  return `/${logoStorageKey}`;
}

export function resolveOwnedOrganizationLogoPath(
  organizationId: string,
  logoStorageKey: string | null | undefined,
) {
  if (!logoStorageKey || !ORGANIZATION_ID.test(organizationId)) return null;
  const normalized = logoStorageKey.startsWith("/")
    ? logoStorageKey.slice(1)
    : logoStorageKey;
  const prefix = `uploads/organizations/${organizationId}/`;
  if (!normalized.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const fileName = normalized.slice(prefix.length);
  if (!LOGO_FILE_NAME.test(fileName) || fileName.includes("/") || fileName.includes("\\")) {
    return null;
  }
  const orgDir = path.resolve(
    publicRoot(),
    "uploads",
    "organizations",
    organizationId,
  );
  const absolutePath = path.resolve(orgDir, fileName);
  const relative = path.relative(orgDir, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolutePath;
}

export async function saveOrganizationLogo(
  organizationId: string,
  file: File,
): Promise<{ storageKey: string; publicUrl: string }> {
  const validation = validateLogoFile(file);
  if (!validation.ok) throw new Error(validation.message);
  if (!ORGANIZATION_ID.test(organizationId)) {
    throw new Error("Logo file could not be saved.");
  }
  if (seamStore.getStore()?.failWrite) {
    throw new Error("Logo file could not be saved.");
  }

  const uploadsDir = path.join(
    publicRoot(),
    "uploads",
    "organizations",
    organizationId,
  );
  await mkdir(uploadsDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  const seams = seamStore.getStore();
  let usedCollideName = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fileName =
      !usedCollideName && seams?.collideName
        ? ((usedCollideName = true), seams.collideName)
        : `logo-${randomBytes(8).toString("hex")}${validation.extension}`;
    if (!LOGO_FILE_NAME.test(fileName)) {
      throw new Error("Logo file could not be saved.");
    }
    const absolutePath = path.join(uploadsDir, fileName);
    const storageKey = `/uploads/organizations/${organizationId}/${fileName}`;
    let handle;
    try {
      handle = await open(absolutePath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    try {
      if (seams?.failDuringWrite) {
        await handle.write(Buffer.from("partial"));
        throw Object.assign(new Error("Logo file could not be saved."), {
          code: "EIO",
        });
      }
      await handle.write(buffer);
      await handle.close();
      return { storageKey, publicUrl: storageKey };
    } catch (error) {
      await handle.close().catch(() => undefined);
      await removeExclusiveLogoAttempt(storageKey, absolutePath);
      throw error;
    }
  }

  throw new Error("Logo file could not be saved.");
}

async function removeExclusiveLogoAttempt(
  storageKey: string,
  absolutePath: string,
) {
  try {
    if (seamStore.getStore()?.failStagedCleanup) {
      throw Object.assign(new Error("cleanup failed"), { code: "EPERM" });
    }
    await unlink(absolutePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unknown";
    if (code === "ENOENT") return;
    console.error(
      `[organization-logo] staged-logo-leftover storageKey=${storageKey} errorCode=${code}`,
    );
  }
}

export async function removeOrganizationLogoFile(
  organizationId: string,
  logoStorageKey: string | null | undefined,
) {
  const absolutePath = resolveOwnedOrganizationLogoPath(
    organizationId,
    logoStorageKey,
  );
  if (!absolutePath) return;

  try {
    await unlink(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
