import { describe, expect, it } from "vitest";

import {
  classifyIsolatedDatabasePreflight,
  classifyIsolatedDatabaseRuntime,
  isolatedDatabaseRunEnabled,
  isolatedTestChildEnv,
  isIsolatedDatabaseReady,
  readWorkingDatabaseUrl,
} from "./isolated-database";

const working = "postgresql://app:secret@localhost:5432/bits?schema=public";
const isolated = "postgresql://tester:other@127.0.0.1:5432/bits_e2e";

describe("isolated database preflight", () => {
  it("rejects a missing isolated URL instead of falling back to the working database", () => {
    const result = classifyIsolatedDatabasePreflight({
      DATABASE_URL: working,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/never fall back/i);
  });

  it("rejects the same destination under a different username", () => {
    const result = classifyIsolatedDatabasePreflight({
      DATABASE_URL: "postgresql://app:secret@localhost:5432/bits_e2e",
      BITS_E2E_DATABASE_URL: "postgresql://tester:other@127.0.0.1:5432/bits_e2e",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/same PostgreSQL database/i);
  });

  it("rejects localhost aliases of the working database", () => {
    const result = classifyIsolatedDatabasePreflight({
      DATABASE_URL: working,
      BITS_E2E_DATABASE_URL: "postgresql://app:secret@127.0.0.1/bits",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects host query overrides that retarget the working database", () => {
    const result = classifyIsolatedDatabasePreflight({
      DATABASE_URL: working,
      BITS_E2E_DATABASE_URL:
        "postgresql://tester@db.example.test:5432/bits?host=127.0.0.1&port=5432",
    });
    expect(result.ok).toBe(false);
  });

  it("does not treat an e2e substring in the user as isolation evidence", () => {
    const result = classifyIsolatedDatabasePreflight({
      DATABASE_URL: working,
      BITS_E2E_DATABASE_URL: "postgresql://e2e_user@localhost:5432/bits",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/dedicated isolated database/i);
    }
  });

  it("accepts a dedicated isolated database and preserves the original working URL in the child env", () => {
    const result = classifyIsolatedDatabasePreflight({
      DATABASE_URL: working,
      BITS_E2E_DATABASE_URL: isolated,
    });
    expect(result).toMatchObject({
      ok: true,
      isolatedDatabase: "bits_e2e",
    });
    if (!result.ok) return;
    const child = isolatedTestChildEnv(result, "iso-test");
    expect(child.DATABASE_URL).toBe(isolated);
    expect(child.BITS_WORKING_DATABASE_URL).toBe(working);
    expect(child.BITS_E2E_DATABASE_URL).toBe(isolated);
    expect(child.BITS_ISOLATED_DATABASE).toBe("1");
    expect(child.BITS_ISOLATED_REQUIRE_DB).toBe("1");
    expect(readWorkingDatabaseUrl(child)).toBe(working);
    expect(isIsolatedDatabaseReady(child)).toBe(true);
    expect(isIsolatedDatabaseReady({ DATABASE_URL: working, BITS_E2E_DATABASE_URL: isolated })).toBe(
      false,
    );
  });

  it("still compares against the original working URL after DATABASE_URL is retargeted", () => {
    expect(
      classifyIsolatedDatabasePreflight({
        DATABASE_URL: isolated,
        BITS_WORKING_DATABASE_URL: working,
        BITS_E2E_DATABASE_URL: isolated,
      }),
    ).toMatchObject({ ok: true, isolatedDatabase: "bits_e2e" });
  });
});

describe("isolated database runtime", () => {
  const reproduction = {
    BITS_ISOLATED_DATABASE: "1",
    DATABASE_URL: "postgresql://test:fake@localhost/bits",
    BITS_WORKING_DATABASE_URL: "postgresql://test:fake@localhost/bits",
    BITS_E2E_DATABASE_URL: "postgresql://test:fake@localhost/bits_e2e",
  };

  it("rejects the reproduction where DATABASE_URL still targets working bits", () => {
    expect(isIsolatedDatabaseReady(reproduction)).toBe(false);
    const runtime = classifyIsolatedDatabaseRuntime(reproduction);
    expect(runtime.ok).toBe(false);
    if (!runtime.ok) {
      expect(runtime.reason).toMatch(/same PostgreSQL database as BITS_E2E_DATABASE_URL/i);
    }
  });

  it("rejects a marked child that did not preserve BITS_WORKING_DATABASE_URL", () => {
    const runtime = classifyIsolatedDatabaseRuntime({
      BITS_ISOLATED_DATABASE: "1",
      DATABASE_URL: isolated,
      BITS_E2E_DATABASE_URL: isolated,
    });
    expect(runtime.ok).toBe(false);
    if (!runtime.ok) {
      expect(runtime.reason).toMatch(/BITS_WORKING_DATABASE_URL must preserve/i);
    }
  });

  it("rejects a retargeted DATABASE_URL that still points at working bits after parent preflight", () => {
    const parent = classifyIsolatedDatabasePreflight({
      DATABASE_URL: working,
      BITS_E2E_DATABASE_URL: isolated,
    });
    expect(parent.ok).toBe(true);
    const runtime = classifyIsolatedDatabaseRuntime({
      BITS_ISOLATED_DATABASE: "1",
      DATABASE_URL: working,
      BITS_WORKING_DATABASE_URL: working,
      BITS_E2E_DATABASE_URL: isolated,
    });
    expect(runtime.ok).toBe(false);
  });

  it("accepts localhost aliases of the isolated destination in a marked child", () => {
    expect(
      classifyIsolatedDatabaseRuntime({
        BITS_ISOLATED_DATABASE: "1",
        DATABASE_URL: "postgresql://tester:other@localhost:5432/bits_e2e",
        BITS_WORKING_DATABASE_URL: working,
        BITS_E2E_DATABASE_URL: isolated,
      }),
    ).toMatchObject({ ok: true, isolatedDatabase: "bits_e2e" });
  });

  it("accepts driver host overrides of the isolated destination", () => {
    expect(
      classifyIsolatedDatabaseRuntime({
        BITS_ISOLATED_DATABASE: "1",
        DATABASE_URL:
          "postgresql://tester@db.example.test:5432/bits_e2e?host=127.0.0.1&port=5432",
        BITS_WORKING_DATABASE_URL: working,
        BITS_E2E_DATABASE_URL: isolated,
      }),
    ).toMatchObject({ ok: true, isolatedDatabase: "bits_e2e" });
  });

  it("rejects credential-only changes that still target the working database", () => {
    const runtime = classifyIsolatedDatabaseRuntime({
      BITS_ISOLATED_DATABASE: "1",
      DATABASE_URL: "postgresql://other:fake@127.0.0.1:5432/bits",
      BITS_WORKING_DATABASE_URL: working,
      BITS_E2E_DATABASE_URL: isolated,
    });
    expect(runtime.ok).toBe(false);
  });

  it("fails the isolated suite instead of skipping when required real-DB cases cannot run", () => {
    expect(() =>
      isolatedDatabaseRunEnabled({
        ...reproduction,
        BITS_ISOLATED_REQUIRE_DB: "1",
      }),
    ).toThrow(/same PostgreSQL database as BITS_E2E_DATABASE_URL/i);
  });
});
