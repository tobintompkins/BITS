import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const ACTOR_ID = "00000000-0000-4000-8000-00000000c001";

const state = vi.hoisted(() => ({
  org: null as null | Record<string, unknown>,
  audits: [] as Array<Record<string, unknown>>,
  membership: { id: "membership-1", roleType: { code: "ORG_ADMIN" } } as {
    id: string;
    roleType: { code: string };
  } | null,
  txMembership: { id: "membership-1" } as { id: string } | null,
  updates: 0,
  transactions: 0,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "clerk-user", orgId: "clerk-org" })),
  currentUser: vi.fn(async () => ({ publicMetadata: {} })),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findFirst: async () => state.org,
      findUnique: async () => state.org,
    },
    userAccount: {
      findUnique: async () => ({ id: ACTOR_ID, active: true, clerkUserId: "clerk-user" }),
    },
    organizationMembership: {
      findFirst: async () => state.membership,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      state.transactions += 1;
      const snapshot = structuredClone(state.org);
      const auditCount = state.audits.length;
      const tx = {
        $queryRaw: async () => [{ id: ORG_ID }],
        organizationMembership: {
          findFirst: async () => state.txMembership,
        },
        organization: {
          findUnique: async () => state.org,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            state.updates += 1;
            state.org = { ...state.org, ...data };
            return state.org;
          },
        },
        auditEvent: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            state.audits.push(data);
            return data;
          },
        },
      };
      try {
        return await fn(tx);
      } catch (error) {
        state.org = snapshot;
        state.audits.length = auditCount;
        throw error;
      }
    },
  },
}));

import { currentUser } from "@clerk/nextjs/server";
import { runWithOrganizationLogoRoot } from "@/lib/storage/organization-logo";
import type { OrganizationSettingsInput } from "@/lib/validation/organization-settings";
import {
  runWithOrganizationSettingsSeams,
  saveOrganizationSettings,
} from "@/server/services/organization-settings.service";

