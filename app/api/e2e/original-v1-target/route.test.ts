import { afterEach, describe, expect, it } from "vitest";

import { originalV1TargetFingerprint } from "@/lib/testing/original-v1-target-token";

import { GET } from "./route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("original v1 target probe", () => {
  it("returns 404 when the acceptance flag is not set", async () => {
    delete process.env.BITS_E2E_ACCEPTANCE;
    process.env.BITS_E2E_TARGET_TOKEN = "isolated-target-token";
    process.env.DATABASE_URL = "postgresql://localhost/bits_e2e";
    const response = await GET(
      new Request("http://localhost/api/e2e/original-v1-target", {
        headers: { authorization: "Bearer isolated-target-token" },
      }),
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 in a production runtime even when the flag is set", async () => {
    process.env.BITS_E2E_ACCEPTANCE = "1";
    process.env.BITS_E2E_TARGET_TOKEN = "isolated-target-token";
    process.env.DATABASE_URL = "postgresql://localhost/bits_e2e";
    Object.assign(process.env, { NODE_ENV: "production" });
    const response = await GET(
      new Request("http://localhost/api/e2e/original-v1-target", {
        headers: { authorization: "Bearer isolated-target-token" },
      }),
    );
    expect(response.status).toBe(404);
  });

  it("returns 403 for the wrong token and 200 with a matching fingerprint", async () => {
    process.env.BITS_E2E_ACCEPTANCE = "1";
    process.env.BITS_E2E_TARGET_TOKEN = "isolated-target-token";
    process.env.DATABASE_URL = "postgresql://localhost/bits_e2e";

    const denied = await GET(
      new Request("http://localhost/api/e2e/original-v1-target", {
        headers: { authorization: "Bearer other-token-value" },
      }),
    );
    expect(denied.status).toBe(403);

    const allowed = await GET(
      new Request("http://localhost/api/e2e/original-v1-target", {
        headers: { authorization: "Bearer isolated-target-token" },
      }),
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(allowed.json()).resolves.toEqual({
      ok: true,
      fingerprint: originalV1TargetFingerprint(
        "isolated-target-token",
        "postgresql://localhost/bits_e2e",
      ),
    });
  });
});
