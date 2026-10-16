import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  OfferingBatchStatus,
  PrismaClient,
} from "@/app/generated/prisma/client";
import { moneyEquals } from "@/lib/money/decimal";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  isolatedDatabaseNameIsDedicated,
  parsePostgresTargetIdentity,
  postgresTargetsAreEquivalent,
} from "@/lib/testing/original-v1-database-url";
import {
  assertLedgerSchemaReady,
  inspectLedgerSchema,
  ledgerSchemaReadinessMessage,
} from "@/lib/testing/ledger-schema-readiness";
import {
  assertLedgerReviewSchemaReady,
  inspectLedgerReviewSchema,
  ledgerReviewSchemaReadinessMessage,
} from "@/lib/testing/ledger-review-schema-readiness";
import type { ManualBatchDonationWriteInput } from "@/lib/validation/manual-batch-donation";
import {
  ManualBatchDonationError,
  applyManualBatchDonationCreate,
  applyManualBatchDonationUpdate,
} from "@/server/services/manual-batch-donation.service";
import {
  COMPLETE_OFFERING_BATCH_ENTRY,
  OfferingBatchTransitionError,
  RECONCILE_OFFERING_BATCH,
  applyOfferingBatchTransition,
} from "@/server/services/offering-batch-transition.service";

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

const runId = `core11-${randomUUID().slice(0, 8)}`;

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: isolatedUrl }),
  });
}

