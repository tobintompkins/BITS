import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clerkSharedStopMessage,
  missingClerkSharedKeys,
} from "./shared-variables.ts";

const railwayDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(railwayDir);
const railwayBin = join(repoRoot, "node_modules", "@railway", "cli", "bin", "railway");
const configFile = join(railwayDir, "railway.ts");
const evaluator = join(railwayDir, "cli-eval.mjs");
const receipt = join(railwayDir, ".shared-check.json");

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): void {
  if (!condition) fail(message);
}

const version = execFileSync(railwayBin, ["--version"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
assert(version === "railway 5.71.0", `Expected railway 5.71.0, got ${version}`);

function evaluate(context: Record<string, string>): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--disable-warning=ExperimentalWarning",
        evaluator,
        configFile,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          RAILWAY_IAC_CONTEXT: JSON.stringify(context),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
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

const loaded = evaluate({
  command: "check",
  projectName: "bits-test",
  environment: "test",
});
if (loaded.code !== 0) {
  fail(`CLI evaluator failed to load .railway/railway.ts.\n${loaded.stderr}`);
}
const graph = JSON.parse(loaded.stdout).project;
const service = graph.resources.find((resource: { type: string }) => resource.type === "service");
const database = graph.resources.find((resource: { type: string }) => resource.type === "database");
assert(graph.name === "bits-test", "Project name was not bits-test.");
assert(graph.variables?.ignore?.includes("bits/APP_BASE_URL"), "APP_BASE_URL is not ignored.");
assert(service?.deploy?.startCommand === "npm start", "Start command changed.");
assert(service?.deploy?.healthcheckPath === "/visit", "Health check changed.");
assert(service?.deploy?.preDeployCommand == null, "A migration command was added.");
assert(service?.source == null, "A repository source was declared.");
assert(service?.variables?.APP_BASE_URL == null, "APP_BASE_URL was sent in the service variables.");
assert(service?.variables?.DATABASE_URL?.type === "reference", "DATABASE_URL is not a database reference.");
assert(
  service?.variables?.CLERK_SECRET_KEY?.type === "sharedReference",
  "Clerk secret is not a shared reference.",
);
assert(database?.name === "bits-test-db", "Database name changed.");
assert(!existsSync(receipt), "A shared-variable receipt exists before the remote check.");

const blocked = evaluate({
  command: "plan",
  projectName: "bits-test",
  environment: "test",
});
assert(blocked.code !== 0, "Plan proceeded without a shared-variable receipt.");
assert(
  blocked.stderr.includes("npm run railway:shared-check"),
  "The plan stop message did not name the shared-variable check.",
);

const empty = missingClerkSharedKeys({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: { value: "   " },
  CLERK_SECRET_KEY: { value: "" },
});
assert(
  empty.join(",") === "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY",
  "Empty Clerk values were accepted.",
);
const absent = missingClerkSharedKeys({});
assert(absent.length === 2, "Absent Clerk values were accepted.");
const present = missingClerkSharedKeys({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: { value: "pk_test_present" },
  CLERK_SECRET_KEY: { isSealed: true },
});
assert(present.length === 0, "Present Clerk values were rejected.");
assert(
  clerkSharedStopMessage(absent).includes("missing or empty"),
  "The stop message is unclear.",
);

process.stdout.write(
  "Railway CLI 5.71.0 loaded .railway/railway.ts. APP_BASE_URL is ignored. A plan without verified Clerk shared values stops.\n",
);
