import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import {
  isolatedConnectionString,
  isolatedDatabaseRunEnabled,
} from "@/lib/testing/isolated-database";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import { postgresTargetsAreEquivalent } from "@/lib/testing/original-v1-database-url";

loadOriginalV1AcceptanceEnvFiles();

const enabled = isolatedDatabaseRunEnabled();

describe.skipIf(!enabled)("account donor concurrency (isolated bits_e2e)", () => {
  const clients: Client[] = [];

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
  });

  it("keeps one account-linked donor when a second insert conflicts, and does not continue an aborted transaction", async () => {
    const databaseUrl = process.env.DATABASE_URL ?? "";
    const isolatedUrl = isolatedConnectionString();
    if (!postgresTargetsAreEquivalent(databaseUrl, isolatedUrl)) {
      throw new Error("Refusing account-donor SQL because DATABASE_URL is not isolated bits_e2e.");
    }
    const client = new Client({ connectionString: isolatedUrl });
    clients.push(client);
    await client.connect();
    const identity = await client.query<{ current_database: string }>(
      "SELECT current_database()",
    );
    if (identity.rows[0]?.current_database !== "bits_e2e") {
      throw new Error("Refusing account-donor SQL outside bits_e2e.");
    }

    const orgId = randomUUID();
    const accountId = randomUUID();
    const firstDonor = randomUUID();
    const secondDonor = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO organizations (
           id, name, slug, "mailingAddressLine1", city, state, "postalCode", "updatedAt"
         ) VALUES ($1, 'Concurrency Church', $2, '1 Test', 'Saco', 'ME', '04072', NOW())`,
        [orgId, `concurrency-${orgId.slice(0, 8)}`],
      );
      await client.query(
        `INSERT INTO user_accounts (id, "clerkUserId", "primaryEmail", "updatedAt")
         VALUES ($1, $2, $3, NOW())`,
        [accountId, `clerk-${accountId}`, `concurrency-${accountId.slice(0, 8)}@example.test`],
      );
      await client.query(
        `INSERT INTO donors (
           id, "organizationId", "userAccountId", "firstName", "lastName", "updatedAt"
         ) VALUES ($1, $2, $3, 'First', 'Donor', NOW())`,
        [firstDonor, orgId, accountId],
      );
      await expect(
        client.query(
          `INSERT INTO donors (
             id, "organizationId", "userAccountId", "firstName", "lastName", "updatedAt"
           ) VALUES ($1, $2, $3, 'Second', 'Donor', NOW())`,
          [secondDonor, orgId, accountId],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
      await expect(client.query("SELECT COUNT(*) FROM donors")).rejects.toThrow(/aborted/i);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query(
        `INSERT INTO organizations (
           id, name, slug, "mailingAddressLine1", city, state, "postalCode", "updatedAt"
         ) VALUES ($1, 'Concurrency Church', $2, '1 Test', 'Saco', 'ME', '04072', NOW())`,
        [orgId, `concurrency-${orgId.slice(0, 8)}`],
      );
      await client.query(
        `INSERT INTO user_accounts (id, "clerkUserId", "primaryEmail", "updatedAt")
         VALUES ($1, $2, $3, NOW())`,
        [accountId, `clerk-${accountId}`, `concurrency-${accountId.slice(0, 8)}@example.test`],
      );
      await client.query(
        `INSERT INTO donors (
           id, "organizationId", "userAccountId", "firstName", "lastName", "updatedAt"
         ) VALUES ($1, $2, $3, 'First', 'Donor', NOW())
         ON CONFLICT ("organizationId", "userAccountId") DO NOTHING`,
        [firstDonor, orgId, accountId],
      );
      await client.query(
        `INSERT INTO donors (
           id, "organizationId", "userAccountId", "firstName", "lastName", "updatedAt"
         ) VALUES ($1, $2, $3, 'Second', 'Donor', NOW())
         ON CONFLICT ("organizationId", "userAccountId") DO NOTHING`,
        [secondDonor, orgId, accountId],
      );
      const count = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM donors WHERE "organizationId" = $1`,
        [orgId],
      );
      expect(count.rows[0]?.count).toBe("1");
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
    }
  });
});
