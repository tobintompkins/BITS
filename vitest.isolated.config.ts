import path from "node:path";
import { defineConfig } from "vitest/config";

import { ISOLATED_DATABASE_TEST_GLOBS } from "./lib/testing/isolated-database";

export default defineConfig({
  test: {
    environment: "node",
    include: [...ISOLATED_DATABASE_TEST_GLOBS],
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**"],
    fileParallelism: false,
    maxWorkers: 1,
    env: {
      BITS_ISOLATED_REQUIRE_DB: "1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
