import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname);

describe("Next 16 Clerk proxy convention", () => {
  it("keeps clerkMiddleware in proxy.ts and does not leave middleware.ts", () => {
    const proxy = readFileSync(path.join(repoRoot, "proxy.ts"), "utf8");
    expect(existsSync(path.join(repoRoot, "middleware.ts"))).toBe(false);
    expect(proxy).toContain("clerkMiddleware");
    expect(proxy).toContain('"/batches(.*)"');
    expect(proxy).toContain("/(api|trpc)(.*)");
    expect(proxy).toContain("/__clerk/(.*)");
  });
});
