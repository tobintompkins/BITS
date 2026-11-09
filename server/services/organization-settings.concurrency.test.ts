import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import { PrismaClient, RoleCode } from "@/app/generated/prisma/client";
import { runWithOrganizationLogoRoot } from "@/lib/storage/organization-logo";
import {
  isolatedConnectionString,
  isolatedDatabaseRunEnabled,
} from "@/lib/testing/isolated-database";
import { runWithObservedLockContention } from "@/lib/testing/giving-household-lock-contention";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import type { OrganizationSettingsInput } from "@/lib/validation/organization-settings";
import {
  runWithOrganizationSettingsSeams,
  saveOrganizationSettings,
} from "@/server/services/organization-settings.service";

const actorStore = new AsyncLocalStorage<{ userId: string; orgId: string }>();

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => actorStore.getStore() ?? { userId: null, orgId: null },
  currentUser: async () => ({
    publicMetadata: {},
    primaryEmailAddress: { emailAddress: "org-settings@church.test" },
  }),
}));

loadOriginalV1AcceptanceEnvFiles();

const canUseIsolatedDb = isolatedDatabaseRunEnabled();
const runId = `core23-${randomUUID().slice(0, 8)}`;

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: isolatedConnectionString(),
      max: 3,
    }),
  });
}

function settings(name: string): OrganizationSettingsInput {
  return {
    churchName: name,
    displayName: name,
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
  };
}

function png(bytes: string) {
  return new File([Buffer.from(bytes)], "logo.png", { type: "image/png" });
}

