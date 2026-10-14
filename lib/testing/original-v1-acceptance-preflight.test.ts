import { describe, expect, it, vi } from "vitest";

import {
  diagnoseOriginalV1AcceptanceEnv,
  probeOriginalV1AcceptanceTarget,
} from "./original-v1-acceptance-preflight";
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
  PLAYWRIGHT_BASE_URL: "http://localhost:3017",
  E2E_CLERK_ORG_A_ID: "org_church_a",
  E2E_CLERK_ORG_B_ID: "org_church_b",
  E2E_CLERK_ORG_ADMIN_EMAIL: "admin@example.test",
  E2E_CLERK_TREASURER_EMAIL: "treasurer@example.test",
  E2E_CLERK_DATA_ENTRY_EMAIL: "data-entry@example.test",
  E2E_CLERK_REPORT_VIEWER_EMAIL: "reports@example.test",
  E2E_CLERK_DONOR_A1_EMAIL: "donor-a1@example.test",
  E2E_CLERK_DONOR_A2_EMAIL: "donor-a2@example.test",
  E2E_CLERK_MULTI_ORG_EMAIL: "multi@example.test",
};

describe("original v1 acceptance preflight", () => {
  it("reports missing variable names without printing secrets", () => {
    const report = diagnoseOriginalV1AcceptanceEnv({
      DATABASE_URL: "postgresql://postgres:super-secret@localhost:5432/bits",
      CLERK_SECRET_KEY: "sk_live_should_not_appear_in_output",
    });
    expect(report.ok).toBe(false);
    expect(report.readyForFixtures).toBe(false);
    const names = report.issues.flatMap((issue) => issue.names ?? []);
    expect(names).toContain("BITS_E2E_ACCEPTANCE");
    expect(names).toContain("BITS_E2E_DATABASE_URL");
    expect(JSON.stringify(report)).not.toContain("super-secret");
    expect(JSON.stringify(report)).not.toContain("sk_live_should_not_appear_in_output");
  });

  it("rejects a working-database alias when only the login username differs", () => {
    const report = diagnoseOriginalV1AcceptanceEnv({
      ...validEnv,
      DATABASE_URL: "postgresql://app:secret@localhost:5432/bits_e2e",
      BITS_E2E_DATABASE_URL:
        "postgresql://tester:other@127.0.0.1:5432/bits_e2e",
      BITS_E2E_APP_DATABASE_URL:
        "postgresql://tester:other@127.0.0.1:5432/bits_e2e",
    });
    expect(report.issues.some((issue) => issue.code === "working_database_alias")).toBe(
      true,
    );
    expect(report.readyForFixtures).toBe(false);
  });

  it("rejects a working-database alias even when the strings differ", () => {
    const report = diagnoseOriginalV1AcceptanceEnv({
      ...validEnv,
      BITS_E2E_DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/bits",
      BITS_E2E_APP_DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/bits",
    });
    expect(report.issues.some((issue) => issue.code === "working_database_alias")).toBe(
      true,
    );
    expect(report.readyForFixtures).toBe(false);
  });

  it("accepts a dedicated isolated target when configuration is complete", () => {
    const report = diagnoseOriginalV1AcceptanceEnv(validEnv);
    expect(report.issues).toEqual([]);
    expect(report.readyForFixtures).toBe(true);
    expect(report.isolatedDatabase).toBe("bits_e2e");
    expect(report.isolatedHostKind).toBe("loopback");
    expect(report.readyForLiveAcceptance).toBe(false);
  });

  it("reports a server fingerprint mismatch without disclosing the URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        fingerprint: originalV1TargetFingerprint(
          "isolated-target-token",
          "postgresql://localhost/bits",
        ),
      }),
    });

    const issue = await probeOriginalV1AcceptanceTarget({
      baseUrl: "http://localhost:3017",
      targetToken: "isolated-target-token",
      e2eDatabaseUrl: validEnv.BITS_E2E_DATABASE_URL,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(issue?.code).toBe("server_database_mismatch");
    expect(JSON.stringify(issue)).not.toContain("postgresql://");
  });
});
