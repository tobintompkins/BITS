import { readFileSync } from "node:fs";
import path from "node:path";

import { parseOriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  diagnoseOriginalV1AcceptanceEnv,
  formatOriginalV1PreflightReport,
  probeOriginalV1AcceptanceTarget,
} from "@/lib/testing/original-v1-acceptance-preflight";
import { originalV1AuditIdMayBeRecorded } from "@/lib/testing/original-v1-giving-audit-fixtures";
import {
  resolveAcceptanceOrganizationLogoRoot,
  resolveOwnedOrganizationLogoPath,
} from "@/lib/storage/organization-logo";

import { cleanupOriginalV1AcceptanceFixtures } from "./cleanup";
import {
  readOriginalV1Manifest,
  writeOriginalV1Manifest,
} from "./manifest";
import { prepareOriginalV1AcceptanceFixtures } from "./prepare";
import { createOriginalV1AcceptancePrisma } from "./prisma";

function isolatedLogoFile(organizationId: string, storageKey: string) {
  const root = resolveAcceptanceOrganizationLogoRoot(process.env, process.cwd());
  const absolute = resolveOwnedOrganizationLogoPath(organizationId, storageKey);
  if (!root || !absolute) return null;
  const relative = path.relative(path.resolve(root), absolute);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return absolute;
}

loadOriginalV1AcceptanceEnvFiles();

function money(value: { toString(): string } | null | undefined) {
  if (value == null) return null;
  const [whole, fraction = ""] = value.toString().split(".");
  return `${whole}.${(fraction + "00").slice(0, 2)}`;
}

function statusChange(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("changes" in metadata)) {
    return null;
  }
  const changes = (metadata as { changes?: unknown }).changes;
  if (!Array.isArray(changes)) return null;
  const status = changes.find(
    (row) =>
      Boolean(row) &&
      typeof row === "object" &&
      (row as { field?: string }).field === "status",
  ) as { oldValue?: unknown; newValue?: unknown } | undefined;
  if (!status) return null;
  return {
    oldValue: typeof status.oldValue === "string" ? status.oldValue : null,
    newValue: typeof status.newValue === "string" ? status.newValue : null,
  };
}

