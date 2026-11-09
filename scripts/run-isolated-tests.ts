import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeSync } from "node:fs";

import { Client } from "pg";

import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  classifyIsolatedDatabasePreflight,
  describeIsolatedRunnerFailure,
  isolatedTestChildEnv,
  sanitizeIsolatedRunnerText,
} from "@/lib/testing/isolated-database";

loadOriginalV1AcceptanceEnvFiles();

function fail(message: string): never {
  writeSync(process.stderr.fd, `${sanitizeIsolatedRunnerText(message)}\n`);
  process.exit(2);
}

function connectionUrl(url: string) {
  const parsed = new URL(url);
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

async function assertIsolatedSchemaPresent(url: string) {
  const client = new Client({ connectionString: connectionUrl(url) });
  await client.connect();
  try {
    const result = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('offering_batches', 'events', 'audit_events')`,
    );
    if (result.rows[0]?.n !== 3) {
      fail(
        "Isolated BITS_E2E_DATABASE_URL is missing required schema. Real-database tests are blocked. Working DATABASE_URL was not migrated or reset.",
      );
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function fingerprintWorkingDatabase(url: string) {
  const client = new Client({ connectionString: connectionUrl(url) });
  await client.connect();
  try {
    const result = await client.query<{
      audits: number;
      events: number;
      attendance_actions: number;
      memberships: number;
      donations: number;
      donation_total: string;
      batches: number;
      households: number;
      household_memberships: number;
      audit_fp: string;
      event_fp: string;
      membership_fp: string;
      donation_fp: string;
      batch_fp: string;
      household_fp: string;
      household_membership_fp: string;
      organizations: number;
      organization_fp: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM audit_events) AS audits,
         (SELECT COUNT(*)::int FROM events) AS events,
         (SELECT COUNT(*)::int FROM event_attendance_actions) AS attendance_actions,
         (SELECT COUNT(*)::int FROM organization_memberships) AS memberships,
         (SELECT COUNT(*)::int FROM donations) AS donations,
         (SELECT COALESCE(SUM("totalAmount"), 0)::text FROM donations) AS donation_total,
         (SELECT COUNT(*)::int FROM offering_batches) AS batches,
         (SELECT COUNT(*)::int FROM households) AS households,
         (SELECT COUNT(*)::int FROM household_memberships) AS household_memberships,
         (SELECT md5(COALESCE(string_agg(row_key, ',' ORDER BY row_key), ''))
            FROM (
              SELECT id::text || '|' || action || '|' || "entityType" || '|' || "entityId"::text
                     || '|' || "organizationId"::text || '|' || "occurredAt"::text AS row_key
              FROM audit_events
            ) s) AS audit_fp,
         (SELECT md5(COALESCE(string_agg(row_key, ',' ORDER BY row_key), ''))
            FROM (
              SELECT id::text || '|' || "organizationId"::text || '|' || slug || '|' || "eventStatus"
                     || '|' || "updatedAt"::text AS row_key
              FROM events
            ) s) AS event_fp,
         (SELECT md5(COALESCE(string_agg(row_key, ',' ORDER BY row_key), ''))
            FROM (
              SELECT id::text || '|' || "organizationId"::text || '|' || "roleTypeId"::text
                     || '|' || active::text || '|' || version::text || '|' || "updatedAt"::text AS row_key
              FROM organization_memberships
            ) s) AS membership_fp,
         (SELECT md5(COALESCE(string_agg(row_key, ',' ORDER BY row_key), ''))
            FROM (
              SELECT id::text || '|' || "organizationId"::text || '|' || COALESCE("batchId"::text, '')
                     || '|' || "totalAmount"::text || '|' || "offeringDate"::text AS row_key
              FROM donations
            ) s) AS donation_fp,
         (SELECT md5(COALESCE(string_agg(row_key, ',' ORDER BY row_key), ''))
            FROM (
              SELECT id::text || '|' || status || '|' || "reviewVersion"::text
                     || '|' || "recordedTotal"::text || '|' || "updatedAt"::text AS row_key
              FROM offering_batches
            ) s) AS batch_fp,
         (SELECT md5(COALESCE(string_agg(row_key, ',' ORDER BY row_key), ''))
            FROM (
              SELECT id::text || '|' || "organizationId"::text || '|' || active::text
                     || '|' || COALESCE("primaryDonorId"::text, '')
                     || '|' || COALESCE("preferredStatementRecipientId"::text, '')
                     || '|' || "updatedAt"::text AS row_key
              FROM households
            ) s) AS household_fp,
         (SELECT md5(COALESCE(string_agg(row_key, ',' ORDER BY row_key), ''))
            FROM (
              SELECT id::text || '|' || "organizationId"::text || '|' || "householdId"::text
                     || '|' || "donorId"::text || '|' || "startDate"::text
                     || '|' || COALESCE("endDate"::text, '') || '|' || "updatedAt"::text AS row_key
              FROM household_memberships
            ) s) AS household_membership_fp,
         (SELECT COUNT(*)::int FROM organizations) AS organizations,
         (SELECT md5(COALESCE(string_agg(row_key, ',' ORDER BY row_key), ''))
            FROM (
              SELECT id::text || '|' || name || '|' || COALESCE("logoStorageKey", '')
                     || '|' || "updatedAt"::text AS row_key
              FROM organizations
            ) s) AS organization_fp`,
    );
    return result.rows[0];
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const preflight = classifyIsolatedDatabasePreflight(process.env);
  if (!preflight.ok) fail(preflight.reason);

  await assertIsolatedSchemaPresent(preflight.isolatedUrl);
  const before = await fingerprintWorkingDatabase(preflight.workingUrl);
  const runId = `iso-${randomUUID().slice(0, 8)}`;
  const extraArgs = process.argv.slice(2);
  let suiteFailed = false;
  try {
    execFileSync(
      "npx",
      ["vitest", "run", "--config", "vitest.isolated.config.ts", ...extraArgs],
      {
        env: isolatedTestChildEnv(preflight, runId),
        stdio: "inherit",
      },
    );
  } catch {
    suiteFailed = true;
  }

  const after = await fingerprintWorkingDatabase(preflight.workingUrl);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    fail(
      `Working-database fingerprints changed during isolated tests. before=${JSON.stringify(before)} after=${JSON.stringify(after)}. Tests did not run against working bits if connection guards held; investigate unrelated writers before deleting any rows.`,
    );
  }
  if (suiteFailed) {
    fail("Isolated database tests failed. Working fingerprints were unchanged.");
  }
  process.stdout.write(
    `isolated tests finished against ${preflight.isolatedDatabase}; working fingerprints unchanged ${JSON.stringify(before)}\n`,
  );
}

main().catch((error) => {
  fail(describeIsolatedRunnerFailure(error));
});
