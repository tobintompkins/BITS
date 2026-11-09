import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Decimal from "decimal.js";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { isolatedConnectionString } from "@/lib/testing/isolated-database";

import {
  ORIGINAL_V1_FIXTURE_STATEMENT_WARNING,
  applyOriginalV1FixturePlan,
  buildOriginalV1FixturePlan,
  createLocalFixtureFilePort,
  originalV1FixtureStatementPath,
  type OriginalV1FixtureFilePort,
  type OriginalV1FixturePlan,
  type OriginalV1FixtureQuery,
} from "./original-v1-development-fixtures";

const plan = buildOriginalV1FixturePlan("integration");
const development = buildOriginalV1FixturePlan("development");
const FOREIGN_ORGANIZATION_ID = "33333333-3333-4333-8333-000000000001";
let client: Client;
let storageRoot = "";

function money(value: string | null | undefined) {
  return new Decimal(value ?? "0").toFixed(2);
}

function queryClient(): OriginalV1FixtureQuery {
  return (sql, params) => client.query(sql, params ? [...params] : undefined);
}

async function deleteOwnedRows(queryClient: Client, fixture: OriginalV1FixturePlan) {
  await queryClient.query("BEGIN");
  try {
    await queryClient.query(`DELETE FROM contribution_statements WHERE id = ANY($1::uuid[])`, [
      fixture.statements.map((row) => row.id),
    ]);
    await queryClient.query(`DELETE FROM ledger_create_idempotency WHERE id = ANY($1::uuid[])`, [
      fixture.idempotency.map((row) => row.id),
    ]);
    await queryClient.query(`DELETE FROM donation_allocations WHERE id = ANY($1::uuid[])`, [
      fixture.allocations.map((row) => row.id),
    ]);
    await queryClient.query(`DELETE FROM donations WHERE id = ANY($1::uuid[])`, [
      fixture.donations.map((row) => row.id),
    ]);
    await queryClient.query(`DELETE FROM offering_batches WHERE id = ANY($1::uuid[])`, [
      fixture.batches.map((row) => row.id),
    ]);
    await queryClient.query(`DELETE FROM offering_types WHERE id = ANY($1::uuid[])`, [
      fixture.offeringTypes.map((row) => row.id),
    ]);
    await queryClient.query(`DELETE FROM household_memberships WHERE id = ANY($1::uuid[])`, [
      fixture.householdMemberships.map((row) => row.id),
    ]);
    await queryClient.query(
      `UPDATE households
       SET "primaryDonorId" = NULL, "preferredStatementRecipientId" = NULL
       WHERE id = $1::uuid`,
      [fixture.household.id],
    );
    await queryClient.query(`DELETE FROM households WHERE id = $1::uuid`, [fixture.household.id]);
    await queryClient.query(`DELETE FROM donors WHERE id = ANY($1::uuid[])`, [
      fixture.donors.map((row) => row.id),
    ]);
    await queryClient.query(`DELETE FROM organization_memberships WHERE id = ANY($1::uuid[])`, [
      fixture.users.map((row) => row.membershipId),
    ]);
    await queryClient.query(`DELETE FROM user_accounts WHERE id = ANY($1::uuid[])`, [
      fixture.users.map((row) => row.id),
    ]);
    await queryClient.query(`DELETE FROM organizations WHERE id = $1::uuid`, [
      fixture.organization.id,
    ]);
    await queryClient.query(`DELETE FROM organizations WHERE id = $1::uuid`, [FOREIGN_ORGANIZATION_ID]);
    await queryClient.query("COMMIT");
  } catch (error) {
    await queryClient.query("ROLLBACK");
    throw error;
  }
}

beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "original-v1-integration-fixtures-"));
  client = new Client({ connectionString: isolatedConnectionString() });
  await client.connect();
  await deleteOwnedRows(client, plan);
});

afterAll(async () => {
  if (client) {
    await deleteOwnedRows(client, plan);
    await client.end();
  }
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
});

