import { redactBackupError, runApprovedRailwayBackup } from "../lib/ops/independent-backup-railway-once";

async function main() {
  const result = await runApprovedRailwayBackup();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${redactBackupError(error)}\n`);
  process.exit(1);
});
