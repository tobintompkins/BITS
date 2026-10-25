import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildRuntimeSmokeBuildEnv,
  buildRuntimeSmokeStartEnv,
  classifyClerkDevelopmentKeys,
  classifyProductionE2eHttp,
  classifyUnsignedStaffRedirect,
  classifyVisitHttp,
  inspectSmokeResponseBody,
  isolatedNextStartArgs,
  mergeClerkKeySources,
  parseWorkingEnvFileContents,
  redactRequestLocation,
  redactRuntimeSmokeText,
  runtimeSmokeRsyncArgs,
  selectIsolatedSmokeDatabase,
  syntheticProductionAcceptanceToken,
  type RuntimeSmokeHttpCheck,
} from "../lib/testing/original-v1-runtime-smoke";

const repoRoot = path.resolve(import.meta.dirname, "..");
const START_PORT = 3021;
const START_WAIT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 10 * 60_000;

type SafeHttpResult = RuntimeSmokeHttpCheck & { ok: boolean; reason: string };

function fail(message: string): never {
  throw new Error(redactRuntimeSmokeText(message));
}

function readWorkingEnvFile(relativePath: string) {
  const absolute = path.join(repoRoot, relativePath);
  if (!existsSync(absolute)) return undefined;
  return parseWorkingEnvFileContents(readFileSync(absolute, "utf8"));
}

function loadDevelopmentKeys() {
  return mergeClerkKeySources({
    processEnv: process.env,
    workingEnvFile: readWorkingEnvFile(".env"),
    workingLocalEnvFile: readWorkingEnvFile(".env.local"),
  });
}

function loadDatabaseSources() {
  const workingEnv = readWorkingEnvFile(".env") ?? {};
  const localEnv = readWorkingEnvFile(".env.local") ?? {};
  return {
    BITS_E2E_DATABASE_URL:
      process.env.BITS_E2E_DATABASE_URL?.trim() ||
      localEnv.BITS_E2E_DATABASE_URL?.trim() ||
      workingEnv.BITS_E2E_DATABASE_URL?.trim() ||
      "",
    DATABASE_URL:
      process.env.BITS_WORKING_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      localEnv.DATABASE_URL?.trim() ||
      workingEnv.DATABASE_URL?.trim() ||
      "",
  };
}

function inheritedHostEnv() {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
    ...(process.env.LANG ? { LANG: process.env.LANG } : {}),
    ...(process.env.TERM ? { TERM: process.env.TERM } : {}),
  };
}

function portAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function choosePort(start: number) {
  for (let port = start; port < start + 20; port += 1) {
    if (await portAvailable(port)) return port;
  }
  fail("No loopback port is available for isolated runtime smoke.");
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>,
) {
  const result = spawn(command, args, {
    cwd,
    env: env as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  result.stdout?.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  result.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        result.kill("SIGKILL");
        reject(new Error(`${command} timed out`));
      }, COMMAND_TIMEOUT_MS);
      result.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      result.on("close", (status) => {
        clearTimeout(timer);
        resolve({
          status,
          stdout: redactRuntimeSmokeText(stdout),
          stderr: redactRuntimeSmokeText(stderr),
        });
      });
    },
  );
}

function copyWorkingTree(dest: string) {
  return runCommand("rsync", runtimeSmokeRsyncArgs(repoRoot, dest), repoRoot, {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
  });
}

