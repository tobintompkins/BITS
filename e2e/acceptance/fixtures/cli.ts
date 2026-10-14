import { parseOriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  diagnoseOriginalV1AcceptanceEnv,
  formatOriginalV1PreflightReport,
  probeOriginalV1AcceptanceTarget,
} from "@/lib/testing/original-v1-acceptance-preflight";

import { cleanupOriginalV1AcceptanceFixtures } from "./cleanup";
import { readOriginalV1Manifest } from "./manifest";
import { prepareOriginalV1AcceptanceFixtures } from "./prepare";
import { createOriginalV1AcceptancePrisma } from "./prisma";

loadOriginalV1AcceptanceEnvFiles();

async function query(op: string) {
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
    throw new Error(`Unknown original-v1 fixture query: ${op}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const [command, op] = process.argv.slice(2);
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
    await query(op);
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
