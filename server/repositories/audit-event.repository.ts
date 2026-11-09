import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  confirmedGivingAuditDonationBatchId,
  givingAuditListQuery,
} from "@/lib/validation/giving-audit-history";

export type AuditChange = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export type CreateAuditEventInput = {
  organizationId: string;
  actorUserAccountId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes: AuditChange[];
};

type AuditWriter = {
  auditEvent: {
    create: typeof prisma.auditEvent.create;
  };
};

export async function createAuditEvent(
  input: CreateAuditEventInput,
  db: AuditWriter = prisma,
) {
  const changeMetadata: Prisma.InputJsonValue = {
    changes: input.changes,
  };

  return db.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserAccountId: input.actorUserAccountId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      changeMetadata,
    },
  });
}

export async function findEntityAuditEvents(
  organizationId: string,
  entityType: string,
  entityId: string,
  take = 20,
) {
  return prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType,
      entityId,
    },
    include: {
      actor: {
        select: {
          displayName: true,
          primaryEmail: true,
        },
      },
    },
    orderBy: {
      occurredAt: "desc",
    },
    take,
  });
}

export async function findOrganizationAuditEvents(organizationId: string) {
  return prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType: "Organization",
    },
    include: {
      actor: {
        select: {
          displayName: true,
          primaryEmail: true,
        },
      },
    },
    orderBy: {
      occurredAt: "desc",
    },
    take: 20,
  });
}

export type AllowListedAuditEventQuery = {
  organizationId: string;
  allowList: Array<{ entityType: string; action: string }>;
  take: number;
};

export async function findAllowListedAuditEvents(
  query: AllowListedAuditEventQuery,
) {
  if (query.allowList.length === 0) return [];

  return prisma.auditEvent.findMany({
    where: {
      organizationId: query.organizationId,
      OR: query.allowList.map((item) => ({
        entityType: item.entityType,
        action: item.action,
      })),
    },
    select: {
      action: true,
      entityType: true,
      occurredAt: true,
      changeMetadata: true,
      actor: {
        select: {
          displayName: true,
        },
      },
    },
    orderBy: {
      occurredAt: "desc",
    },
    take: query.take,
  });
}

export async function findGivingAuditEvents(input: {
  organizationId: string;
  pairs: ReadonlyArray<{ entityType: string; action: string }>;
  from: string | null;
  to: string | null;
  cursor: { occurredAt: Date; id: string } | null;
}) {
  if (input.pairs.length === 0) return [];
  return prisma.auditEvent.findMany({
    ...givingAuditListQuery(input),
    select: {
      id: true,
      entityId: true,
      action: true,
      entityType: true,
      occurredAt: true,
      changeMetadata: true,
      actor: { select: { displayName: true } },
    },
  });
}

const EMPTY_TARGETS = {
  donors: [] as string[],
  households: [] as string[],
  offeringTypes: [] as string[],
  batches: [] as string[],
  donations: [] as Array<{ id: string; batchId: string | null }>,
  donationBatchesInChurch: [] as string[],
  statements: [] as string[],
  voidRequests: [] as Array<{ id: string; contributionStatementId: string }>,
};

export async function findGivingAuditTargets(input: {
  organizationId: string;
  donorIds: string[];
  householdIds: string[];
  offeringTypeIds: string[];
  batchIds: string[];
  donationIds: string[];
  statementIds: string[];
  voidRequestIds: string[];
}) {
  if (
    input.donorIds.length +
      input.householdIds.length +
      input.offeringTypeIds.length +
      input.batchIds.length +
      input.donationIds.length +
      input.statementIds.length +
      input.voidRequestIds.length ===
    0
  ) {
    return EMPTY_TARGETS;
  }
  const organizationId = input.organizationId;
  const [donors, households, offeringTypes, batches, donations, voidRequests] =
    await Promise.all([
      input.donorIds.length
        ? prisma.donor.findMany({
            where: { organizationId, id: { in: input.donorIds } },
            select: { id: true },
          })
        : [],
      input.householdIds.length
        ? prisma.household.findMany({
            where: { organizationId, id: { in: input.householdIds } },
            select: { id: true },
          })
        : [],
      input.offeringTypeIds.length
        ? prisma.offeringType.findMany({
            where: { organizationId, id: { in: input.offeringTypeIds } },
            select: { id: true },
          })
        : [],
      input.batchIds.length
        ? prisma.offeringBatch.findMany({
            where: { organizationId, id: { in: input.batchIds } },
            select: { id: true },
          })
        : [],
      input.donationIds.length
        ? prisma.donation.findMany({
            where: { organizationId, id: { in: input.donationIds } },
            select: { id: true, batchId: true },
          })
        : [],
      input.voidRequestIds.length
        ? prisma.statementVoidRequest.findMany({
            where: { organizationId, id: { in: input.voidRequestIds } },
            select: { id: true, contributionStatementId: true },
          })
        : [],
    ]);
  const statementIds = [
    ...new Set([
      ...input.statementIds,
      ...voidRequests.map((row) => row.contributionStatementId),
    ]),
  ];
  const statements = statementIds.length
    ? await prisma.contributionStatement.findMany({
        where: { organizationId, id: { in: statementIds } },
        select: { id: true },
      })
    : [];
  const donationBatchIds = [
    ...new Set(
      donations.flatMap((row) => (row.batchId ? [row.batchId] : [])),
    ),
  ];
  const donationBatches = donationBatchIds.length
    ? await prisma.offeringBatch.findMany({
        where: { organizationId, id: { in: donationBatchIds } },
        select: { id: true },
      })
    : [];
  const donationBatchesInChurch = new Set(donationBatches.map((row) => row.id));
  return {
    donors: donors.map((row) => row.id),
    households: households.map((row) => row.id),
    offeringTypes: offeringTypes.map((row) => row.id),
    batches: batches.map((row) => row.id),
    donations: donations.map((row) => ({
      id: row.id,
      batchId: confirmedGivingAuditDonationBatchId(
        row.batchId,
        donationBatchesInChurch,
      ),
    })),
    donationBatchesInChurch: [...donationBatchesInChurch],
    statements: statements.map((row) => row.id),
    voidRequests,
  };
}
