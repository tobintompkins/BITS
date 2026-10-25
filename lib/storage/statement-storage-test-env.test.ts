import { describe, expect, it } from "vitest";

import { applyStatementStorageTestEnv } from "./statement-storage-test-env";

describe("statement storage test env loader", () => {
  it("overlays only TEST storage keys and cannot retarget the database or Clerk", () => {
    const env: Record<string, string | undefined> = {
      DATABASE_URL: "postgres://working/bits",
      CLERK_SECRET_KEY: "sk_test_preset",
    };
    applyStatementStorageTestEnv(
      env,
      {
        BITS_STATEMENT_S3_TEST_TARGET: "1",
        BITS_STATEMENT_S3_TEST_BUCKET: "bits-statements-test",
        DATABASE_URL: "postgres://isolated/bits_e2e",
        CLERK_SECRET_KEY: "sk_test_other",
        E2E_CLERK_ORG_A_ID: "org_should_not_apply",
      },
      new Set(["DATABASE_URL", "CLERK_SECRET_KEY"]),
    );
    expect(env.BITS_STATEMENT_S3_TEST_TARGET).toBe("1");
    expect(env.BITS_STATEMENT_S3_TEST_BUCKET).toBe("bits-statements-test");
    expect(env.DATABASE_URL).toBe("postgres://working/bits");
    expect(env.CLERK_SECRET_KEY).toBe("sk_test_preset");
    expect(env.E2E_CLERK_ORG_A_ID).toBeUndefined();
  });

  it("does not override an explicit TEST bucket already in the process", () => {
    const env: Record<string, string | undefined> = {
      BITS_STATEMENT_S3_TEST_BUCKET: "from-shell",
    };
    applyStatementStorageTestEnv(
      env,
      { BITS_STATEMENT_S3_TEST_BUCKET: "from-file" },
      new Set(["BITS_STATEMENT_S3_TEST_BUCKET"]),
    );
    expect(env.BITS_STATEMENT_S3_TEST_BUCKET).toBe("from-shell");
  });
});
