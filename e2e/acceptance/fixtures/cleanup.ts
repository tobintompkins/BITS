import { rm } from "node:fs/promises";
import path from "node:path";

import type { PrismaClient } from "@/app/generated/prisma/client";
import { getPrivateStatementStorageRoot } from "@/lib/storage/statement-pdf";
import { originalV1OwnedAuditEventWhere } from "@/lib/testing/original-v1-acceptance-cleanup";
import { parseOriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";

import { createOriginalV1AcceptancePrisma } from "./prisma";
import {
  tryReadOriginalV1Manifest,
  type OriginalV1Manifest,
} from "./manifest";

async function deleteOwnedPdfs(manifest: OriginalV1Manifest) {
  const root = getPrivateStatementStorageRoot();
  const statementIds = Object.values(manifest.statements).map((row) => row.id);
  await Promise.all(
    statementIds.map(async (statementId) => {
      const orgId = statementId === manifest.statements.b1Published.id ||
        statementId === manifest.statements.b1Generated.id
        ? manifest.orgs.b.id
        : manifest.orgs.a.id;
      await rm(path.join(root, orgId, statementId), {
        recursive: true,
        force: true,
      });
    }),
  );
}

export async function cleanupOwnedOriginalV1Rows(
  prisma: PrismaClient,
  orgIds: string[],
  prefix: string,
) {
  if (!orgIds.length) return;

  const statements = await prisma.contributionStatement.findMany({
    where: {
      organizationId: { in: orgIds },
      statementIdentifier: { startsWith: prefix },
    },
    select: { id: true, organizationId: true },
  });
  const statementIds = statements.map((row) => row.id);

  if (statementIds.length) {
    await prisma.statementAccessEvent.deleteMany({
      where: { statementId: { in: statementIds }, organizationId: { in: orgIds } },
    });
    await prisma.contributionStatement.deleteMany({
      where: { id: { in: statementIds }, organizationId: { in: orgIds } },
    });
  }

  const donors = await prisma.donor.findMany({
    where: {
      organizationId: { in: orgIds },
      firstName: { startsWith: prefix },
    },
    select: { id: true },
  });
  const donorIds = donors.map((row) => row.id);

  const batches = await prisma.offeringBatch.findMany({
    where: {
      organizationId: { in: orgIds },
      name: { startsWith: prefix },
    },
    select: { id: true },
  });
  const batchIds = batches.map((row) => row.id);

  const donationOr = [
    ...(donorIds.length ? [{ donorId: { in: donorIds } }] : []),
    ...(batchIds.length ? [{ batchId: { in: batchIds } }] : []),
    { note: { startsWith: prefix } },
  ];
  const donations = await prisma.donation.findMany({
    where: {
      organizationId: { in: orgIds },
      OR: donationOr,
    },
    select: { id: true },
  });
  const donationIds = donations.map((row) => row.id);

  if (donationIds.length) {
    await prisma.donationAllocation.deleteMany({
      where: { donationId: { in: donationIds }, organizationId: { in: orgIds } },
    });
    await prisma.donation.deleteMany({
      where: { id: { in: donationIds }, organizationId: { in: orgIds } },
    });
  }

  if (batchIds.length) {
    await prisma.offeringBatch.deleteMany({
      where: { id: { in: batchIds }, organizationId: { in: orgIds } },
    });
  }

  const households = await prisma.household.findMany({
    where: {
      organizationId: { in: orgIds },
      displayName: { startsWith: prefix },
    },
    select: { id: true },
  });
  const householdIds = households.map((row) => row.id);
  if (householdIds.length) {
    await prisma.householdMembership.deleteMany({
      where: { householdId: { in: householdIds }, organizationId: { in: orgIds } },
    });
    await prisma.household.updateMany({
      where: { id: { in: householdIds }, organizationId: { in: orgIds } },
      data: { primaryDonorId: null, preferredStatementRecipientId: null },
    });
    await prisma.household.deleteMany({
      where: { id: { in: householdIds }, organizationId: { in: orgIds } },
    });
  }

  if (donorIds.length) {
    await prisma.donor.deleteMany({
      where: { id: { in: donorIds }, organizationId: { in: orgIds } },
    });
  }

  await prisma.offeringType.deleteMany({
    where: {
      organizationId: { in: orgIds },
      name: { startsWith: prefix },
    },
  });

  const ownedIds = [
    ...donorIds,
    ...householdIds,
    ...batchIds,
    ...donationIds,
    ...statementIds,
  ];
  const auditWhere = originalV1OwnedAuditEventWhere(orgIds, ownedIds);
  if (auditWhere) {
    await prisma.auditEvent.deleteMany({ where: auditWhere });
  }
}

export async function cleanupOriginalV1AcceptanceFixtures() {
  const config = parseOriginalV1AcceptanceConfig();
  const prisma = createOriginalV1AcceptancePrisma(config);
  try {
    const manifest = await tryReadOriginalV1Manifest();
    const orgs = await prisma.organization.findMany({
      where: {
        clerkOrganizationId: { in: [config.clerkOrgAId, config.clerkOrgBId] },
      },
      select: { id: true },
    });
    await cleanupOwnedOriginalV1Rows(
      prisma,
      orgs.map((row) => row.id),
      config.prefix,
    );
    if (manifest) {
      await deleteOwnedPdfs(manifest);
    }
  } finally {
    await prisma.$disconnect();
  }
}