async function query(op: string, extra?: string) {
  const config = parseOriginalV1AcceptanceConfig();
  const manifest = await readOriginalV1Manifest();
  const prisma = createOriginalV1AcceptancePrisma(config);
  try {
    if (op === "audit-export") {
      const audit = await prisma.auditEvent.findFirst({
        where: {
          organizationId: manifest.orgs.a.id,
          actorUserAccountId: manifest.users.orgAdmin.id,
          action: "CONTRIBUTION_REPORT_EXPORTED",
        },
        orderBy: { occurredAt: "desc" },
        select: { id: true, action: true },
      });
      process.stdout.write(`${JSON.stringify({ audit })}\n`);
      return;
    }
    if (op === "household-recipient") {
      const household = await prisma.household.findUnique({
        where: { id: manifest.households.a.id },
        select: { preferredStatementRecipientId: true },
      });
      process.stdout.write(`${JSON.stringify({ household })}\n`);
      return;
    }
    if (op === "org-b-totals") {
      const totals = await prisma.donation.aggregate({
        where: { organizationId: manifest.orgs.b.id },
        _sum: { totalAmount: true },
        _count: true,
      });
      const donor = await prisma.donor.findUnique({
        where: { id: manifest.donors.b1.id },
        select: { firstName: true },
      });
      process.stdout.write(
        `${JSON.stringify({
          sum: String(totals._sum.totalAmount ?? "0"),
          count: totals._count,
          firstName: donor?.firstName ?? null,
        })}\n`,
      );
      return;
    }
    if (op === "settings-snapshot") {
      const organizations = await prisma.organization.findMany({
        where: { id: { in: [manifest.orgs.a.id, manifest.orgs.b.id] } },
        select: { id: true, statementFooterText: true, logoStorageKey: true },
      });
      const audits = await prisma.auditEvent.findMany({
        where: {
          organizationId: { in: [manifest.orgs.a.id, manifest.orgs.b.id] },
          entityType: "Organization",
          action: "UPDATE",
          entityId: { in: [manifest.orgs.a.id, manifest.orgs.b.id] },
        },
        select: { id: true, organizationId: true },
      });
      const footer = (id: string) =>
        organizations.find((row) => row.id === id)?.statementFooterText ?? null;
      const logo = (id: string) =>
        organizations.find((row) => row.id === id)?.logoStorageKey ?? null;
      process.stdout.write(
        `${JSON.stringify({
          footerA: footer(manifest.orgs.a.id),
          footerB: footer(manifest.orgs.b.id),
          logoKeyA: logo(manifest.orgs.a.id),
          organizationAuditIdsA: audits
            .filter((row) => row.organizationId === manifest.orgs.a.id)
            .map((row) => row.id)
            .sort(),
          logoIsolated: Boolean(
            resolveAcceptanceOrganizationLogoRoot(process.env, process.cwd()),
          ),
        })}\n`,
      );
      return;
    }
    if (op === "logo-file") {
      const storageKey = extra?.trim() ?? "";
      const absolute = isolatedLogoFile(manifest.orgs.a.id, storageKey);
      if (!absolute) {
        process.stdout.write(
          `${JSON.stringify({ readable: false, exists: false, byteLength: 0, hex: null })}\n`,
        );
        return;
      }
      try {
        const bytes = readFileSync(absolute);
        const hex = bytes.length <= 4096 ? bytes.toString("hex") : null;
        process.stdout.write(
          `${JSON.stringify({ readable: true, exists: true, byteLength: bytes.length, hex })}\n`,
        );
      } catch {
        process.stdout.write(
          `${JSON.stringify({ readable: true, exists: false, byteLength: 0, hex: null })}\n`,
        );
      }
      return;
    }
    if (op === "record-owned-audit") {
      const auditId = extra?.trim() ?? "";
      const audit = await prisma.auditEvent.findUnique({
        where: { id: auditId },
        select: { id: true, organizationId: true, entityType: true, entityId: true },
      });
      const allowed =
        audit !== null &&
        originalV1AuditIdMayBeRecorded({
          auditId: audit.id,
          organizationId: audit.organizationId,
          entityType: audit.entityType,
          entityId: audit.entityId,
          orgIds: [manifest.orgs.a.id, manifest.orgs.b.id],
          donationIds: [
            manifest.donations.a1.id,
            manifest.donations.a2.id,
            manifest.donations.b1.id,
          ],
        });
      if (!allowed) {
        throw new Error("That audit row is not owned by this acceptance run.");
      }
      if (!manifest.ownedAuditEventIds.includes(auditId)) {
        manifest.ownedAuditEventIds.push(auditId);
        await writeOriginalV1Manifest(manifest);
      }
      process.stdout.write(`${JSON.stringify({ recorded: true })}\n`);
      return;
    }
    if (op === "record-owned-logo") {
      const storageKey = extra?.trim() ?? "";
      const organizationId = manifest.orgs.a.id;
      const absolute = isolatedLogoFile(organizationId, storageKey);
      if (!absolute) {
        throw new Error("That logo is not inside the isolated acceptance root.");
      }
      const known = manifest.ownedLogoKeys.some(
        (entry) =>
          entry.organizationId === organizationId && entry.storageKey === storageKey,
      );
      if (!known) {
        manifest.ownedLogoKeys.push({ organizationId, storageKey });
        await writeOriginalV1Manifest(manifest);
      }
      process.stdout.write(`${JSON.stringify({ recorded: true })}\n`);
      return;
    }
    if (op === "owned-offering-type" || op === "owned-batch") {
      const name = extra?.trim() ?? "";
      if (!name.startsWith(manifest.prefix)) {
        throw new Error("That name is not owned by this acceptance run.");
      }
      if (op === "owned-offering-type") {
        const fund = await prisma.offeringType.findFirst({
          where: { organizationId: manifest.orgs.a.id, name },
          select: {
            name: true,
            code: true,
            description: true,
            active: true,
            displayOrder: true,
            defaultTaxDeductible: true,
          },
        });
        const allocations = fund
          ? await prisma.donationAllocation.findMany({
              where: {
                organizationId: manifest.orgs.a.id,
                offeringType: { organizationId: manifest.orgs.a.id, name },
              },
              select: { amount: true },
            })
          : [];
        process.stdout.write(
          `${JSON.stringify({
            fund: fund
              ? {
                  name: fund.name,
                  code: fund.code,
                  description: fund.description,
                  active: fund.active,
                  displayOrder: fund.displayOrder,
                  defaultTaxDeductible: fund.defaultTaxDeductible,
                }
              : null,
            allocationCount: allocations.length,
            allocationAmounts: allocations.map((row) => money(row.amount)),
          })}\n`,
        );
        return;
      }
      const batch = await prisma.offeringBatch.findFirst({
        where: { organizationId: manifest.orgs.a.id, name },
        select: {
          id: true,
          status: true,
          expectedTotal: true,
          recordedTotal: true,
          depositDate: true,
          depositReference: true,
        },
      });
      const donations = batch
        ? await prisma.donation.findMany({
            where: { organizationId: manifest.orgs.a.id, batchId: batch.id },
            select: {
              totalAmount: true,
              allocations: {
                select: { amount: true, offeringType: { select: { name: true } } },
              },
            },
          })
        : [];
      const lockAudits = batch
        ? await prisma.auditEvent.findMany({
            where: {
              organizationId: manifest.orgs.a.id,
              entityType: "OfferingBatch",
              entityId: batch.id,
              action: "LOCK_OFFERING_BATCH",
            },
            select: { changeMetadata: true },
          })
        : [];
      process.stdout.write(
        `${JSON.stringify({
          batch: batch
            ? {
                status: batch.status,
                expectedTotal: money(batch.expectedTotal),
                recordedTotal: money(batch.recordedTotal),
                depositDate: batch.depositDate
                  ? batch.depositDate.toISOString().slice(0, 10)
                  : null,
                depositReference: batch.depositReference,
              }
            : null,
          donationTotals: donations.map((row) => money(row.totalAmount)),
          allocations: donations.flatMap((row) =>
            row.allocations.map((allocation) => ({
              fund: allocation.offeringType.name,
              amount: money(allocation.amount),
            })),
          ),
          lockAuditCount: lockAudits.length,
          lockStatus: statusChange(lockAudits[0]?.changeMetadata),
        })}\n`,
      );
      return;
    }
    throw new Error(`Unknown original-v1 fixture query: ${op}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const [command, op, extra] = process.argv.slice(2);
  if (command === "preflight") {
    const report = diagnoseOriginalV1AcceptanceEnv();
    const baseUrl =
      process.env.PLAYWRIGHT_BASE_URL?.trim() ||
      process.env.APP_BASE_URL?.trim() ||
      "";
    const token = process.env.BITS_E2E_TARGET_TOKEN?.trim() || "";
    const e2eDatabaseUrl = process.env.BITS_E2E_DATABASE_URL?.trim() || "";
    if (baseUrl && token && e2eDatabaseUrl) {
      const probe = await probeOriginalV1AcceptanceTarget({
        baseUrl,
        targetToken: token,
        e2eDatabaseUrl,
      });
      if (probe) report.issues.push(probe);
      report.ok = report.issues.length === 0;
      report.readyForLiveAcceptance = report.ok && report.readyForFixtures;
    }
    process.stdout.write(formatOriginalV1PreflightReport(report));
    if (!report.ok) process.exitCode = 2;
    return;
  }
  if (command === "prepare") {
    parseOriginalV1AcceptanceConfig();
    await prepareOriginalV1AcceptanceFixtures();
    return;
  }
  if (command === "cleanup") {
    parseOriginalV1AcceptanceConfig();
    await cleanupOriginalV1AcceptanceFixtures();
    return;
  }
  if (command === "query" && op) {
    await query(op, extra);
    return;
  }
  throw new Error(
    "Usage: tsx e2e/acceptance/fixtures/cli.ts preflight|prepare|cleanup|query <op>",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Fixture command failed.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
