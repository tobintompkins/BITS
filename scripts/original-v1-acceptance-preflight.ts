import { Client } from "pg";

import { loadOriginalV1AcceptanceEnvFiles } from "../lib/testing/original-v1-acceptance-env";
import {
  diagnoseOriginalV1AcceptanceEnv,
  formatOriginalV1PreflightReport,
  probeOriginalV1AcceptanceTarget,
} from "../lib/testing/original-v1-acceptance-preflight";

loadOriginalV1AcceptanceEnvFiles();

async function probeDatabase(url: string) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return null;
  } catch {
    return {
      code: "database_unavailable",
      names: ["BITS_E2E_DATABASE_URL"],
      message:
        "The isolated PostgreSQL target is unavailable. Create bits_e2e on the local server and apply existing migrations only to that database.",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const report = diagnoseOriginalV1AcceptanceEnv();
  const e2eDatabaseUrl = process.env.BITS_E2E_DATABASE_URL?.trim() || "";
  if (e2eDatabaseUrl) {
    const dbIssue = await probeDatabase(e2eDatabaseUrl);
    if (dbIssue) report.issues.push(dbIssue);
  }

  const baseUrl =
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    "";
  const token = process.env.BITS_E2E_TARGET_TOKEN?.trim() || "";
  if (baseUrl && token && e2eDatabaseUrl) {
    const probe = await probeOriginalV1AcceptanceTarget({
      baseUrl,
      targetToken: token,
      e2eDatabaseUrl,
    });
    if (probe) report.issues.push(probe);
    else report.readyForLiveAcceptance = report.readyForFixtures;
  }

  report.ok = report.issues.length === 0;
  process.stdout.write(formatOriginalV1PreflightReport(report));
  if (!report.ok) process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Acceptance preflight failed.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
