import { Client } from "pg";

import {
  executeOriginalV1DevelopmentFixtures,
  type OriginalV1FixtureQuery,
} from "@/lib/ops/original-v1-development-fixtures";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";

export async function runOriginalV1DevelopmentFixturesCli() {
  loadOriginalV1AcceptanceEnvFiles(process.cwd(), { quiet: true });
  const code = await executeOriginalV1DevelopmentFixtures({
    argv: process.argv,
    env: process.env,
    connect: async (connectionString) => {
      const client = new Client({ connectionString });
      await client.connect();
      return {
        query: (async (sql, params) => {
          const result = await client.query(sql, params ? [...params] : undefined);
          return { rows: result.rows as Array<Record<string, unknown>> };
        }) satisfies OriginalV1FixtureQuery,
        end: () => client.end(),
      };
    },
  });
  process.exit(code);
}

const invokedDirectly = (process.argv[1] ?? "").includes("original-v1-development-fixtures");
if (invokedDirectly) {
  void runOriginalV1DevelopmentFixturesCli();
}
