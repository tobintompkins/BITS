import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ORIGINAL_V1_FIXTURE_APPLY_COMMAND,
  ORIGINAL_V1_FIXTURE_DATABASE,
  ORIGINAL_V1_FIXTURE_DRY_RUN_MESSAGE,
  ORIGINAL_V1_FIXTURE_LOCAL_ID_LIMIT,
  ORIGINAL_V1_FIXTURE_STATEMENT_WARNING,
  ORIGINAL_V1_FIXTURE_TABLES,
  ORIGINAL_V1_FIXTURE_TARGET_REASON,
  applyOriginalV1FixturePlan,
  buildOriginalV1FixturePlan,
  classifyOriginalV1FixtureInvocation,
  createLocalFixtureFilePort,
  evaluateOriginalV1FixtureOwnership,
  executeOriginalV1DevelopmentFixtures,
  originalV1FixtureObservationFromReadModel,
  originalV1FixtureReadModel,
  originalV1FixtureStatementPath,
  type OriginalV1FixtureFilePort,
  type OriginalV1FixturePlan,
  type OriginalV1FixtureQuery,
  type OriginalV1FixtureReadModel,
} from "./original-v1-development-fixtures";

const WORKING_URL = "postgresql://app:secret@127.0.0.1:5432/bits";
const ISOLATED_URL = "postgresql://tester:secret@127.0.0.1:5432/bits_e2e";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function emptyModel(plan: OriginalV1FixturePlan): OriginalV1FixtureReadModel {
  const model = originalV1FixtureReadModel(plan);
  for (const key of Object.keys(model) as Array<keyof OriginalV1FixtureReadModel>) {
    model[key] = [];
  }
  return model;
}

function sqlRows(plan: OriginalV1FixturePlan) {
  const model = originalV1FixtureReadModel(plan);
  return {
    organizations: model.organizations,
    users: model.users,
    memberships: model.memberships,
    donors: model.donors,
    households: model.households,
    "household-memberships": model.householdMemberships,
    offerings: model.offerings,
    batches: model.batches,
    donations: model.donations,
    allocations: model.allocations,
    idempotency: model.idempotency,
    statements: model.statements.map((row) => ({
      id: row.id,
      statementType: row.statementType,
      status: row.status,
      statementIdentifier: row.statementIdentifier,
      donorId: row.donorId,
      householdId: row.householdId,
      deductibleTotal: row.deductibleTotal,
      pdfStorageKey: row.pdfStorageKey,
      pdfChecksum: row.pdfChecksum,
    })),
  };
}

function scriptedQuery(options: {
  database?: string;
  addr?: string | null;
  tables?: readonly string[];
  rows?: Record<string, readonly unknown[]>;
  failOn?: string;
}) {
  const calls: string[] = [];
  const query: OriginalV1FixtureQuery = async (sql) => {
    calls.push(sql);
    if (options.failOn && sql.includes(options.failOn)) throw new Error("insert failed");
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("current_database")) {
      return {
        rows: [
          {
            database: options.database ?? ORIGINAL_V1_FIXTURE_DATABASE,
            addr: options.addr === undefined ? "127.0.0.1" : options.addr,
          },
        ],
      };
    }
    if (sql.includes("information_schema.tables")) {
      return {
        rows: (options.tables ?? ORIGINAL_V1_FIXTURE_TABLES).map((table_name) => ({ table_name })),
      };
    }
    const tag = /-- ov1:([a-z-]+)/.exec(sql)?.[1];
    if (tag) {
      return { rows: [...(options.rows?.[tag] ?? [])] as Array<Record<string, unknown>> };
    }
    if (sql.includes("FROM role_types")) {
      return {
        rows: [
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", code: "ORG_ADMIN" },
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", code: "TREASURER" },
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", code: "DATA_ENTRY" },
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", code: "REPORT_VIEWER" },
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5", code: "DONOR" },
        ],
      };
    }
    return { rows: [] };
  };
  return { calls, query };
}

function memoryFiles() {
  const files = new Map<string, Buffer>();
  let created = 0;
  const port: OriginalV1FixtureFilePort = {
    async inspect(absolutePath, expectedChecksum) {
      const bytes = files.get(absolutePath);
      if (!bytes) return "missing";
      const checksum = createHash("sha256").update(bytes).digest("hex");
      return checksum === expectedChecksum ? "matching" : "different";
    },
    async createExclusive(absolutePath, bytes) {
      if (files.has(absolutePath)) {
        const error = new Error("exists") as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
      }
      files.set(absolutePath, Buffer.from(bytes));
      created += 1;
    },
    async remove(absolutePath) {
      files.delete(absolutePath);
    },
  };
  return {
    port,
    files,
    created: () => created,
  };
}

