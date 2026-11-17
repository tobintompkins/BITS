import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  OfferingBatchStatus,
  PrismaClient,
} from "@/app/generated/prisma/client";
import { moneyEquals } from "@/lib/money/decimal";
import {
  isolatedConnectionString,
  isolatedDatabaseRunEnabled,
} from "@/lib/testing/isolated-database";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  assertLedgerSchemaReady,
  inspectLedgerSchema,
  ledgerSchemaReadinessMessage,
} from "@/lib/testing/ledger-schema-readiness";
import type { ManualBatchDonationWriteInput } from "@/lib/validation/manual-batch-donation";
import {
  ManualBatchDonationError,
  applyManualBatchDonationCreate,
} from "@/server/services/manual-batch-donation.service";
import {
  COMPLETE_OFFERING_BATCH_ENTRY,
  applyOfferingBatchTransition,
} from "@/server/services/offering-batch-transition.service";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAccount: { findUnique: async () => null },
    $transaction: async (fn: (tx: never) => Promise<unknown>) => fn(null as never),
  },
}));

loadOriginalV1AcceptanceEnvFiles();

const canUseIsolatedDb = isolatedDatabaseRunEnabled();
const runId = `anon-${randomUUID().slice(0, 8)}`;

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: isolatedConnectionString(),
      max: 2,
    }),
  });
}

describe.skipIf(!canUseIsolatedDb)(
  "anonymous gift entry (isolated bits_e2e)",
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

    it("keeps an anonymous cash gift in the batch total and out of donor statements", async () => {
      const setup = createClient();
      clients.push(setup);
      const schema = await inspectLedgerSchema(setup);
      if (schema.status !== "ready") {
        throw new Error(
          `${ledgerSchemaReadinessMessage(schema)} Isolated anonymous-gift tests refuse to ALTER TABLE or use the working database.`,
        );
      }
      assertLedgerSchemaReady(schema);

      const seedKey = `${runId}-${randomUUID().slice(0, 8)}`;
      const actor = await setup.userAccount.create({
        data: {
          clerkUserId: `${seedKey}-actor`,
          primaryEmail: `${seedKey}@church.test`,
          displayName: "Anonymous Gift Actor",
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
          offeringDate: new Date("2026-11-16T00:00:00.000Z"),
          expectedTotal: "15.00",
          recordedTotal: "0.00",
          status: OfferingBatchStatus.DRAFT,
          createdByUserAccountId: actor.id,
        },
      });

      const identified = baseGift(donor.id, fund.id, "10.00", {
        paymentMethod: "CHECK",
        checkNumber: "301",
      });
      const anonymous = baseGift("", fund.id, "5.00", {
        anonymous: true,
        paymentMethod: "CASH",
        checkNumber: null,
      });

      await setup.$transaction((tx) =>
        applyManualBatchDonationCreate({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: actor.id,
          batchId: batch.id,
          input: identified,
          operationToken: randomUUID(),
        }),
      );
      await setup.$transaction((tx) =>
        applyManualBatchDonationCreate({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: actor.id,
          batchId: batch.id,
          input: anonymous,
          operationToken: randomUUID(),
        }),
      );

      const stored = await setup.donation.findMany({
        where: { organizationId: org.id, batchId: batch.id },
        orderBy: { totalAmount: "asc" },
      });
      expect(stored).toHaveLength(2);
      expect(stored.filter((row) => row.anonymous)).toEqual([
        expect.objectContaining({
          donorId: null,
          anonymous: true,
          paymentMethod: "CASH",
        }),
      ]);
      expect(stored.filter((row) => !row.anonymous)).toEqual([
        expect.objectContaining({
          donorId: donor.id,
          anonymous: false,
          paymentMethod: "CHECK",
        }),
      ]);
      const afterGifts = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id, organizationId: org.id },
      });
      expect(moneyEquals(afterGifts.recordedTotal.toString(), "15.00")).toBe(true);

      const statementGifts = await setup.donation.findMany({
        where: {
          organizationId: org.id,
          donorId: donor.id,
          anonymous: false,
          isTest: false,
        },
      });
      expect(statementGifts).toHaveLength(1);
      expect(statementGifts[0]?.anonymous).toBe(false);
      expect(statementGifts.some((row) => row.anonymous)).toBe(false);

      await setup.$transaction((tx) =>
        applyOfferingBatchTransition({
          db: tx,
          organizationId: org.id,
          actorUserAccountId: actor.id,
          batchId: batch.id,
          fromStatus: OfferingBatchStatus.DRAFT,
          toStatus: OfferingBatchStatus.ENTERED,
          requireBalancedExpected: true,
          action: COMPLETE_OFFERING_BATCH_ENTRY,
          snapshot: {
            confirmed: true,
            recordedTotal: "15.00",
            expectedTotal: "15.00",
            donationCount: 2,
            reviewVersion: afterGifts.reviewVersion,
          },
        }),
      );

      await expect(
        setup.$transaction((tx) =>
          applyManualBatchDonationCreate({
            db: tx,
            organizationId: org.id,
            actorUserAccountId: actor.id,
            batchId: batch.id,
            input: baseGift("", fund.id, "1.00", {
              anonymous: true,
              paymentMethod: "CASH",
              checkNumber: null,
            }),
            operationToken: randomUUID(),
          }),
        ),
      ).rejects.toBeInstanceOf(ManualBatchDonationError);

      const finalGifts = await setup.donation.findMany({
        where: { organizationId: org.id },
      });
      const finalBatch = await setup.offeringBatch.findFirstOrThrow({
        where: { id: batch.id },
      });
      expect(finalBatch.status).toBe(OfferingBatchStatus.ENTERED);
      expect(finalGifts).toHaveLength(2);
      expect(moneyEquals(finalBatch.recordedTotal.toString(), "15.00")).toBe(true);
      expect(
        finalGifts.some((row) => row.anonymous && row.donorId !== null),
      ).toBe(false);
    });
  },
);

function baseGift(
  donorId: string,
  offeringTypeId: string,
  amount: string,
  extras: Partial<ManualBatchDonationWriteInput>,
): ManualBatchDonationWriteInput {
  return {
    donorId,
    anonymous: false,
    offeringDate: "2026-11-16",
    receivedDate: "2026-11-16",
    confirmOfferingDateOverride: false,
    paymentMethod: "CHECK",
    checkNumber: "301",
    reference: null,
    note: null,
    isTaxDeductible: true,
    deductibleAmount: amount,
    goodsOrServicesProvided: false,
    goodsOrServicesDescription: null,
    goodsOrServicesEstimatedValue: null,
    intangibleReligiousBenefitsOnly: false,
    allocations: [{ offeringTypeId, amount }],
    totalAmount: amount,
    ...extras,
  };
}
