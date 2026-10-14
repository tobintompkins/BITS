import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  PrismaClient,
  RoleCode,
  StaffInvitationStatus,
} from "@/app/generated/prisma/client";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  isolatedDatabaseNameIsDedicated,
  parsePostgresTargetIdentity,
  postgresTargetsAreEquivalent,
} from "@/lib/testing/original-v1-database-url";
import { inspectStaffInvitationSchema } from "@/lib/testing/staff-invitation-schema-readiness";

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

const runId = `core10-${randomUUID().slice(0, 8)}`;

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: isolatedUrl }),
  });
}

describe.skipIf(!canUseIsolatedDb)(
  "staff invitation concurrency (isolated bits_e2e)",
  () => {
    const clients: PrismaClient[] = [];
    const created = {
      organizationIds: [] as string[],
      userAccountIds: [] as string[],
      membershipIds: [] as string[],
      invitationIds: [] as string[],
    };

    afterAll(async () => {
      const prisma = clients[0] ?? createClient();
      if (!clients.includes(prisma)) clients.push(prisma);
      try {
        if (created.invitationIds.length) {
          await prisma.staffInvitation.deleteMany({
            where: { id: { in: created.invitationIds } },
          });
        }
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

    it("serializes duplicate active invitations and revoke-versus-accept", async () => {
      const setup = createClient();
      clients.push(setup);
      const schema = await inspectStaffInvitationSchema(setup);
      if (schema.status !== "ready") {
        throw new Error(
          "Staff invitation schema is not ready on bits_e2e. Run npm run staff:invitation-schema-setup.",
        );
      }

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
          clerkOrganizationId: `org_${runId}`,
        },
      });
      created.organizationIds.push(org.id);

      const admin = await setup.userAccount.create({
        data: {
          clerkUserId: `user_${runId}_admin`,
          primaryEmail: `${runId}-admin@example.test`,
        },
      });
      created.userAccountIds.push(admin.id);
      const adminRole = await setup.roleType.findUniqueOrThrow({
        where: { code: RoleCode.ORG_ADMIN },
      });
      const membership = await setup.organizationMembership.create({
        data: {
          organizationId: org.id,
          userAccountId: admin.id,
          roleTypeId: adminRole.id,
          active: true,
        },
      });
      created.membershipIds.push(membership.id);

      const a = createClient();
      const b = createClient();
      clients.push(a, b);
      const results = await Promise.allSettled([
        a.staffInvitation.create({
          data: {
            organizationId: org.id,
            emailNormalized: `${runId}@example.test`,
            emailDisplay: `${runId}@example.test`,
            roleCode: RoleCode.TREASURER,
            invitedByUserAccountId: admin.id,
            status: StaffInvitationStatus.AUTHORIZED,
            clerkOrganizationId: `org_${runId}`,
            expiresAt: new Date("2026-12-01T00:00:00.000Z"),
            activeEmailKey: `${runId}@example.test`,
          },
        }),
        b.staffInvitation.create({
          data: {
            organizationId: org.id,
            emailNormalized: `${runId}@example.test`,
            emailDisplay: `${runId}@example.test`,
            roleCode: RoleCode.DATA_ENTRY,
            invitedByUserAccountId: admin.id,
            status: StaffInvitationStatus.AUTHORIZED,
            clerkOrganizationId: `org_${runId}`,
            expiresAt: new Date("2026-12-01T00:00:00.000Z"),
            activeEmailKey: `${runId}@example.test`,
          },
        }),
      ]);
      const createdRows = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      created.invitationIds.push(...createdRows.map((row) => row.id));
      expect(createdRows).toHaveLength(1);

      const invitation = createdRows[0]!;
      const invitee = await setup.userAccount.create({
        data: {
          clerkUserId: `user_${runId}_invitee`,
          primaryEmail: `${runId}@example.test`,
        },
      });
      created.userAccountIds.push(invitee.id);
      const treasurer = await setup.roleType.findUniqueOrThrow({
        where: { code: RoleCode.TREASURER },
      });

      const revokeClient = createClient();
      const acceptClient = createClient();
      clients.push(revokeClient, acceptClient);
      const raced = await Promise.allSettled([
        revokeClient.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${org.id}::uuid FOR UPDATE`;
          const locked = await tx.staffInvitation.findUniqueOrThrow({
            where: { id: invitation.id },
          });
          if (
            locked.status === StaffInvitationStatus.ACCEPTED ||
            locked.status === StaffInvitationStatus.REVOKED ||
            locked.status === StaffInvitationStatus.EXPIRED
          ) {
            return { revoked: false };
          }
          await tx.staffInvitation.update({
            where: { id: invitation.id },
            data: {
              status: StaffInvitationStatus.REVOKED,
              activeEmailKey: null,
              version: { increment: 1 },
            },
          });
          return { revoked: true };
        }),
        acceptClient.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${org.id}::uuid FOR UPDATE`;
          const locked = await tx.staffInvitation.findUniqueOrThrow({
            where: { id: invitation.id },
          });
          if (
            locked.status === StaffInvitationStatus.REVOKED ||
            locked.status === StaffInvitationStatus.ACCEPTED
          ) {
            return { granted: false };
          }
          const createdMembership = await tx.organizationMembership.create({
            data: {
              organizationId: org.id,
              userAccountId: invitee.id,
              roleTypeId: treasurer.id,
              active: true,
            },
          });
          created.membershipIds.push(createdMembership.id);
          await tx.staffInvitation.update({
            where: { id: invitation.id },
            data: {
              status: StaffInvitationStatus.ACCEPTED,
              activeEmailKey: null,
              acceptedUserAccountId: invitee.id,
            },
          });
          return { granted: true };
        }),
      ]);
      expect(raced.every((result) => result.status === "fulfilled")).toBe(true);
      const after = await setup.staffInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      });
      const granted = await setup.organizationMembership.findMany({
        where: { organizationId: org.id, userAccountId: invitee.id },
      });
      if (after.status === StaffInvitationStatus.REVOKED) {
        expect(granted).toHaveLength(0);
      } else {
        expect(after.status).toBe(StaffInvitationStatus.ACCEPTED);
        expect(granted).toHaveLength(1);
      }
    });
  },
);
