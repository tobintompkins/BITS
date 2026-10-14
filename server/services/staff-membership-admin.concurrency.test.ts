import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import { PrismaClient, RoleCode } from "@/app/generated/prisma/client";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  isolatedDatabaseNameIsDedicated,
  parsePostgresTargetIdentity,
  postgresTargetsAreEquivalent,
} from "@/lib/testing/original-v1-database-url";
import {
  assertStaffMembershipVersionSchemaReady,
  inspectStaffMembershipVersionSchema,
  staffMembershipSchemaReadinessMessage,
} from "@/lib/testing/staff-membership-schema-readiness";
import { applyStaffMembershipChange } from "@/server/services/staff-membership-admin.service";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAccount: { findUnique: async () => null },
    $transaction: async (fn: (tx: never) => Promise<unknown>) => fn(null as never),
  },
}));

loadOriginalV1AcceptanceEnvFiles();

const isolatedUrl = process.env.BITS_E2E_DATABASE_URL?.trim() ?? "";
const workingUrl = process.env.DATABASE_URL?.trim() ?? "";
const isolatedIdentity = isolatedUrl
  ? parsePostgresTargetIdentity(isolatedUrl)
  : null;
const isolatedIsDedicated = Boolean(
  isolatedIdentity && isolatedDatabaseNameIsDedicated(isolatedIdentity.database),
);
const isolatedIsWorkingDb =
  isolatedUrl && workingUrl
    ? postgresTargetsAreEquivalent(isolatedUrl, workingUrl)
    : false;
const canUseIsolatedDb = isolatedIsDedicated && !isolatedIsWorkingDb;

const runId = `core09a-${randomUUID().slice(0, 8)}`;

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: isolatedUrl }),
  });
}

describe.skipIf(!canUseIsolatedDb)(
  "staff membership admin concurrency (isolated bits_e2e)",
  () => {
    const clients: PrismaClient[] = [];
    const created = {
      organizationIds: [] as string[],
      userAccountIds: [] as string[],
      membershipIds: [] as string[],
    };

    afterAll(async () => {
      const prisma = clients[0] ?? createClient();
      if (!clients.includes(prisma)) clients.push(prisma);
      try {
        if (created.membershipIds.length) {
          await prisma.organizationMembership.deleteMany({
            where: { id: { in: created.membershipIds } },
          });
        }
        if (created.userAccountIds.length) {
          await prisma.userAccount.deleteMany({
            where: { id: { in: created.userAccountIds } },
          });
        }
        if (created.organizationIds.length) {
          await prisma.organization.deleteMany({
            where: { id: { in: created.organizationIds } },
          });
        }
      } finally {
        await Promise.all(clients.map((client) => client.$disconnect()));
      }
    });

    it("serializes competing last-admin demotions and denies the revoked actor", async () => {
      const setup = createClient();
      clients.push(setup);
      const schema = await inspectStaffMembershipVersionSchema(setup);
      if (schema.status !== "ready") {
        throw new Error(
          `${staffMembershipSchemaReadinessMessage(schema)} Run npm run staff:membership-schema-setup first.`,
        );
      }
      assertStaffMembershipVersionSchemaReady(schema);

      for (const code of [
        RoleCode.ORG_ADMIN,
        RoleCode.TREASURER,
        RoleCode.DATA_ENTRY,
        RoleCode.REPORT_VIEWER,
        RoleCode.DONOR,
      ]) {
        await setup.roleType.upsert({
          where: { code },
          update: {},
          create: { code, name: code },
        });
      }

      const org = await setup.organization.create({
        data: {
          name: `${runId} Chapel`,
          slug: runId,
          mailingAddressLine1: "1 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
        },
      });
      created.organizationIds.push(org.id);

      const adminRole = await setup.roleType.findUniqueOrThrow({
        where: { code: RoleCode.ORG_ADMIN },
      });

      const actorA = await setup.userAccount.create({
        data: {
          clerkUserId: `${runId}-a`,
          primaryEmail: `${runId}-a@church.test`,
          displayName: "Admin A",
        },
      });
      const actorB = await setup.userAccount.create({
        data: {
          clerkUserId: `${runId}-b`,
          primaryEmail: `${runId}-b@church.test`,
          displayName: "Admin B",
        },
      });
      created.userAccountIds.push(actorA.id, actorB.id);

      const membershipA = await setup.organizationMembership.create({
        data: {
          organizationId: org.id,
          userAccountId: actorA.id,
          roleTypeId: adminRole.id,
          active: true,
        },
      });
      const membershipB = await setup.organizationMembership.create({
        data: {
          organizationId: org.id,
          userAccountId: actorB.id,
          roleTypeId: adminRole.id,
          active: true,
        },
      });
      created.membershipIds.push(membershipA.id, membershipB.id);

      const clientA = createClient();
      const clientB = createClient();
      clients.push(clientA, clientB);

      const results = await Promise.all([
        clientA.$transaction((tx) =>
          applyStaffMembershipChange({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actorA.id,
            update: {
              membershipId: membershipB.id,
              expectedVersion: membershipB.version,
              expectedUpdatedAt: membershipB.updatedAt.toISOString(),
              roleCode: RoleCode.TREASURER,
              active: false,
              confirm: true,
            },
          }),
        ),
        clientB.$transaction((tx) =>
          applyStaffMembershipChange({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actorB.id,
            update: {
              membershipId: membershipA.id,
              expectedVersion: membershipA.version,
              expectedUpdatedAt: membershipA.updatedAt.toISOString(),
              roleCode: RoleCode.TREASURER,
              active: false,
              confirm: true,
            },
          }),
        ),
      ]);

      const succeeded = results.filter((row) => row.ok && "changed" in row && row.changed);
      const failed = results.filter((row) => !row.ok);
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(["UNAUTHORIZED", "LAST_ADMIN", "CONFLICT"]).toContain(
        failed[0] && !failed[0].ok ? failed[0].code : "",
      );

      const remaining = await setup.organizationMembership.findMany({
        where: {
          organizationId: org.id,
          active: true,
          roleTypeId: adminRole.id,
          userAccount: { active: true },
        },
      });
      expect(remaining).toHaveLength(1);

      const revokedActorId =
        remaining[0]?.userAccountId === actorA.id ? actorB.id : actorA.id;
      const stillActive = remaining[0]!;
      const retry = await clientB.$transaction((tx) =>
        applyStaffMembershipChange({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: revokedActorId,
          update: {
            membershipId: stillActive.id,
            expectedVersion: stillActive.version,
            expectedUpdatedAt: stillActive.updatedAt.toISOString(),
            roleCode: RoleCode.TREASURER,
            active: true,
            confirm: true,
          },
        }),
      );
      expect(retry).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    });
  },
);
