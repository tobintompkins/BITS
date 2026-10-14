import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.join(process.cwd(), "e2e/acceptance/fixtures/cli.ts");

export function runOriginalV1FixtureCli(args: string[], inherit = false) {
  try {
    return execFileSync("npx", ["tsx", CLI, ...args], {
      encoding: "utf8",
      env: process.env,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failed = error as { stderr?: string; stdout?: string; message?: string };
    throw new Error(
      failed.stderr?.trim() || failed.stdout?.trim() || failed.message || "Fixture command failed.",
    );
  }
}

export function queryOriginalV1Fixture<T>(op: string): T {
  const output = runOriginalV1FixtureCli(["query", op]).trim();
  const line = output.split("\n").filter(Boolean).at(-1);
  if (!line) {
    throw new Error(`Fixture query ${op} returned no JSON.`);
  }
  return JSON.parse(line) as T;
}