async function requestSmokePath(
  baseUrl: string,
  requestPath: string,
  headers: Record<string, string> = {},
): Promise<RuntimeSmokeHttpCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${requestPath}`, {
      redirect: "manual",
      headers,
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      path: requestPath,
      status: response.status,
      location: redactRequestLocation(response.headers.get("location")),
      ...inspectSmokeResponseBody(body),
    };
  } finally {
    clearTimeout(timer);
  }
}

function tcpOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.setTimeout(400);
    socket.on("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForServer(
  child: ChildProcess,
  baseUrl: string,
  port: number,
  output: { text: string },
) {
  const deadline = Date.now() + START_WAIT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      fail(
        `Isolated next start exited before Ready (${child.exitCode}). ${output.text.slice(-1200)}`,
      );
    }
    if (await tcpOpen(port)) {
      try {
        const probe = await requestSmokePath(baseUrl, "/visit");
        if (probe.status > 0) return { firstVisit: probe };
      } catch {
        // First request may still be warming.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  fail(
    `Isolated next start did not accept HTTP within ${START_WAIT_MS}ms. ${output.text.slice(-1200)}`,
  );
}

function stopChild(child: ChildProcess | undefined) {
  if (!child || child.exitCode != null) return;
  child.kill("SIGTERM");
  setTimeout(() => {
    if (child.exitCode == null) child.kill("SIGKILL");
  }, 3_000).unref();
}

function attachOutput(child: ChildProcess, output: { text: string }) {
  child.stdout?.on("data", (chunk) => {
    output.text += redactRuntimeSmokeText(chunk.toString());
  });
  child.stderr?.on("data", (chunk) => {
    output.text += redactRuntimeSmokeText(chunk.toString());
  });
}

async function startIsolatedNext(
  cwd: string,
  env: Record<string, string | undefined>,
  output: { text: string },
) {
  const child = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", ...isolatedNextStartArgs(Number(env.PORT))],
    {
      cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  attachOutput(child, output);
  return child;
}

async function main() {
  const keys = loadDevelopmentKeys();
  const clerk = classifyClerkDevelopmentKeys(keys);
  if (!clerk.ok) fail(clerk.reason);

  const database = selectIsolatedSmokeDatabase(loadDatabaseSources());
  if (database.kind === "blocked") fail(database.reason);

  const isolatedRoot = mkdtempSync(path.join(tmpdir(), "bits-runtime-smoke-"));
  const storageRoot = mkdtempSync(
    path.join(tmpdir(), "bits-runtime-smoke-storage-"),
  );
  let flagOffChild: ChildProcess | undefined;
  let flagOnChild: ChildProcess | undefined;

  try {
    process.stdout.write(`copying working tree to ${isolatedRoot}\n`);
    const copied = await copyWorkingTree(isolatedRoot);
    if (copied.status !== 0) {
      fail(`Isolated copy failed.\n${copied.stderr}`);
    }

    const port = await choosePort(START_PORT);
    const baseUrl = `http://127.0.0.1:${port}`;
    const host = inheritedHostEnv();
    const childInput = {
      path: host.PATH,
      home: host.HOME,
      tmpdir: host.TMPDIR,
      lang: host.LANG,
      port,
      publishableKey: keys.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: keys.CLERK_SECRET_KEY,
      storageRoot,
    };

    process.stdout.write("isolated npm ci --ignore-scripts\n");
    const installed = await runCommand(
      "npm",
      ["ci", "--ignore-scripts"],
      isolatedRoot,
      host,
    );
    if (installed.status !== 0) {
      fail(`Isolated npm ci failed.\n${installed.stderr}`);
    }

    process.stdout.write("isolated npm run build\n");
    const built = await runCommand("npm", ["run", "build"], isolatedRoot, {
      ...host,
      ...buildRuntimeSmokeBuildEnv(childInput),
    });
    if (built.status !== 0) {
      fail(`Isolated production build failed.\n${built.stderr.slice(-1200)}`);
    }

    const startEnv = buildRuntimeSmokeStartEnv(childInput);
    process.stdout.write(`isolated next start on ${baseUrl}\n`);
    const flagOffOutput = { text: "" };
    flagOffChild = await startIsolatedNext(
      isolatedRoot,
      { ...host, ...startEnv },
      flagOffOutput,
    );
    const started = await waitForServer(
      flagOffChild,
      baseUrl,
      port,
      flagOffOutput,
    );

    const visit = classifyVisitHttp(started.firstVisit);
    const e2eOffCheck = await requestSmokePath(
      baseUrl,
      "/api/e2e/original-v1-target",
    );
    const e2eOff = classifyProductionE2eHttp(e2eOffCheck);
    const batchesCheck = await requestSmokePath(baseUrl, "/batches");
    const batches = classifyUnsignedStaffRedirect(batchesCheck);
    await new Promise((resolve) => setTimeout(resolve, 400));

    stopChild(flagOffChild);
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const flagOnEnv = buildRuntimeSmokeStartEnv({
      ...childInput,
      databaseUrl:
        database.kind === "isolated" ? database.isolatedUrl : undefined,
      acceptance: { token: syntheticProductionAcceptanceToken() },
    });
    const flagOnOutput = { text: "" };
    flagOnChild = await startIsolatedNext(
      isolatedRoot,
      { ...host, ...flagOnEnv },
      flagOnOutput,
    );
    await waitForServer(flagOnChild, baseUrl, port, flagOnOutput);
    const e2eOnCheck = await requestSmokePath(
      baseUrl,
      "/api/e2e/original-v1-target",
      {
        authorization: `Bearer ${syntheticProductionAcceptanceToken()}`,
      },
    );
    const e2eOn = classifyProductionE2eHttp(e2eOnCheck);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const results: SafeHttpResult[] = [
      { ...started.firstVisit, ...visit },
      { ...e2eOffCheck, ...e2eOff },
      { ...batchesCheck, ...batches },
      { ...e2eOnCheck, ...e2eOn },
    ];

    const report = {
      runtime: process.version,
      isolatedCopy: isolatedRoot,
      nodeEngine: ">=24 <25",
      database: database.kind === "isolated" ? database.database : database.kind,
      http: results.map((row) => ({
        path: row.path,
        status: row.status,
        location: row.location,
        ok: row.ok,
        reason: row.reason,
        safeBodyHint: row.safeBodyHint,
      })),
      serverOutputTail: redactRuntimeSmokeText(
        `${flagOffOutput.text}\n${flagOnOutput.text}`,
      ).slice(-2000),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (results.some((row) => !row.ok)) {
      fail("Isolated production-mode HTTP smoke failed.");
    }
  } finally {
    stopChild(flagOffChild);
    stopChild(flagOnChild);
    rmSync(isolatedRoot, { recursive: true, force: true });
    rmSync(storageRoot, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${redactRuntimeSmokeText(error instanceof Error ? error.message : "Isolated runtime smoke failed.")}\n`,
  );
  process.exit(2);
});
