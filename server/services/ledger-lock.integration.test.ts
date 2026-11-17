import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  OfferingBatchStatus,
  PrismaClient,
  RoleCode,
} from "@/app/generated/prisma/client";
import { utcTodayDateString } from "@/lib/batches/dates";
import { moneyEquals } from "@/lib/money/decimal";
import {
  isolatedConnectionString,
  isolatedDatabaseRunEnabled,
} from "@/lib/testing/isolated-database";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import { postgresTargetsAreEquivalent } from "@/lib/testing/original-v1-database-url";
import {
  assertLedgerSchemaReady,
  inspectLedgerSchema,
  ledgerSchemaReadinessMessage,
} from "@/lib/testing/ledger-schema-readiness";
import { createManualBatchDonation, deleteManualBatchDonation, updateManualBatchDonation } from "@/server/services/manual-batch-donation.service";
import { lockOfferingBatch, recordOfferingBatchDeposit } from "@/server/services/offering-batch-deposit.service";
import {
  completeOfferingBatchEntry,
  reconcileOfferingBatch,
} from "@/server/services/offering-batch-transition.service";

const session = vi.hoisted(() => ({ userId: "", orgId: "" }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: session.userId || null,
    orgId: session.orgId || null,
  }),
  currentUser: async () => null,
}));

loadOriginalV1AcceptanceEnvFiles();

const canUseIsolatedDb = isolatedDatabaseRunEnabled();
const runId = `lock-${randomUUID().slice(0, 8)}`;
const roles = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.DATA_ENTRY,
  RoleCode.REPORT_VIEWER,
  RoleCode.DONOR,
] as const;

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: isolatedConnectionString(),
      max: 2,
    }),
  });
}

function assertIsolatedTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl ||
    !postgresTargetsAreEquivalent(databaseUrl, isolatedConnectionString())
  ) {
    throw new Error(
      "Ledger lock SQL refused to run because DATABASE_URL is not isolated bits_e2e.",
    );
  }
}