describe.skipIf(!canUseIsolatedDb)(
  "ledger concurrency (isolated bits_e2e)",
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

    async function seedLedger() {
      const setup = createClient();
      clients.push(setup);
      const schema = await inspectLedgerSchema(setup);
      if (schema.status !== "ready") {
        throw new Error(
          `${ledgerSchemaReadinessMessage(schema)} Isolated ledger tests refuse to ALTER TABLE or use the working database.`,
        );
      }
      assertLedgerSchemaReady(schema);
      const reviewSchema = await inspectLedgerReviewSchema(setup);
      if (reviewSchema.status !== "ready") {
        throw new Error(
          `${ledgerReviewSchemaReadinessMessage(reviewSchema)} Isolated ledger tests refuse to ALTER TABLE or use the working database.`,
        );
      }
      assertLedgerReviewSchemaReady(reviewSchema);

      const seedKey = `${runId}-${randomUUID().slice(0, 8)}`;
      const actor = await setup.userAccount.create({
        data: {
          clerkUserId: `${seedKey}-actor`,
          primaryEmail: `${seedKey}@church.test`,
          displayName: "Ledger Actor",
        },
      });
      created.userAccountIds.push(actor.id);

      const org = await setup.organization.create({
        data: {
          name: `${seedKey} Chapel`,
          slug: seedKey,
          mailingAddressLine1: "1 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
        },
      });
      created.organizationIds.push(org.id);

      const donor = await setup.donor.create({
        data: {
          organizationId: org.id,
          firstName: "Pat",
          lastName: seedKey,
        },
      });
      const fundA = await setup.offeringType.create({
        data: {
          organizationId: org.id,
          name: "General",
          code: `${seedKey}-gen`,
        },
      });
      const fundB = await setup.offeringType.create({
        data: {
          organizationId: org.id,
          name: "Missions",
          code: `${seedKey}-mis`,
        },
      });
      const batch = await setup.offeringBatch.create({
        data: {
          organizationId: org.id,
          name: `${seedKey} Sunday`,
          offeringDate: new Date("2026-10-14T00:00:00.000Z"),
          expectedTotal: "30.00",
          recordedTotal: "0.00",
          status: OfferingBatchStatus.DRAFT,
          createdByUserAccountId: actor.id,
        },
      });

      return { setup, actor, org, donor, fundA, fundB, batch };
    }

    function giftInput(
      donorId: string,
      allocations: Array<{ offeringTypeId: string; amount: string }>,
      extras: Partial<ManualBatchDonationWriteInput> = {},
    ): ManualBatchDonationWriteInput {
      const totalAmount = allocations
        .reduce((sum, row) => sum + Number(row.amount), 0)
        .toFixed(2);
      return {
        donorId,
        anonymous: false,
        offeringDate: "2026-10-14",
        receivedDate: "2026-10-14",
        confirmOfferingDateOverride: false,
        paymentMethod: "CHECK",
        checkNumber: "101",
        reference: null,
        note: null,
        isTaxDeductible: true,
        deductibleAmount: totalAmount,
        goodsOrServicesProvided: false,
        goodsOrServicesDescription: null,
        goodsOrServicesEstimatedValue: null,
        intangibleReligiousBenefitsOnly: false,
        allocations,
        totalAmount,
        ...extras,
      };
    }

    it("adds concurrent gifts without losing recordedTotal increments", async () => {
      const { org, actor, donor, fundA, fundB, batch, setup } = await seedLedger();
      const clientA = createClient();
      const clientB = createClient();
      clients.push(clientA, clientB);

      const incrementProof = await Promise.all([
        clientA.$transaction((tx) =>
          tx.offeringBatch.updateMany({
            where: {
              id: batch.id,
              organizationId: org.id,
              status: OfferingBatchStatus.DRAFT,
            },
            data: { recordedTotal: { increment: "10.00" } },
          }),
        ),
        clientB.$transaction((tx) =>
          tx.offeringBatch.updateMany({
            where: {
              id: batch.id,
              organizationId: org.id,
              status: OfferingBatchStatus.DRAFT,
            },
            data: { recordedTotal: { increment: "20.00" } },
          }),
        ),
      ]);
      expect(incrementProof.every((row) => row.count === 1)).toBe(true);
      const afterIncrements = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id },
      });
      expect(moneyEquals(afterIncrements.recordedTotal.toString(), "30.00")).toBe(
        true,
      );

      await setup.offeringBatch.update({
        where: { id: batch.id },
        data: { recordedTotal: "0.00" },
      });

      const results = await Promise.allSettled([
        clientA.$transaction((tx) =>
          applyManualBatchDonationCreate({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actor.id,
            batchId: batch.id,
            input: giftInput(donor.id, [
              { offeringTypeId: fundA.id, amount: "10.00" },
            ]),
            operationToken: randomUUID(),
          }),
        ),
        clientB.$transaction((tx) =>
          applyManualBatchDonationCreate({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actor.id,
            batchId: batch.id,
            input: giftInput(
              donor.id,
              [{ offeringTypeId: fundB.id, amount: "20.00" }],
              { checkNumber: "102" },
            ),
            operationToken: randomUUID(),
          }),
        ),
      ]);
      expect(results.every((row) => row.status === "fulfilled")).toBe(true);
      const next = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id },
      });
      expect(next.status).toBe(OfferingBatchStatus.DRAFT);
      expect(moneyEquals(next.recordedTotal.toString(), "30.00")).toBe(true);
      expect(
        await setup.donation.count({ where: { batchId: batch.id } }),
      ).toBe(2);
    });

    it("serializes a gift add against entry completion so no gift commits after ENTERED", async () => {
      const { org, actor, donor, fundA, batch, setup } = await seedLedger();
      const first = await setup.$transaction((tx) =>
        applyManualBatchDonationCreate({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: actor.id,
          batchId: batch.id,
          input: giftInput(donor.id, [
            { offeringTypeId: fundA.id, amount: "10.00" },
          ]),
          operationToken: randomUUID(),
        }),
      );
      expect(moneyEquals(first.totalAmount, "10.00")).toBe(true);
      const afterFirst = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id },
      });

      const clientA = createClient();
      const clientB = createClient();
      clients.push(clientA, clientB);

      const results = await Promise.allSettled([
        clientA.$transaction((tx) =>
          applyOfferingBatchTransition({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actor.id,
            batchId: batch.id,
            fromStatus: OfferingBatchStatus.DRAFT,
            toStatus: OfferingBatchStatus.ENTERED,
            requireBalancedExpected: false,
            action: COMPLETE_OFFERING_BATCH_ENTRY,
            snapshot: {
              confirmed: true,
              recordedTotal: "10.00",
              expectedTotal: "30.00",
              donationCount: 1,
              reviewVersion: afterFirst.reviewVersion,
            },
          }),
        ),
        clientB.$transaction((tx) =>
          applyManualBatchDonationCreate({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actor.id,
            batchId: batch.id,
            input: giftInput(
              donor.id,
              [{ offeringTypeId: fundA.id, amount: "20.00" }],
              { checkNumber: "103" },
            ),
            operationToken: randomUUID(),
          }),
        ),
      ]);

      const batchRow = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id },
      });
      const gifts = await setup.donation.findMany({
        where: { batchId: batch.id },
      });
      const fulfilled = results.filter((row) => row.status === "fulfilled");
      const rejected = results.filter((row) => row.status === "rejected");
      expect(fulfilled.length + rejected.length).toBe(2);
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      if (batchRow.status === OfferingBatchStatus.ENTERED) {
        expect(gifts).toHaveLength(1);
        expect(moneyEquals(batchRow.recordedTotal.toString(), "10.00")).toBe(
          true,
        );
        expect(
          gifts.reduce((sum, row) => sum + Number(row.totalAmount), 0).toFixed(2),
        ).toBe("10.00");
      } else {
        expect(batchRow.status).toBe(OfferingBatchStatus.DRAFT);
        expect(gifts).toHaveLength(2);
        expect(moneyEquals(batchRow.recordedTotal.toString(), "30.00")).toBe(
          true,
        );
      }
    });

    it("allows only one of two competing reconcile requests to change status", async () => {
      const { org, actor, donor, fundA, batch, setup } = await seedLedger();
      await setup.$transaction((tx) =>
        applyManualBatchDonationCreate({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: actor.id,
          batchId: batch.id,
          input: giftInput(donor.id, [
            { offeringTypeId: fundA.id, amount: "30.00" },
          ]),
          operationToken: randomUUID(),
        }),
      );
      const afterCreate = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id },
      });
      await setup.offeringBatch.update({
        where: { id: batch.id },
        data: { status: OfferingBatchStatus.ENTERED },
      });

      const clientA = createClient();
      const clientB = createClient();
      clients.push(clientA, clientB);
      const snapshot = {
        confirmed: true as const,
        recordedTotal: "30.00",
        expectedTotal: "30.00",
        donationCount: 1,
        reviewVersion: afterCreate.reviewVersion,
      };
      const results = await Promise.allSettled([
        clientA.$transaction((tx) =>
          applyOfferingBatchTransition({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actor.id,
            batchId: batch.id,
            fromStatus: OfferingBatchStatus.ENTERED,
            toStatus: OfferingBatchStatus.RECONCILED,
            requireBalancedExpected: true,
            action: RECONCILE_OFFERING_BATCH,
            snapshot,
          }),
        ),
        clientB.$transaction((tx) =>
          applyOfferingBatchTransition({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actor.id,
            batchId: batch.id,
            fromStatus: OfferingBatchStatus.ENTERED,
            toStatus: OfferingBatchStatus.RECONCILED,
            requireBalancedExpected: true,
            action: RECONCILE_OFFERING_BATCH,
            snapshot,
          }),
        ),
      ]);
      const succeeded = results.filter((row) => row.status === "fulfilled");
      const failed = results.filter((row) => row.status === "rejected");
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      const next = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id },
      });
      expect(next.status).toBe(OfferingBatchStatus.RECONCILED);
      expect(moneyEquals(next.recordedTotal.toString(), "30.00")).toBe(true);
      expect(
        await setup.donation.count({ where: { batchId: batch.id } }),
      ).toBe(1);
    });

    it("replays one create token and rejects the same token with a different payload", async () => {
      const { org, actor, donor, fundA, fundB, batch, setup } = await seedLedger();
      const token = randomUUID();
      const payload = giftInput(donor.id, [
        { offeringTypeId: fundA.id, amount: "10.00" },
      ]);
      const first = await setup.$transaction((tx) =>
        applyManualBatchDonationCreate({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: actor.id,
          batchId: batch.id,
          input: payload,
          operationToken: token,
        }),
      );
      const replay = await setup.$transaction((tx) =>
        applyManualBatchDonationCreate({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: actor.id,
          batchId: batch.id,
          input: payload,
          operationToken: token,
        }),
      );
      expect(replay.id).toBe(first.id);
      expect(
        await setup.donation.count({ where: { batchId: batch.id } }),
      ).toBe(1);

      await expect(
        setup.$transaction((tx) =>
          applyManualBatchDonationCreate({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actor.id,
            batchId: batch.id,
            input: giftInput(donor.id, [
              { offeringTypeId: fundB.id, amount: "10.00" },
            ]),
            operationToken: token,
          }),
        ),
      ).rejects.toBeInstanceOf(ManualBatchDonationError);
      expect(
        await setup.donation.count({ where: { batchId: batch.id } }),
      ).toBe(1);
    });

    it("rejects complete-entry after a same-total donor or allocation change", async () => {
      const { org, actor, donor, fundA, fundB, batch, setup } = await seedLedger();
      const created = await setup.$transaction((tx) =>
        applyManualBatchDonationCreate({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: actor.id,
          batchId: batch.id,
          input: giftInput(donor.id, [
            { offeringTypeId: fundA.id, amount: "30.00" },
          ]),
          operationToken: randomUUID(),
        }),
      );
      const beforeEdit = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id },
      });
      await setup.$transaction((tx) =>
        applyManualBatchDonationUpdate({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: actor.id,
          batchId: batch.id,
          donationId: created.id,
          input: giftInput(donor.id, [
            { offeringTypeId: fundB.id, amount: "30.00" },
          ]),
          expectedReviewVersion: beforeEdit.reviewVersion,
        }),
      );

      await expect(
        setup.$transaction((tx) =>
          applyOfferingBatchTransition({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actor.id,
            batchId: batch.id,
            fromStatus: OfferingBatchStatus.DRAFT,
            toStatus: OfferingBatchStatus.ENTERED,
            requireBalancedExpected: false,
            action: COMPLETE_OFFERING_BATCH_ENTRY,
            snapshot: {
              confirmed: true,
              recordedTotal: "30.00",
              expectedTotal: "30.00",
              donationCount: 1,
              reviewVersion: beforeEdit.reviewVersion,
            },
          }),
        ),
      ).rejects.toBeInstanceOf(OfferingBatchTransitionError);

      const next = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id },
      });
      expect(next.status).toBe(OfferingBatchStatus.DRAFT);
      expect(moneyEquals(next.recordedTotal.toString(), "30.00")).toBe(true);
    });
  },
);
