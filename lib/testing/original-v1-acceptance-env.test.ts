import { describe, expect, it } from "vitest";

import {
  applyOriginalV1LocalAcceptanceEnv,
  parseEnvFileContents,
} from "./original-v1-acceptance-env";

describe("original v1 local acceptance env overlay", () => {
  it("lets explicit process exports beat both .env and the local file", () => {
    const env: Record<string, string | undefined> = {
      PLAYWRIGHT_BASE_URL: "http://localhost:3000",
      BITS_E2E_DATABASE_URL: "postgresql://localhost/from-process",
    };
    applyOriginalV1LocalAcceptanceEnv(
      env,
      parseEnvFileContents(`
PLAYWRIGHT_BASE_URL=http://localhost:3017
BITS_E2E_DATABASE_URL=postgresql://localhost/from-local
BITS_E2E_ACCEPTANCE=1
`),
      new Set(["PLAYWRIGHT_BASE_URL", "BITS_E2E_DATABASE_URL"]),
    );

    expect(env.PLAYWRIGHT_BASE_URL).toBe("http://localhost:3000");
    expect(env.BITS_E2E_DATABASE_URL).toBe("postgresql://localhost/from-process");
    expect(env.BITS_E2E_ACCEPTANCE).toBe("1");
  });

  it("overlays isolated keys from the local file when they were not exported", () => {
    const env: Record<string, string | undefined> = {
      PLAYWRIGHT_BASE_URL: "http://localhost:3000",
    };
    applyOriginalV1LocalAcceptanceEnv(
      env,
      { PLAYWRIGHT_BASE_URL: "http://localhost:3017", BITS_E2E_ACCEPTANCE: "1" },
      new Set(),
    );
    expect(env.PLAYWRIGHT_BASE_URL).toBe("http://localhost:3017");
    expect(env.BITS_E2E_ACCEPTANCE).toBe("1");
  });
});
