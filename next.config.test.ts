import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname);

describe("next.config workspace root", () => {
  it("pins tracing and turbopack roots to this app so a nested isolated copy is not the parent lockfile", () => {
    const source = readFileSync(path.join(repoRoot, "next.config.ts"), "utf8");
    expect(source).toContain("outputFileTracingRoot: appRoot");
    expect(source).toContain("turbopack:");
    expect(source).toContain("root: appRoot");
    expect(source).toContain("import.meta.dirname");
  });
});
