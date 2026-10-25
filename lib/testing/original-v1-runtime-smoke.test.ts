import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ORIGINAL_V1_NODE_ENGINE,
  PRISMA_GENERATE_UNUSED_DATABASE_URL,
  RAILPACK_NODE_PRECEDENCE,
  RUNTIME_SMOKE_RSYNC_EXCLUDES,
  assertSyntheticAcceptanceToken,
  buildRuntimeSmokeBuildEnv,
  buildRuntimeSmokeStartEnv,
  classifyClerkDevelopmentKeys,
  classifyProductionE2eHttp,
  classifyUnsignedStaffRedirect,
  classifyVisitHttp,
  describeRuntimeSmokeChildEnv,
  expectedProductionE2eStatus,
  inspectSmokeResponseBody,
  isolatedNextStartArgs,
  mergeClerkKeySources,
  redactRequestLocation,
  redactRuntimeSmokeText,
  rsyncExcludeWouldDropLibStorage,
  runtimeSmokeRsyncArgs,
  selectIsolatedSmokeDatabase,
  syntheticProductionAcceptanceToken,
} from "./original-v1-runtime-smoke";

const repoRoot = path.resolve(import.meta.dirname, "../..");

const developmentKeys = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_development_publishable_key",
  CLERK_SECRET_KEY: "sk_test_development_secret_key",
};

function childInput() {
  return {
    path: "/usr/bin",
    home: "/tmp",
    port: 3021,
    publishableKey: developmentKeys.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: developmentKeys.CLERK_SECRET_KEY,
    storageRoot: "/tmp/bits-runtime-smoke-storage",
  };
}

