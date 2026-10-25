import { loadStatementStorageTestEnvFiles } from "../lib/storage/statement-storage-test-env";
import { runStatementPdfRestoreRehearsal } from "../lib/storage/statement-pdf-probe";

loadStatementStorageTestEnvFiles();

async function main() {
  const apply = process.argv.includes("--apply");
  const report = await runStatementPdfRestoreRehearsal({ apply });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok || report.checks.some((check) => check.status === "blocked")) {
    process.exitCode = 2;
  }
}

main().catch(() => {
  process.stderr.write("Statement storage restore rehearsal failed.\n");
  process.exit(1);
});
