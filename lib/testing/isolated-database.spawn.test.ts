import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isolatedPrismaBlockedMessage } from "./isolated-database";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function spawnPrismaImport(env: Record<string, string | undefined>) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      'import("@/lib/db/prisma").then(({ prisma }) => { prisma.member; console.log("CLIENT_CREATED"); }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(2); })',
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ...env,
      },
    },
  );
}

describe("isolated database spawn guards", () => {
  it("blocks Prisma construction in Vitest without the isolated marker", () => {
    const result = spawnPrismaImport({
      VITEST: "true",
      BITS_ISOLATED_DATABASE: undefined,
      DATABASE_URL: "postgresql://app@localhost:5432/bits",
    });
    expect(result.status).toBe(2);
    expect(result.stdout).not.toMatch(/CLIENT_CREATED/);
    expect(result.stderr).toContain(isolatedPrismaBlockedMessage());
  });

  it("keeps the isolated destination after a late dotenv reload", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env.ts";
import { parsePostgresTargetIdentity } from "@/lib/testing/original-v1-database-url.ts";
process.env.BITS_ISOLATED_DATABASE = "1";
process.env.DATABASE_URL = "postgresql://tester@127.0.0.1:5432/bits_e2e";
process.env.BITS_E2E_DATABASE_URL = process.env.DATABASE_URL;
process.env.BITS_WORKING_DATABASE_URL = "postgresql://app@localhost:5432/bits";
loadOriginalV1AcceptanceEnvFiles();
console.log(parsePostgresTargetIdentity(process.env.DATABASE_URL)?.database);
console.log(parsePostgresTargetIdentity(process.env.BITS_WORKING_DATABASE_URL)?.database);`,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          BITS_ISOLATED_DATABASE: "1",
          DATABASE_URL: "postgresql://tester@127.0.0.1:5432/bits_e2e",
          BITS_E2E_DATABASE_URL: "postgresql://tester@127.0.0.1:5432/bits_e2e",
          BITS_WORKING_DATABASE_URL: "postgresql://app@localhost:5432/bits",
        },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/bits_e2e\nbits\n/);
  });

  it("blocks Prisma construction when the isolated flag is set but DATABASE_URL still targets bits", () => {
    const result = spawnPrismaImport({
      VITEST: "true",
      BITS_ISOLATED_DATABASE: "1",
      DATABASE_URL: "postgresql://test:fake@localhost/bits",
      BITS_WORKING_DATABASE_URL: "postgresql://test:fake@localhost/bits",
      BITS_E2E_DATABASE_URL: "postgresql://test:fake@localhost/bits_e2e",
    });
    expect(result.status).toBe(2);
    expect(result.stdout).not.toMatch(/CLIENT_CREATED/);
    expect(result.stderr).toMatch(/same PostgreSQL database as BITS_E2E_DATABASE_URL/i);
  });

  it("fails direct isolated-config invocation before constructing a client", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        `import { isolatedDatabaseRunEnabled } from "@/lib/testing/isolated-database.ts";
process.env.BITS_ISOLATED_REQUIRE_DB = "1";
isolatedDatabaseRunEnabled({
  BITS_ISOLATED_REQUIRE_DB: "1",
  DATABASE_URL: "postgresql://test:fake@localhost/bits",
  BITS_E2E_DATABASE_URL: "postgresql://test:fake@localhost/bits_e2e",
});`,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          BITS_ISOLATED_REQUIRE_DB: "1",
          DATABASE_URL: "postgresql://test:fake@localhost/bits",
          BITS_E2E_DATABASE_URL: "postgresql://test:fake@localhost/bits_e2e",
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(
      /blocked during unit tests|BITS_WORKING_DATABASE_URL must preserve|same PostgreSQL database/i,
    );
  });

  it("does not construct a client when the isolated URL is the working database", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        'import { classifyIsolatedDatabasePreflight } from "@/lib/testing/isolated-database.ts"; const plan = classifyIsolatedDatabasePreflight({ DATABASE_URL: process.env.DATABASE_URL, BITS_E2E_DATABASE_URL: process.env.BITS_E2E_DATABASE_URL }); if (plan.ok) { console.log("PREFLIGHT_OK"); process.exit(0); } console.error(plan.reason); process.exit(2);',
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://app@localhost:5432/bits",
          BITS_E2E_DATABASE_URL: "postgresql://other@127.0.0.1:5432/bits",
        },
      },
    );
    expect(result.status).toBe(2);
    expect(result.stdout).not.toMatch(/PREFLIGHT_OK/);
    expect(result.stderr).toMatch(/same PostgreSQL database|dedicated isolated database/i);
  });
});