it("verifies isolated fixture SQL for creation, repeat, collision, and drift", async () => {
  expect(plan.organization.name).not.toBe("Grace Community Church");
  expect(plan.organization.slug).not.toBe(development.organization.slug);
  const connected = await client.query<{ database: string; addr: string | null }>(
    `SELECT current_database() AS database, inet_server_addr()::text AS addr`,
  );
  expect(connected.rows[0]?.database).toBe("bits_e2e");
  expect(connected.rows[0]?.addr ?? "").toMatch(/^(127\.0\.0\.1|::1)(\/|$)/);

  await client.query(
    `INSERT INTO organizations
      (id, name, slug, "mailingAddressLine1", city, state, "postalCode", "contactEmail", "updatedAt")
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
    [
      FOREIGN_ORGANIZATION_ID,
      plan.organization.name,
      plan.organization.slug,
      "9 Collision Lane",
      "Example",
      "TN",
      "00000",
      plan.organization.contactEmail,
      "2026-11-05T17:00:00.000Z",
    ],
  );
  const files = createLocalFixtureFilePort();
  const query = queryClient();
  await expect(
    applyOriginalV1FixturePlan({ plan, query, files, storageRoot }),
  ).rejects.toThrow(/not owned by this fixture/);
  const foreign = await client.query<{
    name: string;
    slug: string;
    contactEmail: string;
    mailingAddressLine1: string;
  }>(
    `SELECT name, slug, "contactEmail", "mailingAddressLine1"
     FROM organizations WHERE id = $1::uuid`,
    [FOREIGN_ORGANIZATION_ID],
  );
  expect(foreign.rows[0]).toMatchObject({
    name: plan.organization.name,
    slug: plan.organization.slug,
    contactEmail: plan.organization.contactEmail,
    mailingAddressLine1: "9 Collision Lane",
  });
  const ownedDuringCollision = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM organizations WHERE id = $1::uuid`,
    [plan.organization.id],
  );
  expect(Number(ownedDuringCollision.rows[0]?.count)).toBe(0);
  await client.query(`DELETE FROM organizations WHERE id = $1::uuid`, [FOREIGN_ORGANIZATION_ID]);

  const first = await applyOriginalV1FixturePlan({ plan, query, files, storageRoot });
  expect(first.status).toBe("applied");

  const gifts = await client.query<{
    id: string;
    donorId: string | null;
    anonymous: boolean;
    paymentMethod: string;
    totalAmount: string;
    deductibleAmount: string;
    batchId: string;
  }>(
    `SELECT id::text AS id, "donorId"::text AS "donorId", anonymous,
            "paymentMethod"::text AS "paymentMethod",
            "totalAmount"::text AS "totalAmount",
            "deductibleAmount"::text AS "deductibleAmount",
            "batchId"::text AS "batchId"
     FROM donations WHERE id = ANY($1::uuid[])`,
    [plan.donations.map((row) => row.id)],
  );
  const allocations = await client.query<{ donationId: string; code: string; amount: string }>(
    `SELECT a."donationId"::text AS "donationId", t.code, a.amount::text AS amount
     FROM donation_allocations a
     JOIN offering_types t ON t.id = a."offeringTypeId"
     WHERE a.id = ANY($1::uuid[])`,
    [plan.allocations.map((row) => row.id)],
  );
  const batches = await client.query<{
    id: string;
    status: string;
    recordedTotal: string;
    expectedTotal: string | null;
    reviewVersion: number;
  }>(
    `SELECT id::text AS id, status::text AS status, "recordedTotal"::text AS "recordedTotal",
            "expectedTotal"::text AS "expectedTotal", "reviewVersion"
     FROM offering_batches WHERE id = ANY($1::uuid[])`,
    [plan.batches.map((row) => row.id)],
  );
  const memberships = await client.query<{ donorId: string; endDate: string | null; householdId: string }>(
    `SELECT "donorId"::text AS "donorId", "endDate"::text AS "endDate", "householdId"::text AS "householdId"
     FROM household_memberships WHERE id = ANY($1::uuid[])`,
    [plan.householdMemberships.map((row) => row.id)],
  );
  const statements = await client.query<{
    statementType: string;
    status: string;
    deductibleTotal: string;
    donorId: string | null;
    householdId: string | null;
  }>(
    `SELECT "statementType"::text AS "statementType", status::text AS status,
            "deductibleTotal"::text AS "deductibleTotal",
            "donorId"::text AS "donorId", "householdId"::text AS "householdId"
     FROM contribution_statements WHERE id = ANY($1::uuid[])`,
    [plan.statements.map((row) => row.id)],
  );
  const donors = await client.query<{ id: string; firstName: string; active: boolean; userAccountId: string | null }>(
    `SELECT id::text AS id, "firstName", active, "userAccountId"::text AS "userAccountId"
     FROM donors WHERE id = ANY($1::uuid[])`,
    [plan.donors.map((row) => row.id)],
  );

  const locked = plan.batches.find((batch) => batch.status === "LOCKED");
  const draft = plan.batches.find((batch) => batch.status === "DRAFT");
  const lockedRow = batches.rows.find((row) => row.id === locked?.id);
  const draftRow = batches.rows.find((row) => row.id === draft?.id);
  expect(money(lockedRow?.recordedTotal)).toBe("100.00");
  expect(money(lockedRow?.expectedTotal)).toBe("100.00");
  expect(lockedRow).toMatchObject({ status: "LOCKED", reviewVersion: 2 });
  expect(money(draftRow?.recordedTotal)).toBe("0.00");
  expect(draftRow?.expectedTotal).toBeNull();
  expect(draftRow).toMatchObject({ status: "DRAFT", reviewVersion: 1 });

  const draftGifts = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM donations WHERE "batchId" = $1::uuid`,
    [draft?.id],
  );
  expect(Number(draftGifts.rows[0]?.count)).toBe(0);

  expect(gifts.rows).toHaveLength(3);
  const giftTotal = gifts.rows.reduce((sum, row) => sum.plus(row.totalAmount), new Decimal(0));
  expect(giftTotal.toFixed(2)).toBe("100.00");
  for (const gift of gifts.rows) {
    expect(money(gift.totalAmount)).toBe(money(gift.deductibleAmount));
    expect(gift.batchId).toBe(locked?.id);
    const allocated = allocations.rows
      .filter((row) => row.donationId === gift.id)
      .reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
    expect(allocated.toFixed(2)).toBe(money(gift.totalAmount));
  }
  const anonymous = gifts.rows.find((row) => row.anonymous);
  const check = gifts.rows.find((row) => row.paymentMethod === "CHECK");
  const envelope = gifts.rows.find((row) => row.paymentMethod === "CASH" && !row.anonymous);
  expect(anonymous).toMatchObject({ donorId: null });
  expect(money(anonymous?.totalAmount)).toBe("50.00");
  expect(money(check?.totalAmount)).toBe("25.00");
  expect(money(envelope?.totalAmount)).toBe("25.00");
  const envelopeAllocations = allocations.rows
    .filter((row) => row.donationId === envelope?.id)
    .map((row) => `${row.code}:${money(row.amount)}`)
    .sort();
  expect(envelopeAllocations).toEqual(["GENERAL:10.00", "MISSIONS:15.00"]);

  const jordan = donors.rows.find((row) => row.firstName === "Jordan");
  const morgan = donors.rows.find((row) => row.firstName === "Morgan");
  const riley = donors.rows.find((row) => row.firstName === "Riley");
  expect(jordan?.userAccountId).toBeTruthy();
  expect(check?.donorId).toBe(jordan?.id);
  expect(morgan?.userAccountId).toBeNull();
  expect(riley?.active).toBe(false);
  expect(memberships.rows).toHaveLength(2);
  expect(memberships.rows.every((row) => row.endDate === null && row.householdId === plan.household.id)).toBe(true);
  expect(statements.rows.find((row) => row.statementType === "INDIVIDUAL")).toMatchObject({
    status: "GENERATED",
    donorId: jordan?.id,
    householdId: null,
  });
  expect(money(statements.rows.find((row) => row.statementType === "INDIVIDUAL")?.deductibleTotal)).toBe("25.00");
  expect(statements.rows.find((row) => row.statementType === "HOUSEHOLD")).toMatchObject({
    status: "GENERATED",
    donorId: null,
    householdId: plan.household.id,
  });
  expect(money(statements.rows.find((row) => row.statementType === "HOUSEHOLD")?.deductibleTotal)).toBe("25.00");

  const placeholderPath = originalV1FixtureStatementPath(storageRoot, plan.statements[0].storageKey);
  const placeholder = await readFile(placeholderPath);
  expect(placeholder.toString("utf8")).toContain(ORIGINAL_V1_FIXTURE_STATEMENT_WARNING);
  expect(placeholder.toString("utf8")).not.toContain("Grace");

  const persistent = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM organizations WHERE id = $1::uuid OR slug = $2`,
    [development.organization.id, development.organization.slug],
  );
  expect(Number(persistent.rows[0]?.count)).toBe(0);

  const second = await applyOriginalV1FixturePlan({ plan, query, files, storageRoot });
  const recount = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM donations WHERE id = ANY($1::uuid[])`,
    [plan.donations.map((row) => row.id)],
  );
  expect(second.status).toBe("already-applied");
  expect(Number(recount.rows[0]?.count)).toBe(3);

  const driftedId = check?.id;
  await client.query(
    `UPDATE donations SET "totalAmount" = 1.00, "deductibleAmount" = 1.00 WHERE id = $1::uuid`,
    [driftedId],
  );
  await expect(applyOriginalV1FixturePlan({ plan, query, files, storageRoot })).rejects.toThrow(
    /were not reset/,
  );
  const drifted = await client.query<{ totalAmount: string }>(
    `SELECT "totalAmount"::text AS "totalAmount" FROM donations WHERE id = $1::uuid`,
    [driftedId],
  );
  expect(money(drifted.rows[0]?.totalAmount)).toBe("1.00");

  const corrupted = Buffer.from("%PDF-1.1\n% DIFFERENT BYTES\n%%EOF\n");
  await writeFile(placeholderPath, corrupted);
  await expect(applyOriginalV1FixturePlan({ plan, query, files, storageRoot })).rejects.toThrow(
    /not overwritten/,
  );
  expect(await readFile(placeholderPath)).toEqual(corrupted);
  expect(money((await client.query<{ totalAmount: string }>(
    `SELECT "totalAmount"::text AS "totalAmount" FROM donations WHERE id = $1::uuid`,
    [driftedId],
  )).rows[0]?.totalAmount)).toBe("1.00");
}, 90_000);

it("removes only the placeholder created by a failed attempt", async () => {
  await deleteOwnedRows(client, plan);
  await rm(originalV1FixtureStatementPath(storageRoot, plan.statements[0].storageKey), { force: true });
  await rm(originalV1FixtureStatementPath(storageRoot, plan.statements[1].storageKey), { force: true });
  const sentinel = path.join(storageRoot, "sentinel-not-owned.txt");
  await writeFile(sentinel, "leave this file");
  const real = createLocalFixtureFilePort();
  let creates = 0;
  const files: OriginalV1FixtureFilePort = {
    inspect: (absolutePath, expectedChecksum) => real.inspect(absolutePath, expectedChecksum),
    remove: (absolutePath) => real.remove(absolutePath),
    async createExclusive(absolutePath, bytes) {
      creates += 1;
      if (creates === 2) throw new Error("second placeholder failed");
      await real.createExclusive(absolutePath, bytes);
    },
  };

  await expect(
    applyOriginalV1FixturePlan({ plan, query: queryClient(), files, storageRoot }),
  ).rejects.toThrow(/second placeholder failed/);

  const firstPath = originalV1FixtureStatementPath(storageRoot, plan.statements[0].storageKey);
  const secondPath = originalV1FixtureStatementPath(storageRoot, plan.statements[1].storageKey);
  await expect(access(firstPath)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(secondPath)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(sentinel, "utf8")).toBe("leave this file");

  const committed = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM donations WHERE id = ANY($1::uuid[])`,
    [plan.donations.map((row) => row.id)],
  );
  expect(Number(committed.rows[0]?.count)).toBe(3);
  const repaired = await applyOriginalV1FixturePlan({
    plan,
    query: queryClient(),
    files: real,
    storageRoot,
  });
  const afterRepair = await client.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM donations WHERE id = ANY($1::uuid[])`,
    [plan.donations.map((row) => row.id)],
  );
  expect(repaired.status).toBe("already-applied");
  expect(Number(afterRepair.rows[0]?.count)).toBe(3);
  expect((await readFile(firstPath)).subarray(0, 5).toString()).toBe("%PDF-");
  expect(await readFile(sentinel, "utf8")).toBe("leave this file");
}, 90_000);
