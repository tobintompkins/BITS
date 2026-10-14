import { describe, expect, it } from "vitest";

import {
  OriginalV1AcceptanceConfigError,
  parseOriginalV1AcceptanceConfig,
} from "./original-v1-acceptance-config";
import { originalV1TargetFingerprint } from "./original-v1-target-token";

const validEnv = {
  BITS_E2E_ACCEPTANCE: "1",
  BITS_E2E_TARGET_TOKEN: "isolated-target-token",
  BITS_E2E_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/bits_e2e",
  BITS_E2E_APP_DATABASE_URL:
    "postgresql://postgres:postgres@localhost:5432/bits_e2e",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/bits",
  CLERK_SECRET_KEY: "sk_test_clerk_secret",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_clerk_publishable",
  PLAYWRIGHT_BASE_URL: "http://localhost:3000",
  E2E_CLERK_ORG_A_ID: "org_church_a",
  E2E_CLERK_ORG_B_ID: "org_church_b",
  E2E_CLERK_ORG_ADMIN_EMAIL: "admin@example.test",
  E2E_CLERK_TREASURER_EMAIL: "treasurer@example.test",
  E2E_CLERK_DATA_ENTRY_EMAIL: "data-entry@example.test",
  E2E_CLERK_REPORT_VIEWER_EMAIL: "reports@example.test",
  E2E_CLERK_DONOR_A1_EMAIL: "donor-a1@example.test",
  E2E_CLERK_DONOR_A2_EMAIL: "donor-a2@example.test",
  E2E_CLERK_MULTI_ORG_EMAIL: "multi@example.test",
} satisfies Record<string, string>;

describe("parseOriginalV1AcceptanceConfig", () => {
  it("fails closed when the acceptance flag and required values are missing", () => {
    expect(() => parseOriginalV1AcceptanceConfig({})).toThrow(
      OriginalV1AcceptanceConfigError,
    );
    expect(() => parseOriginalV1AcceptanceConfig({})).toThrow(
      /blocked until isolated test-target configuration is complete/i,
    );
  });

  it("rejects a short target token", () => {
    expect(() =>
      parseOriginalV1AcceptanceConfig({
        ...validEnv,
        BITS_E2E_TARGET_TOKEN: "short",
      }),
    ).toThrow(/BITS_E2E_TARGET_TOKEN/);
  });

  it("never falls back to DATABASE_URL for fixtures", () => {
    expect(() =>
      parseOriginalV1AcceptanceConfig({
        ...validEnv,
        BITS_E2E_DATABASE_URL: validEnv.DATABASE_URL,
        BITS_E2E_APP_DATABASE_URL: validEnv.DATABASE_URL,
      }),
    ).toThrow(/must not target the same PostgreSQL database/);
  });

  it("rejects the working database when only the login username differs", () => {
    expect(() =>
      parseOriginalV1AcceptanceConfig({
        ...validEnv,
        DATABASE_URL: "postgresql://app:secret@localhost:5432/bits_e2e",
        BITS_E2E_DATABASE_URL:
          "postgresql://tester:other@127.0.0.1:5432/bits_e2e",
        BITS_E2E_APP_DATABASE_URL:
          "postgresql://tester:other@127.0.0.1:5432/bits_e2e",
      }),
    ).toThrow(/must not target the same PostgreSQL database/);
  });

  it("rejects localhost and 127.0.0.1 aliases of the working database", () => {
    expect(() =>
      parseOriginalV1AcceptanceConfig({
        ...validEnv,
        BITS_E2E_DATABASE_URL:
          "postgresql://postgres:postgres@127.0.0.1:5432/bits",
        BITS_E2E_APP_DATABASE_URL:
          "postgresql://postgres:postgres@127.0.0.1:5432/bits",
      }),
    ).toThrow(/localhost\/127\.0\.0\.1 aliases/);
  });

  it("rejects a working-church database name even when the string differs", () => {
    expect(() =>
      parseOriginalV1AcceptanceConfig({
        ...validEnv,
        BITS_E2E_DATABASE_URL:
          "postgresql://postgres:postgres@localhost:5432/bits",
        BITS_E2E_APP_DATABASE_URL:
          "postgresql://postgres:postgres@localhost:5432/bits",
        DATABASE_URL: "postgresql://other:pass@db.example.test:5432/prod",
      }),
    ).toThrow(/dedicated isolated database name/);
  });

  it("requires the declared app database URL to match the isolated fixture URL", () => {
    expect(() =>
      parseOriginalV1AcceptanceConfig({
        ...validEnv,
        BITS_E2E_APP_DATABASE_URL: validEnv.DATABASE_URL,
      }),
    ).toThrow(/same isolated database/);
  });

  it("accepts equivalent isolated aliases for the app and fixture URLs", () => {
    const parsed = parseOriginalV1AcceptanceConfig({
      ...validEnv,
      BITS_E2E_DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5432/bits_e2e",
      BITS_E2E_APP_DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1/bits_e2e?schema=public",
    });
    expect(parsed.e2eDatabaseUrl).toContain("bits_e2e");
  });

  it("rejects production Clerk keys and duplicate organizations or emails", () => {
    expect(() =>
      parseOriginalV1AcceptanceConfig({
        ...validEnv,
        CLERK_SECRET_KEY: "sk_live_not_allowed",
      }),
    ).toThrow(/sk_test_/);
    expect(() =>
      parseOriginalV1AcceptanceConfig({
        ...validEnv,
        E2E_CLERK_ORG_B_ID: validEnv.E2E_CLERK_ORG_A_ID,
      }),
    ).toThrow(/two different Clerk organizations/);
    expect(() =>
      parseOriginalV1AcceptanceConfig({
        ...validEnv,
        E2E_CLERK_TREASURER_EMAIL: validEnv.E2E_CLERK_ORG_ADMIN_EMAIL,
      }),
    ).toThrow(/distinct Clerk email identity/);
  });

  it("builds a fingerprint from the isolated URL, not DATABASE_URL", () => {
    const parsed = parseOriginalV1AcceptanceConfig(validEnv);
    expect(parsed.expectedFingerprint).toBe(
      originalV1TargetFingerprint(
        validEnv.BITS_E2E_TARGET_TOKEN,
        validEnv.BITS_E2E_DATABASE_URL,
      ),
    );
    expect(parsed.expectedFingerprint).not.toBe(
      originalV1TargetFingerprint(
        validEnv.BITS_E2E_TARGET_TOKEN,
        validEnv.DATABASE_URL,
      ),
    );
    expect(parsed.prefix).toBe("E2E07-local-");
    expect(parsed.emails.orgAdmin).toBe("admin@example.test");
  });
});