describe.skipIf(!canUseIsolatedDb)(
  "organization settings audit atomicity (isolated bits_e2e)",
  () => {
    const clients: PrismaClient[] = [];
    const created = {
      organizationIds: [] as string[],
      userAccountIds: [] as string[],
    };
    const roots: string[] = [];

    afterAll(async () => {
      const prisma = clients[0] ?? createClient();
      if (!clients.includes(prisma)) clients.push(prisma);
      try {
        if (created.organizationIds.length) {
          await prisma.organization.deleteMany({
            where: { id: { in: created.organizationIds } },
          });
        }
        if (created.userAccountIds.length) {
          await prisma.userAccount.deleteMany({
            where: { id: { in: created.userAccountIds } },
          });
        }
      } finally {
        await Promise.all(clients.map((client) => client.$disconnect()));
        await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
      }
    });

    async function seed() {
      const setup = createClient();
      clients.push(setup);
      for (const code of [RoleCode.ORG_ADMIN, RoleCode.TREASURER]) {
        await setup.roleType.upsert({
          where: { code },
          update: {},
          create: { code, name: code },
        });
      }
      const key = `${runId}-${randomUUID().slice(0, 8)}`;
      const actor = await setup.userAccount.create({
        data: {
          clerkUserId: key,
          primaryEmail: `${key}@church.test`,
          displayName: "Settings Actor",
        },
      });
      created.userAccountIds.push(actor.id);
      const org = await setup.organization.create({
        data: {
          name: "Alpha Chapel",
          displayName: "Alpha Chapel",
          slug: key,
          clerkOrganizationId: `org_${key}`,
          mailingAddressLine1: "1 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
          contactEmail: "office@alpha.test",
          timeZone: "America/New_York",
          logoStorageKey: null,
        },
      });
      created.organizationIds.push(org.id);
      const role = await setup.roleType.findUniqueOrThrow({
        where: { code: RoleCode.ORG_ADMIN },
      });
      await setup.organizationMembership.create({
        data: {
          organizationId: org.id,
          userAccountId: actor.id,
          roleTypeId: role.id,
          active: true,
        },
      });
      const root = await mkdtemp(path.join(tmpdir(), "bits-org-settings-sql-"));
      roots.push(root);
      return { setup, actor, org, key, root };
    }

    it("rolls back the church row and staged logo when the audit write fails", async () => {
      const { setup, org, key, root } = await seed();
      const dir = path.join(root, "uploads", "organizations", org.id);
      await mkdir(dir, { recursive: true });
      const prior = path.join(dir, "logo.png");
      await writeFile(prior, "prior-bytes");
      await setup.organization.update({
        where: { id: org.id },
        data: { logoStorageKey: `/uploads/organizations/${org.id}/logo.png` },
      });

      await expect(
        actorStore.run({ userId: key, orgId: `org_${key}` }, () =>
          runWithOrganizationLogoRoot(root, () =>
            runWithOrganizationSettingsSeams(
              {
                failAudit: true,
                afterLock: async () => {
                  expect(await readFile(prior, "utf8")).toBe("prior-bytes");
                },
              },
              () =>
                saveOrganizationSettings(settings("Beta Chapel"), {
                  logoFile: png("next-bytes"),
                }),
            ),
          ),
        ),
      ).rejects.toThrow(/audit failure/i);

      const current = await setup.organization.findUniqueOrThrow({
        where: { id: org.id },
      });
      expect(current.name).toBe("Alpha Chapel");
      expect(current.logoStorageKey).toBe(
        `/uploads/organizations/${org.id}/logo.png`,
      );
      expect(
        await setup.auditEvent.count({ where: { organizationId: org.id } }),
      ).toBe(0);
      expect(await readFile(prior, "utf8")).toBe("prior-bytes");
      expect(await readdir(dir)).toEqual(["logo.png"]);
    });

    it("serializes competing replacements without overwriting the prior logo first", async () => {
      const { setup, org, key, root } = await seed();
      const dir = path.join(root, "uploads", "organizations", org.id);
      await mkdir(dir, { recursive: true });
      const prior = path.join(dir, "logo.png");
      await writeFile(prior, "prior-bytes");
      await setup.organization.update({
        where: { id: org.id },
        data: { logoStorageKey: `/uploads/organizations/${org.id}/logo.png` },
      });
      let sawPriorBeforeCommit = false;

      const results = await actorStore.run({ userId: key, orgId: `org_${key}` }, () =>
        runWithOrganizationLogoRoot(root, () =>
          runWithObservedLockContention(
            setup,
            () =>
              runWithOrganizationSettingsSeams(
                {
                  afterLock: async ({ predecessorKey }) => {
                    expect(predecessorKey).toBe(
                      `/uploads/organizations/${org.id}/logo.png`,
                    );
                    expect(await readFile(prior, "utf8")).toBe("prior-bytes");
                    sawPriorBeforeCommit = true;
                  },
                },
                () =>
                  saveOrganizationSettings(settings("Beta Chapel"), {
                    logoFile: png("beta-bytes"),
                  }),
              ),
            () =>
              saveOrganizationSettings(settings("Gamma Chapel"), {
                logoFile: png("gamma-bytes"),
              }),
          ),
        ),
      );

      expect(sawPriorBeforeCommit).toBe(true);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("fulfilled");
      if (results[0].status !== "fulfilled" || results[1].status !== "fulfilled") {
        return;
      }
      const first = results[0].value;
      const second = results[1].value;
      expect(first.cleanupNotice).toBeNull();
      expect(second.cleanupNotice).toBeNull();
      const current = await setup.organization.findUniqueOrThrow({
        where: { id: org.id },
      });
      const keys = [first.organization.logoStorageKey, second.organization.logoStorageKey];
      expect(keys.every((item) => item && !item.endsWith("/logo.png"))).toBe(true);
      expect(current.logoStorageKey).toBe(
        current.name === "Beta Chapel"
          ? first.organization.logoStorageKey
          : second.organization.logoStorageKey,
      );
      const winner = current.name === "Beta Chapel" ? "beta-bytes" : "gamma-bytes";
      const loserKey =
        current.logoStorageKey === first.organization.logoStorageKey
          ? second.organization.logoStorageKey
          : first.organization.logoStorageKey;
      expect(
        await readFile(path.join(root, current.logoStorageKey!.slice(1)), "utf8"),
      ).toBe(winner);
      await expect(readFile(prior)).rejects.toThrow();
      await expect(readFile(path.join(root, loserKey!.slice(1)))).rejects.toThrow();
      expect(
        await setup.auditEvent.count({
          where: { organizationId: org.id, action: "UPDATE" },
        }),
      ).toBe(2);
    });
  },
);