function church(logoStorageKey: string | null = null) {
  return {
    id: ORG_ID,
    active: true,
    clerkOrganizationId: "clerk-org",
    name: "Alpha Chapel",
    displayName: "Alpha Chapel",
    slug: "alpha-chapel",
    ein: null,
    mailingAddressLine1: "1 Test Lane",
    mailingAddressLine2: null,
    city: "Testville",
    state: "TN",
    postalCode: "37201",
    country: "US",
    contactPhone: null,
    contactEmail: "office@alpha.test",
    websiteUrl: null,
    statementFooterText: null,
    timeZone: "America/New_York",
    locale: "en-US",
    logoStorageKey,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function input(overrides: Partial<OrganizationSettingsInput> = {}): OrganizationSettingsInput {
  return {
    churchName: "Alpha Chapel",
    displayName: "Alpha Chapel",
    addressLine1: "1 Test Lane",
    city: "Testville",
    state: "TN",
    zipCode: "37201",
    country: "US",
    ein: undefined,
    addressLine2: undefined,
    phone: undefined,
    email: "office@alpha.test",
    website: undefined,
    timeZone: "America/New_York",
    statementFooter: undefined,
    ...overrides,
  };
}

function png(bytes: string) {
  return new File([Buffer.from(bytes)], "logo.png", { type: "image/png" });
}

describe("organization settings audit", () => {
  const roots: string[] = [];

  beforeEach(() => {
    state.org = church();
    state.audits = [];
    state.membership = { id: "membership-1", roleType: { code: "ORG_ADMIN" } };
    state.txMembership = { id: "membership-1" };
    state.updates = 0;
    state.transactions = 0;
    vi.mocked(currentUser).mockResolvedValue({ publicMetadata: {} } as never);
  });

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function withRoot<T>(fn: (root: string) => Promise<T>) {
    const root = await mkdtemp(path.join(tmpdir(), "bits-org-settings-"));
    roots.push(root);
    return runWithOrganizationLogoRoot(root, () => fn(root));
  }

  it("does not stage a file or write when the church is unresolved", async () => {
    state.org = null;
    await withRoot(async (root) => {
      await expect(
        saveOrganizationSettings(input({ churchName: "Other Chapel" }), {
          logoFile: png("new"),
        }),
      ).rejects.toThrow(/select a church/i);
      expect(state.transactions).toBe(0);
      await expect(readFile(path.join(root, "uploads", "organizations", ORG_ID, "logo.png"))).rejects.toThrow();
    });
  });

  it("does not stage a file when the actor cannot edit the resolved church", async () => {
    state.membership = null;
    await withRoot(async () => {
      await expect(
        saveOrganizationSettings(input({ churchName: "Other Chapel" }), {
          logoFile: png("new"),
        }),
      ).rejects.toThrow(/permission/i);
      expect(state.transactions).toBe(0);
      expect(state.updates).toBe(0);
    });
  });

  it("rolls back an ordinary settings change when the audit fails", async () => {
    await withRoot(async () => {
      await expect(
        runWithOrganizationSettingsSeams({ failAudit: true }, () =>
          saveOrganizationSettings(input({ churchName: "Beta Chapel" })),
        ),
      ).rejects.toThrow(/audit failure/i);
      expect(state.org).toMatchObject({ name: "Alpha Chapel" });
      expect(state.audits).toHaveLength(0);
      expect(state.updates).toBe(1);
    });
  });

  it("rolls back a logo replacement and removes only the staged file", async () => {
    await withRoot(async (root) => {
      const dir = path.join(root, "uploads", "organizations", ORG_ID);
      await mkdir(dir, { recursive: true });
      const prior = path.join(dir, "logo.png");
      await writeFile(prior, "prior-bytes");
      state.org = church(`/uploads/organizations/${ORG_ID}/logo.png`);

      await expect(
        runWithOrganizationSettingsSeams(
          {
            failAudit: true,
            afterLock: async ({ predecessorKey }) => {
              expect(predecessorKey).toBe(`/uploads/organizations/${ORG_ID}/logo.png`);
              expect(await readFile(prior, "utf8")).toBe("prior-bytes");
            },
          },
          () =>
            saveOrganizationSettings(input({ churchName: "Beta Chapel" }), {
              logoFile: png("next-bytes"),
            }),
        ),
      ).rejects.toThrow(/audit failure/i);

      expect(state.org).toMatchObject({
        name: "Alpha Chapel",
        logoStorageKey: `/uploads/organizations/${ORG_ID}/logo.png`,
      });
      expect(await readFile(prior, "utf8")).toBe("prior-bytes");
      const entries = await import("node:fs/promises").then((fs) => fs.readdir(dir));
      expect(entries).toEqual(["logo.png"]);
    });
  });

  it("audits a committed replacement and deletes the predecessor afterward", async () => {
    await withRoot(async (root) => {
      const dir = path.join(root, "uploads", "organizations", ORG_ID);
      await mkdir(dir, { recursive: true });
      const prior = path.join(dir, "logo.png");
      await writeFile(prior, "prior-bytes");
      state.org = church(`/uploads/organizations/${ORG_ID}/logo.png`);
      const saved = await saveOrganizationSettings(input({ churchName: "Beta Chapel" }), {
        logoFile: png("next-bytes"),
      });
      expect(saved.organization).toMatchObject({ name: "Beta Chapel" });
      expect(saved.organization.logoStorageKey).not.toContain("/logo.png");
      expect(saved.cleanupNotice).toBeNull();
      expect(state.audits).toHaveLength(1);
      expect(state.audits[0]).toMatchObject({
        action: "UPDATE",
        entityType: "Organization",
        entityId: ORG_ID,
        actorUserAccountId: ACTOR_ID,
        organizationId: ORG_ID,
      });
      expect(JSON.stringify(state.audits[0])).toContain("Beta Chapel");
      expect(JSON.stringify(state.audits[0])).not.toContain("next-bytes");
      await expect(readFile(prior)).rejects.toThrow();
      const stagedPath = path.join(root, saved.organization.logoStorageKey!.slice(1));
      expect(await readFile(stagedPath, "utf8")).toBe("next-bytes");
    });
  });

  it("audits logo removal and deletes the old file after commit", async () => {
    await withRoot(async (root) => {
      const dir = path.join(root, "uploads", "organizations", ORG_ID);
      await mkdir(dir, { recursive: true });
      const prior = path.join(dir, "logo.png");
      await writeFile(prior, "prior-bytes");
      state.org = church(`/uploads/organizations/${ORG_ID}/logo.png`);
      const saved = await saveOrganizationSettings(input(), { removeLogo: true });
      expect(saved.organization.logoStorageKey).toBeNull();
      expect(state.audits).toHaveLength(1);
      await expect(readFile(prior)).rejects.toThrow();
    });
  });

  it("does not write an audit row when nothing changed", async () => {
    await withRoot(async () => {
      const saved = await saveOrganizationSettings(input());
      expect(saved.organization).toMatchObject({ name: "Alpha Chapel" });
      expect(state.updates).toBe(0);
      expect(state.audits).toHaveLength(0);
    });
  });

  it("keeps the saved settings when predecessor cleanup fails", async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });
    try {
      await withRoot(async (root) => {
        const dir = path.join(root, "uploads", "organizations", ORG_ID);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, "logo.png"), "prior-bytes");
        state.org = church(`/uploads/organizations/${ORG_ID}/logo.png`);
        const saved = await runWithOrganizationSettingsSeams(
          { failPredecessorCleanup: true },
          () =>
            saveOrganizationSettings(input({ churchName: "Beta Chapel" }), {
              logoFile: png("next-bytes"),
            }),
        );
        expect(saved.organization.name).toBe("Beta Chapel");
        expect(saved.cleanupNotice).toMatch(/previous logo file is still stored/i);
        expect(await readFile(path.join(dir, "logo.png"), "utf8")).toBe("prior-bytes");
        expect(JSON.stringify(errors)).toContain("organization-logo-predecessor-retained");
        expect(JSON.stringify(errors)).not.toContain("prior-bytes");
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("does not open a transaction when the logo file cannot be written", async () => {
    const { runWithOrganizationLogoSeams } = await import("@/lib/storage/organization-logo");
    await withRoot(async () => {
      await expect(
        runWithOrganizationLogoSeams({ failWrite: true }, () =>
          saveOrganizationSettings(input(), { logoFile: png("next-bytes") }),
        ),
      ).rejects.toThrow(/could not be saved/i);
      expect(state.transactions).toBe(0);
      expect(state.org).toMatchObject({ name: "Alpha Chapel", logoStorageKey: null });
    });
  });
});
