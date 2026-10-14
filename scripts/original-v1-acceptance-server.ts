import { spawn } from "node:child_process";
import { createServer } from "node:net";

import { loadOriginalV1AcceptanceEnvFiles } from "../lib/testing/original-v1-acceptance-env";
import {
  diagnoseOriginalV1AcceptanceEnv,
  formatOriginalV1PreflightReport,
} from "../lib/testing/original-v1-acceptance-preflight";
import { defaultIsolatedPlaywrightBaseUrl } from "../lib/testing/original-v1-acceptance-setup";

loadOriginalV1AcceptanceEnvFiles();

function preferredPort() {
  const configured = process.env.PLAYWRIGHT_BASE_URL?.trim();
  if (configured) {
    try {
      const port = Number(new URL(configured).port);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {
      // Fall through to the dedicated isolated default.
    }
  }
  return Number(new URL(defaultIsolatedPlaywrightBaseUrl()).port);
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
  throw new Error("No local port is available for the isolated acceptance server.");
}

async function main() {
  const report = diagnoseOriginalV1AcceptanceEnv();
  const isolatedUrl = process.env.BITS_E2E_DATABASE_URL?.trim() ?? "";
  const token = process.env.BITS_E2E_TARGET_TOKEN?.trim() ?? "";
  const productionClerk = report.issues.some(
    (issue) =>
      issue.code === "clerk_production_secret" ||
      issue.code === "clerk_production_publishable" ||
      issue.code === "production_runtime",
  );
  if (!isolatedUrl || !token || productionClerk) {
    process.stderr.write(formatOriginalV1PreflightReport(report));
    process.stderr.write(
      "The isolated acceptance server was not started. BITS_E2E_DATABASE_URL, BITS_E2E_TARGET_TOKEN, and Clerk development keys are required; the child process will not inherit the working church DATABASE_URL.\n",
    );
    process.exit(2);
  }

  const port = await choosePort(preferredPort());
  const baseUrl = `http://127.0.0.1:${port}`;
  process.stdout.write(`starting isolated acceptance server on ${baseUrl}\n`);

  const child = spawn("npx", ["next", "dev", "-p", String(port)], {
    env: {
      ...process.env,
      DATABASE_URL: isolatedUrl,
      DIRECT_URL: isolatedUrl,
      BITS_E2E_APP_DATABASE_URL: isolatedUrl,
      BITS_E2E_ACCEPTANCE: "1",
      PLAYWRIGHT_BASE_URL: baseUrl,
      BITS_STATEMENT_PDF_BACKEND: "local",
      NODE_ENV: process.env.NODE_ENV === "production" ? "development" : process.env.NODE_ENV,
    },
    stdio: "inherit",
  });

  const shutdown = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Acceptance server failed.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
