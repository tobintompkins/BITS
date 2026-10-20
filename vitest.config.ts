import { defineConfig } from "vitest/config";
import path from "node:path";

import { ISOLATED_ONLY_TEST_GLOBS } from "./lib/testing/isolated-database";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.ts"],
    exclude: [
      "**/node_modules/**",
      "**/e2e/**",
      "**/.next/**",
      ...ISOLATED_ONLY_TEST_GLOBS,
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