describe("original v1 runtime smoke classification", () => {
  it("pins a bounded Node 24 engines range that beats .nvmrc in Railpack order", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as { engines: { node: string } };
    const lockfile = JSON.parse(
      readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"),
    ) as { packages: { "": { engines: { node: string } } } };

    expect(packageJson.engines.node).toBe(ORIGINAL_V1_NODE_ENGINE);
    expect(lockfile.packages[""].engines.node).toBe(ORIGINAL_V1_NODE_ENGINE);
    expect(ORIGINAL_V1_NODE_ENGINE).toBe(">=24 <25");
    expect(RAILPACK_NODE_PRECEDENCE.indexOf("package.json engines.node")).toBeLessThan(
      RAILPACK_NODE_PRECEDENCE.indexOf(".nvmrc"),
    );
  });

  it("keeps the isolated copy exclude on root /storage/ so lib/storage remains", () => {
    expect(RUNTIME_SMOKE_RSYNC_EXCLUDES).toContain("/storage/");
    expect(RUNTIME_SMOKE_RSYNC_EXCLUDES).toContain(".tmp");
    expect(RUNTIME_SMOKE_RSYNC_EXCLUDES).not.toContain("storage");
    expect(rsyncExcludeWouldDropLibStorage()).toBe(false);
    expect(runtimeSmokeRsyncArgs("/repo", "/tmp/copy")).toEqual(
      expect.arrayContaining(["--exclude", "/storage/", "/repo/", "/tmp/copy/"]),
    );
  });

  it("accepts Development Clerk prefixes and rejects live or placeholder keys", () => {
    expect(classifyClerkDevelopmentKeys(developmentKeys)).toEqual({
      ok: true,
      publishablePrefix: "pk_test_",
      secretPrefix: "sk_test_",
    });
    expect(
      classifyClerkDevelopmentKeys({
        ...developmentKeys,
        CLERK_SECRET_KEY: "sk_live_should_never_be_used",
      }).ok,
    ).toBe(false);
    expect(
      classifyClerkDevelopmentKeys({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        CLERK_SECRET_KEY: "sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      }).ok,
    ).toBe(false);
    expect(classifyClerkDevelopmentKeys({}).ok).toBe(false);
  });

  it("lets process Clerk keys beat working env files without exposing values", () => {
    const merged = mergeClerkKeySources({
      processEnv: {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_from_process_value",
      },
      workingEnvFile: {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_from_env_file_secret",
        CLERK_SECRET_KEY: "sk_test_from_env_file_secret",
      },
    });
    expect(merged.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe(
      "pk_test_from_process_value",
    );
    expect(merged.CLERK_SECRET_KEY).toBe("sk_test_from_env_file_secret");
    expect(
      JSON.stringify(classifyClerkDevelopmentKeys(merged)),
    ).not.toContain("from_env_file_secret");
  });

  it("omits a database by default and rejects a working-database alias", () => {
    expect(selectIsolatedSmokeDatabase({}).kind).toBe("omit");
    expect(
      selectIsolatedSmokeDatabase({
        DATABASE_URL: "postgresql://app:secret@localhost:5432/bits",
        BITS_E2E_DATABASE_URL: "postgresql://tester@127.0.0.1:5432/bits",
      }).kind,
    ).toBe("blocked");
    const isolated = selectIsolatedSmokeDatabase({
      DATABASE_URL: "postgresql://app:secret@localhost:5432/bits",
      BITS_E2E_DATABASE_URL: "postgresql://tester@127.0.0.1:5432/bits_e2e",
    });
    expect(isolated).toMatchObject({ kind: "isolated", database: "bits_e2e" });
  });

  it("builds a child env without working DB, Stripe, or invitations live flags", () => {
    const buildEnv = buildRuntimeSmokeBuildEnv(childInput());
    const startEnv = buildRuntimeSmokeStartEnv(childInput());
    const described = describeRuntimeSmokeChildEnv(startEnv);

    expect(buildEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).toBe(
      developmentKeys.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    );
    expect(buildEnv.DATABASE_URL).toBe(PRISMA_GENERATE_UNUSED_DATABASE_URL);
    expect(startEnv.DATABASE_URL).toBeUndefined();
    expect(startEnv.STRIPE_SECRET_KEY).toBeUndefined();
    expect(startEnv.DIRECT_URL).toBeUndefined();
    expect(startEnv.BITS_STAFF_INVITATION_ALLOW_LIVE).toBeUndefined();
    expect(described.hasStripe).toBe(false);
    expect(described.acceptanceFlag).toBe(false);
    expect(described.nodeEnv).toBe("production");
    expect(isolatedNextStartArgs(3021)).toEqual(["start", "-p", "3021"]);
  });

  it("expects production e2e 404 even when the acceptance flag and token are set", () => {
    expect(expectedProductionE2eStatus()).toBe(404);
    expect(
      assertSyntheticAcceptanceToken(syntheticProductionAcceptanceToken()),
    ).toBe(true);
    expect(
      classifyProductionE2eHttp({
        path: "/api/e2e/original-v1-target",
        status: 404,
        location: null,
        bodyHasFingerprint: false,
        bodyLooksPrivate: false,
        safeBodyHint: null,
      }).ok,
    ).toBe(true);
    expect(
      classifyProductionE2eHttp({
        path: "/api/e2e/original-v1-target",
        status: 200,
        location: null,
        ...inspectSmokeResponseBody(
          JSON.stringify({ ok: true, fingerprint: "should-not-appear" }),
        ),
      }).ok,
    ).toBe(false);
  });

  it("treats /visit 500 and unsigned /batches 200 as failures", () => {
    expect(
      classifyVisitHttp({
        path: "/visit",
        status: 500,
        location: null,
        bodyHasFingerprint: false,
        bodyLooksPrivate: false,
        safeBodyHint: null,
      }).ok,
    ).toBe(false);
    expect(
      classifyVisitHttp({
        path: "/visit",
        status: 200,
        location: null,
        bodyHasFingerprint: false,
        bodyLooksPrivate: false,
        safeBodyHint: null,
      }).ok,
    ).toBe(true);
    expect(
      classifyUnsignedStaffRedirect({
        path: "/batches",
        status: 307,
        location: "/sign-in",
        bodyHasFingerprint: false,
        bodyLooksPrivate: false,
        safeBodyHint: null,
      }).ok,
    ).toBe(true);
    expect(
      classifyUnsignedStaffRedirect({
        path: "/batches",
        status: 200,
        location: null,
        bodyHasFingerprint: false,
        bodyLooksPrivate: false,
        safeBodyHint: null,
      }).ok,
    ).toBe(false);
  });

  it("redacts locations and log text so secrets never appear in reports", () => {
    expect(
      redactRequestLocation(
        "/sign-in?redirect_url=http://127.0.0.1:3021/batches&__clerk_status=token",
      ),
    ).toBe("/sign-in");
    expect(
      redactRuntimeSmokeText(
        "CLERK_SECRET_KEY=sk_test_development_secret_key postgresql://app:secret@localhost/bits",
      ),
    ).not.toMatch(/development_secret_key|secret@localhost/);
  });
});
