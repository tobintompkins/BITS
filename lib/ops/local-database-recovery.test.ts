import { describe, expect, it } from "vitest";

import { parsePostgresTargetIdentity } from "@/lib/testing/original-v1-database-url";

import {
  isRecoveryLoopbackAddress,
  assertRecoveryArguments,
  assertRecoveryConfiguration,
  buildPgDumpArgs,
  buildPgRestoreArgs,
  compareRecoveryEvidence,
  createRecoveryRunId,
  recoveryConstraintProbes,
  recoveryDatabaseUrl,
  recoveryFixtureAmounts,
  recoveryProcessEnv,
  redactRecoveryOutput,
  type RecoveryEvidence,
} from "./local-database-recovery";

const runId = createRecoveryRunId(new Date("2026-11-04T15:00:00.000Z"), Buffer.from("abcd1234", "hex"));

function config(overrides: Partial<Parameters<typeof assertRecoveryConfiguration>[0]> = {}) {
  return assertRecoveryConfiguration({
    host: "127.0.0.1",
    port: "5432",
    username: "bits_operator",
    maintenanceDatabase: "postgres",
    runId,
    env: {},
    ...overrides,
  });
}

describe("local database recovery targets", () => {
  it("builds two distinct rehearsal names and refuses reserved databases", () => {
    const target = config();
    expect(target.sourceDatabase).toBe(`bits_e2e_recovery_${runId}_source`);
    expect(target.restoredDatabase).toBe(`bits_e2e_recovery_${runId}_restored`);
    expect(target.sourceDatabase).not.toBe(target.restoredDatabase);
    expect(target.maintenanceDatabase).toBe("postgres");
    for (const name of ["bits", "bits_e2e", "template0", "template1"]) {
      expect(() =>
        config({ maintenanceDatabase: name }),
      ).toThrow(/Maintenance database must be postgres/);
    }
  });

  it("requires an explicit loopback host and port", () => {
    expect(() => config({ host: "localhost" })).toThrow(/ambiguous/);
    expect(() => config({ host: "db.example.test" })).toThrow(/loopback/);
    expect(() => config({ host: "/tmp" })).toThrow(/Socket|loopback|paths/i);
    expect(() => config({ host: "127.0.0.1,192.0.2.10" })).toThrow(/multi-host|Socket|paths/i);
    expect(() => config({ host: "::1" })).not.toThrow();
    expect(() => config({ port: "" })).toThrow(/explicit integer/);
    expect(() => config({ port: "0" })).toThrow(/1 and 65535/);
    expect(() => config({ port: "5432" })).not.toThrow();
    expect(isRecoveryLoopbackAddress("127.0.0.1/32")).toBe(true);
    expect(isRecoveryLoopbackAddress("::1/128")).toBe(true);
    expect(isRecoveryLoopbackAddress("::ffff:127.0.0.1/128")).toBe(true);
    expect(isRecoveryLoopbackAddress("192.0.2.10/32")).toBe(false);
    expect(isRecoveryLoopbackAddress(null)).toBe(false);
  });

  it("refuses libpq overrides that node-pg would not apply the same way", () => {
    const url = "postgresql://app@127.0.0.1:5432/postgres?hostaddr=192.0.2.10";
    expect(parsePostgresTargetIdentity(url)?.hostname).toBe("loopback");
    expect(() => assertRecoveryArguments(["--host", "127.0.0.1", url])).toThrow(/raw PostgreSQL URL/);
    expect(() =>
      assertRecoveryArguments(["--host", "127.0.0.1", "--options", "hostaddr=192.0.2.10"]),
    ).toThrow(/hostaddr/);
    expect(() => config({ env: { PGHOSTADDR: "192.0.2.10" } })).toThrow(/PGHOSTADDR/);
    expect(() => config({ env: { PGOPTIONS: "-c search_path=bits" } })).toThrow(/PGOPTIONS/);
    expect(() => config({ env: { PGSERVICE: "remote" } })).toThrow(/PGSERVICE/);
    expect(() => config({ env: { PGHOST: "/tmp" } })).toThrow(/PGHOST/);
    expect(() => assertRecoveryArguments(["--clean"])).toThrow(/--clean/);
  });

  it("keeps passwords and destination overrides out of dump and restore arguments", () => {
    const target = config();
    const password = "super-secret-value";
    const dumpArgs = buildPgDumpArgs({
      host: target.host,
      port: target.port,
      username: target.username,
      database: target.sourceDatabase,
      dumpPath: "/private/recovery.dump",
    });
    const restoreArgs = buildPgRestoreArgs({
      host: target.host,
      port: target.port,
      username: target.username,
      database: target.restoredDatabase,
      dumpPath: "/private/recovery.dump",
    });
    const env = recoveryProcessEnv({
      host: target.host,
      port: target.port,
      username: target.username,
      database: target.sourceDatabase,
      password,
    });
    const url = recoveryDatabaseUrl({
      host: target.host,
      port: target.port,
      username: target.username,
      database: target.sourceDatabase,
      password,
    });

    expect(dumpArgs.join(" ")).not.toContain(password);
    expect(restoreArgs.join(" ")).not.toContain(password);
    expect(dumpArgs).not.toEqual(expect.arrayContaining(["--clean", "--create", "-c", "-C"]));
    expect(restoreArgs).toEqual(expect.arrayContaining(["--exit-on-error", "--single-transaction"]));
    expect(restoreArgs).not.toEqual(expect.arrayContaining(["--clean", "--create"]));
    expect(dumpArgs).toContain(target.sourceDatabase);
    expect(restoreArgs).toContain(target.restoredDatabase);
    expect(env.PGHOSTADDR).toBeUndefined();
    expect(env.PGOPTIONS).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.PGDATABASE).toBe(target.sourceDatabase);
    expect(env.PGPASSWORD).toBe(password);
    expect(url).toContain(`/${target.sourceDatabase}?sslmode=disable`);
    expect(url).not.toContain("hostaddr");
    expect(redactRecoveryOutput(`failed ${url} ${password}`, [password])).not.toContain(password);
    expect(redactRecoveryOutput(url, [password])).not.toMatch(/postgres(ql)?:\/\//);
    expect(() =>
      buildPgDumpArgs({
        host: target.host,
        port: target.port,
        username: target.username,
        database: "bits",
        dumpPath: "/tmp/x.dump",
      }),
    ).toThrow(/reserved database bits/);
  });

  it("uses decimal addition for the fictional gift and compares evidence exactly", () => {
    const amounts = recoveryFixtureAmounts();
    expect(amounts.total).toBe("10.30");
    expect(amounts.partA).toBe("4.10");
    expect(amounts.partB).toBe("6.20");
    const probes = recoveryConstraintProbes({
      organizationId: "00000000-0000-4000-8000-000000000001",
      donorId: "00000000-0000-4000-8000-000000000002",
      householdId: "00000000-0000-4000-8000-000000000003",
      actorUserAccountId: "00000000-0000-4000-8000-000000000004",
      batchId: "00000000-0000-4000-8000-000000000005",
    });
    expect(probes.map((probe) => probe.expectedSqlState)).toEqual(["23505", "23505", "23503"]);
    expect(probes[0]?.sql).toContain("household_memberships");
    expect(JSON.stringify(probes)).not.toMatch(/DATABASE_URL|bits_e2e[^_]/);

    const evidence = {
      migrations: ["001"],
      indexes: [{ name: "household_memberships_one_open_per_donor", definition: "unique" }],
      foreignKeys: [],
      organizations: ["recovery-church-alpha", "recovery-church-bravo"],
      roles: ["DATA_ENTRY"],
      memberships: [],
      donor: {
        organizationSlug: "recovery-church-alpha",
        firstName: "Ada",
        lastName: "Fixture",
        linkedAccount: false,
      },
      householdMemberships: amounts.householdMemberships,
      offeringType: { organizationSlug: "recovery-church-alpha", code: "RECOVERY_GENERAL" },
      batch: {
        organizationSlug: "recovery-church-alpha",
        status: "DRAFT",
        reviewVersion: 4,
        expectedTotal: "10.30",
        recordedTotal: "10.30",
      },
      gift: {
        paymentMethod: "CASH",
        totalAmount: "10.30",
        deductibleAmount: "10.30",
        allocationSum: "10.30",
        allocationCount: 2,
      },
      audit: { action: "RECOVERY_FIXTURE_GIFT", entityType: "Donation", linkedToDonation: true },
      idempotency: {
        action: "CREATE_MANUAL_BATCH_DONATION",
        operationToken: "recovery-fixture-token",
        linkedToDonation: true,
        linkedToBatch: true,
      },
    } satisfies RecoveryEvidence;
    expect(compareRecoveryEvidence(evidence, structuredClone(evidence))).toBe(true);
    expect(
      compareRecoveryEvidence(evidence, {
        ...evidence,
        gift: { ...evidence.gift, allocationSum: "10.31" },
      }),
    ).toBe(false);
  });
});
