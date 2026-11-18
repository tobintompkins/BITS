import { BackupGuardError } from "../lib/ops/independent-backup-guard";
import { runPreparedBackupStep } from "../lib/ops/independent-backup-schedule";
import { dailyBackupObjectKey } from "../lib/ops/independent-backup-railway-once";

async function main() {
  if (process.argv.includes("--apply")) {
    throw new BackupGuardError("This command does not upload. The Railway job performs the daily backup.");
  }
  await runPreparedBackupStep(async () => undefined);
  const date = new Date("2026-11-18T11:15:00.000Z");
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      upload: false,
      cadence: "daily",
      weeklyImplemented: false,
      statementsImplemented: false,
      offlineRecoveryKey: "incomplete",
      service: "bits-test-backup",
      project: "bits-test",
      environment: "test",
      scheduleUtc: "15 11 * * *",
      scheduleEnabled: true,
      exampleDailyKey: dailyBackupObjectKey(date),
    })}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Scheduled backup plan failed.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