describe.skipIf(!canUseIsolatedDb)(
  "ledger lock matrix (isolated bits_e2e)",
  () => {
    const clients: PrismaClient[] = [];
    const created = {
      organizationIds: [] as string[],
      userAccountIds: [] as string[],
    };

    afterAll(async () => {
      const prisma = clients[0] ?? createClient();
      if (!clients.includes(prisma)) clients.push(prisma);
      try {
        if (created.organizationIds.length) {
          await prisma.auditEvent.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.ledgerCreateIdempotency.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.donationAllocation.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.donation.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.offeringBatch.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.offeringType.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.donor.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.organizationMembership.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
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
      }
    });

    it("enforces role, status, and stale-confirmation rules through lock", async () => {
      assertIsolatedTarget();
      const setup = createClient();
      clients.push(setup);
      const schema = await inspectLedgerSchema(setup);
      if (schema.status !== "ready") {
        throw new Error(
          `${ledgerSchemaReadinessMessage(schema)} Isolated lock tests refuse to ALTER TABLE or use the working database.`,
        );
      }
      assertLedgerSchemaReady(schema);

      const roleRows = await setup.roleType.findMany({
        where: { code: { in: [...roles] } },
      });
      if (roleRows.length !== roles.length) {
        throw new Error(
          "Isolated role types are incomplete. Lock tests will not create global roles.",
        );
      }
      const roleId = new Map(roleRows.map((row) => [row.code, row.id]));

      const today = utcTodayDateString();
      const seedKey = `${runId}-${randomUUID().slice(0, 8)}`;
      const clerkOrgId = `org_${seedKey}`;
      const actors = new Map<
        RoleCode,
        { id: string; clerkUserId: string }
      >();
      for (const code of roles) {
        const clerkUserId = `${seedKey}-${code}`;
        const user = await setup.userAccount.create({
          data: {
            clerkUserId,
            primaryEmail: `${seedKey}-${code.toLowerCase()}@church.test`,
            displayName: `${code} Lock Actor`,
          },
        });
        created.userAccountIds.push(user.id);
        actors.set(code, { id: user.id, clerkUserId });
      }

      const org = await setup.organization.create({
        data: {
          name: `${seedKey} Chapel`,
          slug: seedKey,
          clerkOrganizationId: clerkOrgId,
          mailingAddressLine1: "1 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
        },
      });
      created.organizationIds.push(org.id);
      for (const code of roles) {
        await setup.organizationMembership.create({
          data: {
            organizationId: org.id,
            userAccountId: actors.get(code)!.id,
            roleTypeId: roleId.get(code)!,
          },
        });
      }
      const donor = await setup.donor.create({
        data: {
          organizationId: org.id,
          firstName: "Pat",
          lastName: seedKey,
        },
      });
      const fund = await setup.offeringType.create({
        data: {
          organizationId: org.id,
          name: "General",
          code: `${seedKey}-gen`,
        },
      });
      const batch = await setup.offeringBatch.create({
        data: {
          organizationId: org.id,
          name: `${seedKey} Sunday`,
          offeringDate: new Date(`${today}T00:00:00.000Z`),
          expectedTotal: "12.00",
          recordedTotal: "0.00",
          status: OfferingBatchStatus.DRAFT,
          createdByUserAccountId: actors.get(RoleCode.ORG_ADMIN)!.id,
        },
      });

      const other = await setup.organization.create({
        data: {
          name: `${seedKey} Other`,
          slug: `${seedKey}-other`,
          clerkOrganizationId: `org_${seedKey}_other`,
          mailingAddressLine1: "2 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
        },
      });
      created.organizationIds.push(other.id);
      const otherFund = await setup.offeringType.create({
        data: {
          organizationId: other.id,
          name: "Other",
          code: `${seedKey}-other`,
        },
      });
      const otherBatch = await setup.offeringBatch.create({
        data: {
          organizationId: other.id,
          name: `${seedKey} Other Sunday`,
          offeringDate: new Date(`${today}T00:00:00.000Z`),
          expectedTotal: "4.00",
          recordedTotal: "4.00",
          status: OfferingBatchStatus.DRAFT,
          createdByUserAccountId: actors.get(RoleCode.ORG_ADMIN)!.id,
        },
      });
      const otherGift = await setup.donation.create({
        data: {
          organizationId: other.id,
          batchId: otherBatch.id,
          offeringDate: new Date(`${today}T00:00:00.000Z`),
          receivedDate: new Date(`${today}T00:00:00.000Z`),
          paymentMethod: "CASH",
          totalAmount: "4.00",
          deductibleAmount: "4.00",
          anonymous: true,
        },
      });
      await setup.donationAllocation.create({
        data: {
          organizationId: other.id,
          donationId: otherGift.id,
          offeringTypeId: otherFund.id,
          amount: "4.00",
        },
      });
      const otherBaseline = await fingerprint(otherBatch.id);

      function useRole(code: RoleCode) {
        const actor = actors.get(code);
        if (!actor) throw new Error(`Missing ${code} actor.`);
        session.userId = actor.clerkUserId;
        session.orgId = clerkOrgId;
      }

      function gift(amount: string, checkNumber: string) {
        return {
          donorId: donor.id,
          anonymous: false,
          offeringDate: today,
          receivedDate: today,
          confirmOfferingDateOverride: false,
          paymentMethod: "CHECK" as const,
          checkNumber,
          reference: "",
          note: "",
          isTaxDeductible: true,
          deductibleAmount: amount,
          goodsOrServicesProvided: false,
          goodsOrServicesDescription: "",
          goodsOrServicesEstimatedValue: "",
          intangibleReligiousBenefitsOnly: true,
          allocations: [{ offeringTypeId: fund.id, amount }],
        };
      }

      async function loadBatch(batchId: string) {
        return setup.offeringBatch.findFirstOrThrow({
          where: { id: batchId },
        });
      }

      async function fingerprint(batchId: string) {
        const current = await loadBatch(batchId);
        const organizationId = current.organizationId;
        const donations = await setup.donation.findMany({
          where: { organizationId, batchId },
          orderBy: { id: "asc" },
          include: {
            allocations: { orderBy: { id: "asc" } },
          },
        });
        const audits = await setup.auditEvent.findMany({
          where: { organizationId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            action: true,
            entityId: true,
            actorUserAccountId: true,
            changeMetadata: true,
          },
        });
        const claims = await setup.ledgerCreateIdempotency.findMany({
          where: { organizationId, batchId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            operationToken: true,
            donationId: true,
            payloadFingerprint: true,
          },
        });
        return {
          status: current.status,
          recordedTotal: current.recordedTotal.toString(),
          expectedTotal: current.expectedTotal?.toString() ?? null,
          reviewVersion: current.reviewVersion,
          depositDate: current.depositDate?.toISOString() ?? null,
          depositReference: current.depositReference,
          gifts: donations.map((row) => ({
            id: row.id,
            donorId: row.donorId,
            anonymous: row.anonymous,
            totalAmount: row.totalAmount.toString(),
            checkNumber: row.checkNumber,
            allocations: row.allocations.map((allocation) => ({
              id: allocation.id,
              offeringTypeId: allocation.offeringTypeId,
              amount: allocation.amount.toString(),
            })),
          })),
          audits,
          claims,
        };
      }

      async function expectRejected(
        batchId: string,
        code: string,
        run: () => Promise<unknown>,
      ) {
        const before = await fingerprint(batchId);
        await expect(run()).rejects.toMatchObject({ code });
        expect(await fingerprint(batchId)).toEqual(before);
      }

      async function confirmation(
        batchId: string,
        overrides: Partial<{
          recordedTotal: string;
          expectedTotal: string;
          donationCount: number;
          reviewVersion: number;
        }> = {},
      ) {
        const current = await loadBatch(batchId);
        const donationCount = await setup.donation.count({
          where: { organizationId: current.organizationId, batchId },
        });
        return {
          confirmed: true as const,
          recordedTotal: overrides.recordedTotal ?? current.recordedTotal.toString(),
          expectedTotal:
            overrides.expectedTotal ?? current.expectedTotal?.toString() ?? "",
          donationCount: overrides.donationCount ?? donationCount,
          reviewVersion: overrides.reviewVersion ?? current.reviewVersion,
        };
      }

      useRole(RoleCode.TREASURER);
      await expectRejected(otherBatch.id, "NOT_FOUND", () =>
        updateManualBatchDonation(
          otherBatch.id,
          otherGift.id,
          gift("9.00", "699"),
          1,
        ),
      );
      await expectRejected(otherBatch.id, "NOT_FOUND", () =>
        lockOfferingBatch(otherBatch.id, {
          confirmed: true,
          recordedTotal: "4.00",
          expectedTotal: "4.00",
          donationCount: 1,
          reviewVersion: 1,
        }),
      );

      const primaryToken = randomUUID();
      session.userId = "";
      await expectRejected(batch.id, "SIGNED_OUT", () =>
        createManualBatchDonation(batch.id, gift("12.00", "601"), primaryToken),
      );
      useRole(RoleCode.REPORT_VIEWER);
      await expectRejected(batch.id, "FORBIDDEN", () =>
        createManualBatchDonation(batch.id, gift("12.00", "601"), primaryToken),
      );
      useRole(RoleCode.DONOR);
      await expectRejected(batch.id, "FORBIDDEN", () =>
        createManualBatchDonation(batch.id, gift("12.00", "601"), primaryToken),
      );

      useRole(RoleCode.DATA_ENTRY);
      const auditsBeforeCreate = (await fingerprint(batch.id)).audits.length;
      const createdGift = await createManualBatchDonation(
        batch.id,
        gift("10.00", "601"),
        primaryToken,
      );
      const afterCreate = await loadBatch(batch.id);
      expect(createdGift.id).toBeTruthy();
      expect(afterCreate.status).toBe(OfferingBatchStatus.DRAFT);
      expect(moneyEquals(afterCreate.recordedTotal.toString(), "10.00")).toBe(true);
      expect(afterCreate.reviewVersion).toBeGreaterThan(1);
      expect((await fingerprint(batch.id)).audits).toHaveLength(auditsBeforeCreate + 1);
      expect((await fingerprint(batch.id)).gifts).toEqual([
        expect.objectContaining({
          id: createdGift.id,
          donorId: donor.id,
          anonymous: false,
          allocations: [
            expect.objectContaining({ offeringTypeId: fund.id }),
          ],
        }),
      ]);
      expect(
        moneyEquals(
          (await fingerprint(batch.id)).gifts[0]?.allocations[0]?.amount ?? "",
          "10.00",
        ),
      ).toBe(true);

      await expectRejected(batch.id, "STALE_REVIEW", () =>
        updateManualBatchDonation(
          batch.id,
          createdGift.id,
          gift("12.00", "601"),
          afterCreate.reviewVersion - 1,
        ),
      );
      const auditsBeforeEdit = (await fingerprint(batch.id)).audits.length;
      await updateManualBatchDonation(
        batch.id,
        createdGift.id,
        gift("12.00", "601"),
        afterCreate.reviewVersion,
      );
      const afterEdit = await loadBatch(batch.id);
      expect(moneyEquals(afterEdit.recordedTotal.toString(), "12.00")).toBe(true);
      expect(afterEdit.reviewVersion).toBe(afterCreate.reviewVersion + 1);
      expect((await fingerprint(batch.id)).audits).toHaveLength(auditsBeforeEdit + 1);
      expect(
        moneyEquals(
          (await fingerprint(batch.id)).gifts[0]?.totalAmount ?? "",
          "12.00",
        ),
      ).toBe(true);

      useRole(RoleCode.TREASURER);
      const extraToken = randomUUID();
      const extra = await createManualBatchDonation(
        batch.id,
        gift("1.00", "602"),
        extraToken,
      );
      expect(moneyEquals((await loadBatch(batch.id)).recordedTotal.toString(), "13.00")).toBe(
        true,
      );
      useRole(RoleCode.DATA_ENTRY);
      const extraVersion = (await loadBatch(batch.id)).reviewVersion;
      await expectRejected(batch.id, "STALE_REVIEW", () =>
        deleteManualBatchDonation(batch.id, extra.id, extraVersion - 1),
      );
      const auditsBeforeDelete = (await fingerprint(batch.id)).audits.length;
      await deleteManualBatchDonation(batch.id, extra.id, extraVersion);
      const afterDelete = await loadBatch(batch.id);
      expect(afterDelete.status).toBe(OfferingBatchStatus.DRAFT);
      expect(moneyEquals(afterDelete.recordedTotal.toString(), "12.00")).toBe(true);
      expect((await fingerprint(batch.id)).gifts.map((row) => row.id)).toEqual([
        createdGift.id,
      ]);
      expect((await fingerprint(batch.id)).audits).toHaveLength(auditsBeforeDelete + 1);

      useRole(RoleCode.TREASURER);
      await expectRejected(batch.id, "INVALID_STATUS", async () =>
        reconcileOfferingBatch(batch.id, await confirmation(batch.id)),
      );
      await expectRejected(batch.id, "INVALID_STATUS", () =>
        recordOfferingBatchDeposit(batch.id, {
          depositDate: today,
          depositReference: "SLIP-LOCK-1",
        }),
      );
      useRole(RoleCode.ORG_ADMIN);
      await expectRejected(batch.id, "INVALID_STATUS", async () =>
        lockOfferingBatch(batch.id, await confirmation(batch.id)),
      );

      useRole(RoleCode.REPORT_VIEWER);
      await expectRejected(batch.id, "FORBIDDEN", async () =>
        completeOfferingBatchEntry(batch.id, await confirmation(batch.id)),
      );
      useRole(RoleCode.DATA_ENTRY);
      const auditsBeforeComplete = (await fingerprint(batch.id)).audits.length;
      const completed = await completeOfferingBatchEntry(
        batch.id,
        await confirmation(batch.id),
      );
      expect(completed.status).toBe(OfferingBatchStatus.ENTERED);
      expect(moneyEquals(completed.recordedTotal, "12.00")).toBe(true);
      expect((await loadBatch(batch.id)).reviewVersion).toBe(afterDelete.reviewVersion + 1);
      expect((await fingerprint(batch.id)).audits).toHaveLength(auditsBeforeComplete + 1);

      await expectRejected(batch.id, "NOT_EDITABLE", () =>
        createManualBatchDonation(batch.id, gift("1.00", "603"), randomUUID()),
      );
      await expectRejected(batch.id, "NOT_EDITABLE", async () =>
        updateManualBatchDonation(
          batch.id,
          createdGift.id,
          gift("11.00", "601"),
          (await loadBatch(batch.id)).reviewVersion,
        ),
      );
      await expectRejected(batch.id, "NOT_EDITABLE", async () =>
        deleteManualBatchDonation(
          batch.id,
          createdGift.id,
          (await loadBatch(batch.id)).reviewVersion,
        ),
      );
      await expectRejected(batch.id, "FORBIDDEN", async () =>
        reconcileOfferingBatch(batch.id, await confirmation(batch.id)),
      );
      useRole(RoleCode.TREASURER);
      const entered = await loadBatch(batch.id);
      await expectRejected(batch.id, "STALE_REVIEW", async () =>
        reconcileOfferingBatch(
          batch.id,
          await confirmation(batch.id, { reviewVersion: entered.reviewVersion - 1 }),
        ),
      );
      await expectRejected(batch.id, "CONCURRENT_CHANGE", async () =>
        reconcileOfferingBatch(
          batch.id,
          await confirmation(batch.id, { recordedTotal: "0.00" }),
        ),
      );
      await expectRejected(batch.id, "INVALID_STATUS", () =>
        recordOfferingBatchDeposit(batch.id, {
          depositDate: today,
          depositReference: "SLIP-LOCK-1",
        }),
      );
      useRole(RoleCode.ORG_ADMIN);
      await expectRejected(batch.id, "INVALID_STATUS", async () =>
        lockOfferingBatch(batch.id, await confirmation(batch.id)),
      );

      useRole(RoleCode.TREASURER);
      const auditsBeforeReconcile = (await fingerprint(batch.id)).audits.length;
      const reconciled = await reconcileOfferingBatch(
        batch.id,
        await confirmation(batch.id),
      );
      expect(reconciled.status).toBe(OfferingBatchStatus.RECONCILED);
      expect(moneyEquals(reconciled.recordedTotal, "12.00")).toBe(true);
      expect((await loadBatch(batch.id)).reviewVersion).toBe(entered.reviewVersion + 1);
      expect((await fingerprint(batch.id)).audits).toHaveLength(
        auditsBeforeReconcile + 1,
      );

      await expectRejected(batch.id, "DEPOSIT_REQUIRED", async () =>
        lockOfferingBatch(batch.id, await confirmation(batch.id)),
      );
      await expectRejected(batch.id, "DEPOSIT_DATE_BEFORE_OFFERING", () =>
        recordOfferingBatchDeposit(batch.id, {
          depositDate: "2000-01-01",
          depositReference: "SLIP-LOCK-1",
        }),
      );
      useRole(RoleCode.DATA_ENTRY);
      await expectRejected(batch.id, "FORBIDDEN", () =>
        recordOfferingBatchDeposit(batch.id, {
          depositDate: today,
          depositReference: "SLIP-LOCK-1",
        }),
      );
      useRole(RoleCode.REPORT_VIEWER);
      await expectRejected(batch.id, "FORBIDDEN", async () =>
        lockOfferingBatch(batch.id, await confirmation(batch.id)),
      );

      useRole(RoleCode.TREASURER);
      const auditsBeforeDeposit = (await fingerprint(batch.id)).audits.length;
      const deposited = await recordOfferingBatchDeposit(batch.id, {
        depositDate: today,
        depositReference: "SLIP-LOCK-1",
      });
      expect(deposited.depositReference).toBe("SLIP-LOCK-1");
      expect((await loadBatch(batch.id)).status).toBe(OfferingBatchStatus.RECONCILED);
      expect((await loadBatch(batch.id)).reviewVersion).toBe(entered.reviewVersion + 2);
      expect((await fingerprint(batch.id)).audits).toHaveLength(auditsBeforeDeposit + 1);

      const depositedBatch = await loadBatch(batch.id);
      useRole(RoleCode.ORG_ADMIN);
      await expectRejected(batch.id, "STALE_REVIEW", async () =>
        lockOfferingBatch(
          batch.id,
          await confirmation(batch.id, {
            reviewVersion: depositedBatch.reviewVersion - 1,
          }),
        ),
      );
      await expectRejected(batch.id, "CONCURRENT_CHANGE", async () =>
        lockOfferingBatch(
          batch.id,
          await confirmation(batch.id, { recordedTotal: "0.00" }),
        ),
      );
      useRole(RoleCode.DATA_ENTRY);
      await expectRejected(batch.id, "FORBIDDEN", async () =>
        lockOfferingBatch(batch.id, await confirmation(batch.id)),
      );

      useRole(RoleCode.ORG_ADMIN);
      const auditsBeforeLock = (await fingerprint(batch.id)).audits.length;
      const locked = await lockOfferingBatch(batch.id, await confirmation(batch.id));
      expect(locked.status).toBe(OfferingBatchStatus.LOCKED);
      expect(moneyEquals(locked.recordedTotal, "12.00")).toBe(true);
      expect(locked.depositReference).toBe("SLIP-LOCK-1");
      expect((await loadBatch(batch.id)).reviewVersion).toBe(
        depositedBatch.reviewVersion + 1,
      );
      expect((await fingerprint(batch.id)).audits).toHaveLength(auditsBeforeLock + 1);

      const lockedFingerprint = await fingerprint(batch.id);
      useRole(RoleCode.DATA_ENTRY);
      await expectRejected(batch.id, "NOT_EDITABLE", () =>
        createManualBatchDonation(batch.id, gift("1.00", "604"), randomUUID()),
      );
      await expectRejected(batch.id, "NOT_EDITABLE", () =>
        updateManualBatchDonation(
          batch.id,
          createdGift.id,
          gift("9.00", "601"),
          lockedFingerprint.reviewVersion,
        ),
      );
      await expectRejected(batch.id, "NOT_EDITABLE", () =>
        deleteManualBatchDonation(
          batch.id,
          createdGift.id,
          lockedFingerprint.reviewVersion,
        ),
      );
      useRole(RoleCode.TREASURER);
      await expectRejected(batch.id, "INVALID_STATUS", async () =>
        reconcileOfferingBatch(batch.id, await confirmation(batch.id)),
      );
      await expectRejected(batch.id, "INVALID_STATUS", () =>
        recordOfferingBatchDeposit(batch.id, {
          depositDate: today,
          depositReference: "SLIP-LOCK-2",
        }),
      );
      useRole(RoleCode.ORG_ADMIN);
      await expectRejected(batch.id, "INVALID_STATUS", async () =>
        lockOfferingBatch(batch.id, await confirmation(batch.id)),
      );
      useRole(RoleCode.DATA_ENTRY);
      await expectRejected(batch.id, "CONFLICT", () =>
        createManualBatchDonation(batch.id, gift("9.00", "601"), primaryToken),
      );
      const replay = await createManualBatchDonation(
        batch.id,
        gift("10.00", "601"),
        primaryToken,
      );
      expect(replay.id).toBe(createdGift.id);
      expect(await fingerprint(batch.id)).toEqual(lockedFingerprint);
      expect((await loadBatch(batch.id)).status).toBe(OfferingBatchStatus.LOCKED);
      expect(await fingerprint(otherBatch.id)).toEqual(otherBaseline);
    });
  },
);
