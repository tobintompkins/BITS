import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_CLERK_SHARED_KEYS,
  clerkSharedStopMessage,
  missingClerkSharedKeys,
  type SharedVariableEntry,
} from "./shared-variables.ts";

const railwayDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(railwayDir);
const railwayBin = join(repoRoot, "node_modules", "@railway", "cli", "bin", "railway");
const receiptPath = join(railwayDir, ".shared-check.json");

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function runRailway(args: string[]): CommandResult {
  try {
    const stdout = execFileSync(railwayBin, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: failed.status ?? 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}

function safeFailure(result: CommandResult): string {
  const text = result.stderr.trim();
  if (
    text.length > 0 &&
    text.length < 500 &&
    !/sk_|pk_|postgres:\/\/|secret|password/i.test(text)
  ) {
    return text;
  }
  return `Railway CLI exited ${result.code}.`;
}

function readTarget(status: unknown): { project: string; environment: string } | null {
  if (status == null || typeof status !== "object") return null;
  const project = status as {
    name?: string;
    environments?: { edges?: Array<{ node?: { name?: string } }> };
  };
  const environment = project.environments?.edges?.find(
    (edge) => edge.node?.name === "test",
  )?.node?.name;
  if (project.name !== "bits-test" || environment !== "test") return null;
  return { project: project.name, environment };
}

function readSharedVariables(
  config: unknown,
): Record<string, SharedVariableEntry> | undefined {
  if (config == null || typeof config !== "object") return undefined;
  const shared = (config as { sharedVariables?: unknown }).sharedVariables;
  if (shared == null || typeof shared !== "object") return undefined;
  return shared as Record<string, SharedVariableEntry>;
}

function main(): void {
  const status = runRailway(["status", "--environment", "test", "--json"]);
  if (status.code !== 0) {
    throw new Error(
      `Cannot check Clerk shared variables. Project bits-test and environment test must exist and be linked first. ${safeFailure(status)}`,
    );
  }
  const target = readTarget(JSON.parse(status.stdout));
  if (target == null) {
    throw new Error(
      "Cannot check Clerk shared variables. The linked Railway target is not project bits-test, environment test. No variable values were printed.",
    );
  }

  const config = runRailway([
    "environment",
    "config",
    "--environment",
    "test",
    "--json",
  ]);
  if (config.code !== 0) {
    throw new Error(
      `Cannot read the test environment's shared variables. ${safeFailure(config)}`,
    );
  }
  const missing = missingClerkSharedKeys(readSharedVariables(JSON.parse(config.stdout)));
  if (missing.length > 0) {
    throw new Error(clerkSharedStopMessage(missing));
  }

  writeFileSync(
    receiptPath,
    `${JSON.stringify(
      {
        project: "bits-test",
        environment: "test",
        keys: [...REQUIRED_CLERK_SHARED_KEYS],
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(
    "Clerk shared variables are present on bits-test / test. Values were not printed.\n",
  );
}

main();
