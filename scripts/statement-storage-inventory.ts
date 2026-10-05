import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { parseStatementPdfStorageRef } from "../lib/storage/statement-pdf-ref";
import { resolveStatementPdfAbsolutePath } from "../lib/storage/statement-pdf";

const LIMIT = 200;

export function refuseApplyMigration(argv: string[]) {
  return argv.includes("--apply");
}

async function main() {
  if (refuseApplyMigration(process.argv)) {
    console.error(
      "Apply/copy migration is not enabled in this increment. Re-run without --apply for a read-only inventory.",
    );
    process.exit(2);
  }

  const { prisma } = await import("../lib/db/prisma");

  const rows = await prisma.contributionStatement.findMany({
    select: {
      id: true,
      organizationId: true,
      pdfStorageKey: true,
      pdfChecksum: true,
      statementIdentifier: true,
      status: true,
    },
    orderBy: [{ generatedAt: "asc" }, { id: "asc" }],
    take: LIMIT + 1,
  });
  const truncated = rows.length > LIMIT;
  const scanned = rows.slice(0, LIMIT);
  const summary = {
    scanned: scanned.length,
    truncated,
    local: 0,
    remote: 0,
    unknown: 0,
    missingLocalFile: 0,
    checksumMismatch: 0,
    targetKeyCollision: 0,
  };
  const details: Array<Record<string, string>> = [];
  const targetKeys = new Map<string, string>();

  for (const row of scanned) {
    const parsed = parseStatementPdfStorageRef(
      row.pdfStorageKey,
      row.organizationId,
      row.id,
    );
    if (!parsed.ok) {
      summary.unknown += 1;
      details.push({
        statementId: row.id,
        issue: "unknown-or-unsafe-reference",
      });
      continue;
    }
    if (parsed.backend === "s3") {
      summary.remote += 1;
      continue;
    }
    summary.local += 1;
    const remoteKey = `s3v1:${parsed.objectKey}`;
    const previous = targetKeys.get(remoteKey);
    if (previous && previous !== row.id) {
      summary.targetKeyCollision += 1;
      details.push({
        statementId: row.id,
        issue: "target-key-collision",
      });
    } else {
      targetKeys.set(remoteKey, row.id);
    }
    const absolutePath = resolveStatementPdfAbsolutePath(parsed.objectKey);
    try {
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile() || fileStat.size <= 0) {
        summary.missingLocalFile += 1;
        details.push({ statementId: row.id, issue: "missing-local-file" });
        continue;
      }
      if (row.pdfChecksum?.trim()) {
        const actual = createHash("sha256")
          .update(await readFile(absolutePath))
          .digest("hex");
        if (actual !== row.pdfChecksum.trim().toLowerCase()) {
          summary.checksumMismatch += 1;
          details.push({ statementId: row.id, issue: "checksum-mismatch" });
        }
      }
    } catch {
      summary.missingLocalFile += 1;
      details.push({ statementId: row.id, issue: "missing-local-file" });
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: true,
        writesPerformed: false,
        summary,
        details: details.slice(0, 50),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

if (!process.env.VITEST) {
  main()
    .catch((error) => {
      console.error(
        error instanceof Error
          ? error.message
          : "Unable to inventory statement storage.",
      );
      process.exitCode = 1;
    });
}