describe("original v1 fixture plan", () => {
  it("builds one fictional Grace church and keeps the integration namespace separate", () => {
    const development = buildOriginalV1FixturePlan("development");
    const integration = buildOriginalV1FixturePlan("integration");
    const again = buildOriginalV1FixturePlan("development");

    expect(development.organization.name).toBe("Grace Community Church");
    expect(development.organization.slug).toBe("original-v1-grace-community");
    expect(integration.organization.name).not.toBe(development.organization.name);
    expect(development.organization.id).toBe(again.organization.id);
    expect(development.organization.id).not.toBe(integration.organization.id);
    expect(development.users.map((user) => user.clerkUserId).join(" ")).not.toContain("user_");
    expect(development.placeholderPdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(development.placeholderPdf.toString("utf8")).toContain(ORIGINAL_V1_FIXTURE_STATEMENT_WARNING);
    expect(development.placeholderPdf.toString("utf8")).not.toContain("Grace");
    expect(development.statements.map((statement) => statement.storageKey).join(" ")).not.toContain("s3v1:");

    const locked = development.batches.find((batch) => batch.status === "LOCKED");
    const draft = development.batches.find((batch) => batch.status === "DRAFT");
    expect(draft).toMatchObject({ recordedTotal: "0.00", reviewVersion: 1, status: "DRAFT" });
    expect(locked).toMatchObject({ recordedTotal: "100.00", expectedTotal: "100.00", reviewVersion: 2 });
    const gifts = development.donations.filter((gift) => gift.batchId === locked?.id);
    expect(gifts).toHaveLength(3);
    expect(gifts.find((gift) => gift.anonymous)).toMatchObject({ donorId: null, paymentMethod: "CASH" });
    expect(gifts.filter((gift) => gift.paymentMethod === "CHECK")).toHaveLength(1);
    const envelope = gifts.find((gift) => gift.note === "Split envelope");
    expect(development.allocations.filter((row) => row.donationId === envelope?.id)).toHaveLength(2);
    expect(development.donors.filter((row) => row.lastName === "Smith").map((row) => row.mailingAddressLine1)).toEqual([
      development.household.mailingAddressLine1,
      development.household.mailingAddressLine1,
    ]);
    expect(development.donors.find((row) => row.firstName === "Jordan")?.userAccountId).toBeTruthy();
    expect(development.donors.find((row) => row.firstName === "Morgan")?.userAccountId).toBeNull();
    expect(development.donors.find((row) => row.firstName === "Riley")?.active).toBe(false);
    expect(development.householdMemberships.every((row) => row.endDate === null)).toBe(true);
  });
});

describe("original v1 fixture guards", () => {
  it("prints the inventory without applying when the flag is absent", async () => {
    let connected = false;
    const stdout: string[] = [];
    const code = await executeOriginalV1DevelopmentFixtures({
      argv: ["tsx", "prisma/seed.ts", "--original-v1-fixtures"],
      env: {},
      connect: async () => {
        connected = true;
        throw new Error("connect");
      },
      writeStdout: (text) => stdout.push(text),
      writeStderr: () => undefined,
    });
    const report = JSON.parse(stdout.join(""));

    expect(code).toBe(0);
    expect(connected).toBe(false);
    expect(report.applyPerformed).toBe(false);
    expect(report.message).toBe(ORIGINAL_V1_FIXTURE_DRY_RUN_MESSAGE);
    expect(report.manifest.church.name).toBe("Grace Community Church");
    expect(report.localIdentityLimitation).toBe(ORIGINAL_V1_FIXTURE_LOCAL_ID_LIMIT);
    expect(report.applyCommand).toBe(ORIGINAL_V1_FIXTURE_APPLY_COMMAND);
    expect(stdout.join("")).not.toContain("postgresql://");
    expect(stdout.join("")).not.toContain("secret");
  });

  it("refuses an absent, remote, differently named, or working target before any connection", () => {
    const cases = [
      { env: {}, reason: "BITS_E2E_DATABASE_URL is required" },
      {
        env: { DATABASE_URL: WORKING_URL },
        reason: "BITS_E2E_DATABASE_URL is required",
      },
      {
        env: {
          DATABASE_URL: WORKING_URL,
          BITS_E2E_DATABASE_URL: "postgresql://tester:secret@db.example:5432/bits_e2e",
        },
        reason: ORIGINAL_V1_FIXTURE_TARGET_REASON,
      },
      {
        env: {
          DATABASE_URL: WORKING_URL,
          BITS_E2E_DATABASE_URL: "postgresql://tester:secret@127.0.0.1:5432/bits_e2e_recovery_example",
        },
        reason: ORIGINAL_V1_FIXTURE_TARGET_REASON,
      },
      {
        env: {
          DATABASE_URL: "postgresql://app:secret@localhost:5432/bits_e2e",
          BITS_E2E_DATABASE_URL: ISOLATED_URL,
        },
        reason: "must not identify the same PostgreSQL database",
      },
    ];

    for (const entry of cases) {
      const result = classifyOriginalV1FixtureInvocation({
        argv: ["tsx", "prisma/seed.ts", "--original-v1-fixtures", "--apply"],
        env: entry.env,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain(entry.reason);
      expect(JSON.stringify(result)).not.toContain("secret");
      expect(JSON.stringify(result)).not.toContain("postgresql://");
    }

    const ready = classifyOriginalV1FixtureInvocation({
      argv: ["tsx", "prisma/seed.ts", "--original-v1-fixtures", "--apply"],
      env: { DATABASE_URL: WORKING_URL, BITS_E2E_DATABASE_URL: ISOLATED_URL },
    });
    expect(ready.ok).toBe(true);
    if (ready.ok) expect(ready.mode).toBe("apply");
  });

  it("redacts a connector failure and does not treat a missing apply flag as a write", async () => {
    const stderr: string[] = [];
    const code = await executeOriginalV1DevelopmentFixtures({
      argv: ["tsx", "prisma/seed.ts", "--original-v1-fixtures", "--apply"],
      env: { DATABASE_URL: WORKING_URL, BITS_E2E_DATABASE_URL: ISOLATED_URL },
      connect: async () => {
        throw new Error(`connect failed ${ISOLATED_URL} password=secret`);
      },
      writeStdout: () => undefined,
      writeStderr: (text) => stderr.push(text),
    });

    expect(code).toBe(2);
    expect(stderr.join("")).toContain("[redacted-database-url]");
    expect(stderr.join("")).toContain("password=[redacted]");
    expect(stderr.join("")).not.toContain("secret");
  });
});

describe("original v1 fixture ownership", () => {
  const plan = buildOriginalV1FixturePlan("development");

  it("accepts an exact owned set and stops on collision, drift, or a partial set", () => {
    expect(
      evaluateOriginalV1FixtureOwnership(
        plan,
        originalV1FixtureObservationFromReadModel(originalV1FixtureReadModel(plan)),
      ).status,
    ).toBe("applied");
    expect(
      evaluateOriginalV1FixtureOwnership(
        plan,
        originalV1FixtureObservationFromReadModel(emptyModel(plan)),
      ).status,
    ).toBe("absent");

    const foreign = originalV1FixtureReadModel(plan);
    foreign.organizations[0] = {
      ...foreign.organizations[0],
      id: "99999999-9999-4999-8999-999999999999",
    };
    expect(evaluateOriginalV1FixtureOwnership(plan, originalV1FixtureObservationFromReadModel(foreign))).toMatchObject({
      status: "conflict",
    });

    const drifted = originalV1FixtureReadModel(plan);
    drifted.donations[0] = { ...drifted.donations[0], totalAmount: "1.00" };
    expect(evaluateOriginalV1FixtureOwnership(plan, originalV1FixtureObservationFromReadModel(drifted)).status).toBe(
      "conflict",
    );

    const partial = originalV1FixtureReadModel(plan);
    partial.donations = [];
    expect(evaluateOriginalV1FixtureOwnership(plan, originalV1FixtureObservationFromReadModel(partial)).status).toBe(
      "conflict",
    );
  });

  it("inserts once, repeats without inserting, and leaves a conflicting church untouched", async () => {
    const files = memoryFiles();
    const absent = scriptedQuery({ rows: {} });
    const inserted = await applyOriginalV1FixturePlan({
      plan,
      query: absent.query,
      files: files.port,
      storageRoot: "/tmp/original-v1-fixtures",
    });

    expect(inserted.status).toBe("applied");
    expect(absent.calls.some((sql) => sql.includes('INSERT INTO organizations'))).toBe(true);
    expect(absent.calls.some((sql) => sql.includes("WHERE NOT EXISTS"))).toBe(true);
    expect(absent.calls.some((sql) => sql.includes("COMMIT"))).toBe(true);
    expect(absent.calls.some((sql) => /^\s*UPDATE\b/i.test(sql))).toBe(false);
    expect(files.created()).toBe(2);

    const repeat = scriptedQuery({ rows: sqlRows(plan) });
    const second = await applyOriginalV1FixturePlan({
      plan,
      query: repeat.query,
      files: files.port,
      storageRoot: "/tmp/original-v1-fixtures",
    });
    expect(second.status).toBe("already-applied");
    expect(repeat.calls.some((sql) => sql.includes('INSERT INTO organizations'))).toBe(false);
    expect(files.created()).toBe(2);

    const conflictRows = sqlRows(plan);
    conflictRows.organizations = [
      { ...conflictRows.organizations[0], id: "99999999-9999-4999-8999-999999999999" },
    ];
    const conflict = scriptedQuery({ rows: conflictRows });
    await expect(
      applyOriginalV1FixturePlan({
        plan,
        query: conflict.query,
        files: files.port,
        storageRoot: "/tmp/original-v1-fixtures",
      }),
    ).rejects.toThrow(/not owned by this fixture/);
    expect(conflict.calls.some((sql) => sql.includes('INSERT INTO organizations'))).toBe(false);
    expect(conflict.calls.some((sql) => sql === "ROLLBACK")).toBe(true);
  });

  it("stops before a transaction when the connection, schema, or placeholder does not match", async () => {
    const files = memoryFiles();
    const wrongDatabase = scriptedQuery({ database: "bits" });
    await expect(
      applyOriginalV1FixturePlan({
        plan,
        query: wrongDatabase.query,
        files: files.port,
        storageRoot: "/tmp/original-v1-fixtures",
      }),
    ).rejects.toThrow(/loopback bits_e2e/);
    expect(wrongDatabase.calls).toHaveLength(1);

    const noServer = scriptedQuery({ addr: null });
    await expect(
      applyOriginalV1FixturePlan({
        plan,
        query: noServer.query,
        files: files.port,
        storageRoot: "/tmp/original-v1-fixtures",
      }),
    ).rejects.toThrow(/loopback bits_e2e/);

    const missingSchema = scriptedQuery({ tables: ["organizations"] });
    await expect(
      applyOriginalV1FixturePlan({
        plan,
        query: missingSchema.query,
        files: files.port,
        storageRoot: "/tmp/original-v1-fixtures",
      }),
    ).rejects.toThrow(/No migration or reset was run/);
    expect(missingSchema.calls.some((sql) => sql === "BEGIN")).toBe(false);

    const blocked = memoryFiles();
    const statement = plan.statements[0];
    const absolute = originalV1FixtureStatementPath("/tmp/original-v1-fixtures", statement.storageKey);
    blocked.files.set(absolute, Buffer.from("different"));
    const ready = scriptedQuery({ rows: {} });
    await expect(
      applyOriginalV1FixturePlan({
        plan,
        query: ready.query,
        files: blocked.port,
        storageRoot: "/tmp/original-v1-fixtures",
      }),
    ).rejects.toThrow(/not overwritten/);
    expect(ready.calls.some((sql) => sql === "BEGIN")).toBe(false);
  });

  it("rolls back a failed insert and does not keep that attempt's file", async () => {
    const files = memoryFiles();
    const failing = scriptedQuery({ rows: {}, failOn: 'INSERT INTO organizations' });
    await expect(
      applyOriginalV1FixturePlan({
        plan,
        query: failing.query,
        files: files.port,
        storageRoot: "/tmp/original-v1-fixtures",
      }),
    ).rejects.toThrow(/insert failed/);
    expect(failing.calls.some((sql) => sql === "ROLLBACK")).toBe(true);
    expect(files.created()).toBe(0);
  });

  it("writes a placeholder exclusively and refuses a different file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "original-v1-fixtures-"));
    tempDirs.push(root);
    const port = createLocalFixtureFilePort();
    const statement = plan.statements[0];
    const absolute = originalV1FixtureStatementPath(root, statement.storageKey);
    await port.createExclusive(absolute, plan.placeholderPdf);
    await expect(port.createExclusive(absolute, plan.placeholderPdf)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await port.inspect(absolute, plan.placeholderChecksum)).toBe("matching");
    expect(await port.inspect(absolute, "a".repeat(64))).toBe("different");
    expect(() => originalV1FixtureStatementPath(root, "private/statements/../../secret.pdf")).toThrow(
      /escaped the local statement directory/,
    );
  });
});

describe("original v1 fixture entry points", () => {
  it("keeps the default seed command free of the fixture flag", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const seed = readFileSync("prisma/seed.ts", "utf8");
    expect(pkg.scripts["db:seed"]).toBe("npx tsx prisma/seed.ts");
    expect(pkg.scripts["fixtures:original-v1"]).toBe("npx tsx prisma/seed.ts --original-v1-fixtures");
    expect(seed).toContain('process.argv.includes("--original-v1-fixtures")');
    expect(seed).toContain("Demo Community Church");
  });
});
