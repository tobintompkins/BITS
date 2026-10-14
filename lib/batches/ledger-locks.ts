import type { OfferingBatchStatus, Prisma } from "@/app/generated/prisma/client";

type LedgerDb = {
  $queryRaw: Prisma.TransactionClient["$queryRaw"];
};

export type LockedOfferingBatchRow = {
  id: string;
  status: OfferingBatchStatus;
  expectedTotal: string | null;
  recordedTotal: string;
  offeringDate: Date;
  depositDate: Date | null;
  depositReference: string | null;
};

/**
 * Church-first lock order for every competing financial mutation:
 * 1. Organization `FOR UPDATE`
 * 2. Offering batch `FOR UPDATE`
 *
 * Donation, allocation, recordedTotal increment, and status changes happen
 * only after both rows are held. Compatible with Core 09/10 organization-first
 * locks. Conditional increment and status `updateMany` remain the status guard.
 */
export async function lockOrganizationForLedger(
  db: LedgerDb,
  organizationId: string,
) {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM organizations
    WHERE id = ${organizationId}::uuid AND active = true
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function lockOfferingBatchForLedger(
  db: LedgerDb,
  organizationId: string,
  batchId: string,
) {
  const rows = await db.$queryRaw<Array<LockedOfferingBatchRow>>`
    SELECT
      id,
      status,
      "expectedTotal"::text AS "expectedTotal",
      "recordedTotal"::text AS "recordedTotal",
      "offeringDate",
      "depositDate",
      "depositReference"
    FROM offering_batches
    WHERE id = ${batchId}::uuid
      AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function lockChurchThenOfferingBatch(
  db: LedgerDb,
  organizationId: string,
  batchId: string,
) {
  const organization = await lockOrganizationForLedger(db, organizationId);
  if (!organization) return { organization: null, batch: null };
  const batch = await lockOfferingBatchForLedger(db, organizationId, batchId);
  return { organization, batch };
}
