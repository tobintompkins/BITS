import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLogoPublicUrl,
  removeOrganizationLogoFile,
  resolveAcceptanceOrganizationLogoRoot,
  resolveOwnedOrganizationLogoPath,
  runWithOrganizationLogoRoot,
  runWithOrganizationLogoSeams,
  saveOrganizationLogo,
} from "@/lib/storage/organization-logo";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000a002";

async function tempRoot() {
  return mkdtemp(path.join(tmpdir(), "bits-org-logo-"));
}

function png(bytes: string, name = "logo.png") {
  return new File([Buffer.from(bytes)], name, { type: "image/png" });
}

describe("organization logo files", () => {
  const roots: string[] = [];

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("keeps legacy public paths and absolute logo URLs", () => {
    expect(getLogoPublicUrl("/uploads/organizations/church/logo.png")).toBe(
      "/uploads/organizations/church/logo.png",
    );
    expect(getLogoPublicUrl("https://cdn.example.test/logo.png")).toBe(
      "https://cdn.example.test/logo.png",
    );
    expect(getLogoPublicUrl(null)).toBeNull();
  });

  it("uses the gitignored acceptance root only for the isolated server", () => {
    const cwd = path.join(tmpdir(), "bits-logo-root-check");
    const storage = path.join(cwd, "e2e", ".local", "statement-storage");
    const accepted = resolveAcceptanceOrganizationLogoRoot(
      { BITS_E2E_ACCEPTANCE: "1", BITS_FILE_STORAGE_ROOT: storage },
      cwd,
    );
    expect(accepted).toBe(path.join(storage, "organization-logos"));
    expect(accepted?.startsWith(path.join(cwd, "public"))).toBe(false);
    expect(
      resolveAcceptanceOrganizationLogoRoot(
        { BITS_FILE_STORAGE_ROOT: storage },
        cwd,
      ),
    ).toBeNull();
    expect(
      resolveAcceptanceOrganizationLogoRoot(
        {
          BITS_E2E_ACCEPTANCE: "1",
          BITS_FILE_STORAGE_ROOT: path.join(cwd, "public"),
        },
        cwd,
      ),
    ).toBeNull();
  });

  it("stages a unique file and leaves an existing same-extension logo untouched", async () => {
    const root = await tempRoot();
    roots.push(root);
    const dir = path.join(root, "uploads", "organizations", ORG_ID);
    await mkdir(dir, { recursive: true });
    const prior = path.join(dir, "logo.png");
    await writeFile(prior, "prior-bytes");

    const staged = await runWithOrganizationLogoRoot(root, () =>
      saveOrganizationLogo(ORG_ID, png("next-bytes")),
    );

    expect(staged.storageKey).not.toBe(`/uploads/organizations/${ORG_ID}/logo.png`);
    expect(await readFile(prior, "utf8")).toBe("prior-bytes");
    const stagedPath = await runWithOrganizationLogoRoot(root, async () =>
      resolveOwnedOrganizationLogoPath(ORG_ID, staged.storageKey),
    );
    expect(stagedPath).toBeTruthy();
    expect(await readFile(stagedPath!, "utf8")).toBe("next-bytes");
  });

  it("refuses traversal, other churches, and remote URLs", async () => {
    const root = await tempRoot();
    roots.push(root);
    await runWithOrganizationLogoRoot(root, async () => {
      expect(
        resolveOwnedOrganizationLogoPath(
          ORG_ID,
          `/uploads/organizations/${ORG_ID}/../../secret.png`,
        ),
      ).toBeNull();
      expect(
        resolveOwnedOrganizationLogoPath(
          ORG_ID,
          `/uploads/organizations/${OTHER_ORG_ID}/logo.png`,
        ),
      ).toBeNull();
      expect(
        resolveOwnedOrganizationLogoPath(ORG_ID, "https://cdn.example.test/logo.png"),
      ).toBeNull();
      const outside = path.join(root, "secret.png");
      await writeFile(outside, "keep");
      await removeOrganizationLogoFile(
        ORG_ID,
        `/uploads/organizations/${ORG_ID}/../../secret.png`,
      );
      expect(await readFile(outside, "utf8")).toBe("keep");
    });
  });

  it("removes only the exclusive partial file when the write fails", async () => {
    const root = await tempRoot();
    roots.push(root);
    const dir = path.join(root, "uploads", "organizations", ORG_ID);
    await mkdir(dir, { recursive: true });
    const current = path.join(dir, "logo.png");
    await writeFile(current, "current-logo");
    await expect(
      runWithOrganizationLogoRoot(root, () =>
        runWithOrganizationLogoSeams({ failDuringWrite: true }, () =>
          saveOrganizationLogo(ORG_ID, png("next-bytes")),
        ),
      ),
    ).rejects.toThrow(/could not be saved/i);
    expect(await readFile(current, "utf8")).toBe("current-logo");
    expect(await readdir(dir)).toEqual(["logo.png"]);
  });

  it("keeps an existing file when the new name collides", async () => {
    const root = await tempRoot();
    roots.push(root);
    const dir = path.join(root, "uploads", "organizations", ORG_ID);
    await mkdir(dir, { recursive: true });
    const current = path.join(dir, "logo.png");
    const collision = path.join(dir, "logo-collision.png");
    await writeFile(current, "current-logo");
    await writeFile(collision, "collision-bytes");
    const staged = await runWithOrganizationLogoRoot(root, () =>
      runWithOrganizationLogoSeams({ collideName: "logo-collision.png" }, () =>
        saveOrganizationLogo(ORG_ID, png("next-bytes")),
      ),
    );
    expect(staged.storageKey).not.toContain("logo-collision.png");
    expect(await readFile(collision, "utf8")).toBe("collision-bytes");
    expect(await readFile(current, "utf8")).toBe("current-logo");
    expect(
      await readFile(path.join(root, staged.storageKey.slice(1)), "utf8"),
    ).toBe("next-bytes");
  });

  it("records a leftover key when partial-file cleanup fails", async () => {
    const root = await tempRoot();
    roots.push(root);
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });
    try {
      await expect(
        runWithOrganizationLogoRoot(root, () =>
          runWithOrganizationLogoSeams(
            { failDuringWrite: true, failStagedCleanup: true },
            () => saveOrganizationLogo(ORG_ID, png("next-bytes")),
          ),
        ),
      ).rejects.toThrow(/could not be saved/i);
      const logged = JSON.stringify(errors);
      expect(logged).toContain("staged-logo-leftover");
      expect(logged).toContain("errorCode=EPERM");
      expect(logged).not.toContain("next-bytes");
      expect(logged).not.toContain("partial");
      const dir = path.join(root, "uploads", "organizations", ORG_ID);
      const names = await readdir(dir);
      expect(names).toHaveLength(1);
      expect(await readFile(path.join(dir, names[0]), "utf8")).toBe("partial");
    } finally {
      spy.mockRestore();
    }
  });

  it("reports a file-write failure before creating a logo", async () => {
    const root = await tempRoot();
    roots.push(root);
    await expect(
      runWithOrganizationLogoRoot(root, () =>
        runWithOrganizationLogoSeams({ failWrite: true }, () =>
          saveOrganizationLogo(ORG_ID, png("bytes")),
        ),
      ),
    ).rejects.toThrow(/could not be saved/i);
    const dir = path.join(root, "uploads", "organizations", ORG_ID);
    await expect(readFile(path.join(dir, "logo.png"))).rejects.toThrow();
  });
});
