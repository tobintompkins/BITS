import { rm } from "node:fs/promises";
import path from "node:path";

import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  removeOrganizationLogoFile,
  resolveAcceptanceOrganizationLogoRoot,
  resolveOwnedOrganizationLogoPath,
} from "@/lib/storage/organization-logo";
import { getPrivateStatementStorageRoot } from "@/lib/storage/statement-pdf";
import { originalV1OwnedAuditIdsWhere, originalV1OwnedAuditEventWhere } from "@/lib/testing/original-v1-acceptance-cleanup";
import { parseOriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";
import {
  ORIGINAL_V1_SETTINGS_FOOTER,
  originalV1GivingAuditEventIds,
} from "@/lib/testing/original-v1-giving-audit-fixtures";

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

  const offeringTypes = await prisma.offeringType.findMany({
    where: {
      organizationId: { in: orgIds },
      name: { startsWith: prefix },
    },
    select: { id: true },
  });
  const offeringTypeIds = offeringTypes.map((row) => row.id);

  const ownedIds = [
    ...donorIds,
    ...householdIds,
    ...batchIds,
    ...donationIds,
    ...statementIds,
    ...offeringTypeIds,
  ];
  const auditWhere = originalV1OwnedAuditEventWhere(orgIds, ownedIds);
  if (auditWhere) {
    await prisma.auditEvent.deleteMany({ where: auditWhere });
  }

  if (offeringTypeIds.length) {
    await prisma.offeringType.deleteMany({
      where: { id: { in: offeringTypeIds }, organizationId: { in: orgIds } },
    });
  }
}

export async function deleteRecordedOriginalV1Audits(
  prisma: PrismaClient,
  orgIds: string[],
  auditIds: string[],
) {
  const ids = [...new Set(auditIds)];
  const where = originalV1OwnedAuditIdsWhere(orgIds, ids);
  if (!where) return;
  await prisma.auditEvent.deleteMany({ where });
}

function logoPathIsIsolated(organizationId: string, storageKey: string) {
  const root = resolveAcceptanceOrganizationLogoRoot(process.env, process.cwd());
  const absolute = resolveOwnedOrganizationLogoPath(organizationId, storageKey);
  if (!root || !absolute) return false;
  const relative = path.relative(path.resolve(root), absolute);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resetOriginalV1SentinelSettings(
  prisma: PrismaClient,
  orgIds: string[],
  logoKeys: Array<{ organizationId: string; storageKey: string }>,
) {
  if (orgIds.length) {
    await prisma.organization.updateMany({
      where: {
        id: { in: orgIds },
        statementFooterText: ORIGINAL_V1_SETTINGS_FOOTER,
      },
      data: { statementFooterText: null },
    });
  }

  const keys = new Map<string, string>();
  for (const entry of logoKeys) {
    if (orgIds.includes(entry.organizationId)) {
      keys.set(entry.organizationId, entry.storageKey);
    }
  }
  const organizations = orgIds.length
    ? await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, logoStorageKey: true },
      })
    : [];
  for (const organization of organizations) {
    const candidates = [
      keys.get(organization.id),
      organization.logoStorageKey,
    ].filter((key): key is string => Boolean(key));
    for (const storageKey of new Set(candidates)) {
      if (!logoPathIsIsolated(organization.id, storageKey)) continue;
      await removeOrganizationLogoFile(organization.id, storageKey);
      await prisma.organization.updateMany({
        where: { id: organization.id, logoStorageKey: storageKey },
        data: { logoStorageKey: null },
      });
    }
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
    const orgIds = orgs.map((row) => row.id);
    await deleteRecordedOriginalV1Audits(prisma, orgIds, [
      ...originalV1GivingAuditEventIds(),
      ...(manifest?.ownedAuditEventIds ?? []),
    ]);
    await resetOriginalV1SentinelSettings(
      prisma,
      orgIds,
      manifest?.ownedLogoKeys ?? [],
    );
    if (manifest) {
      await deleteOwnedPdfs(manifest);
    }
  } finally {
    await prisma.$disconnect();
  }
}
