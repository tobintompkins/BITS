import { readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BackupGuardError } from "./independent-backup-guard";
import {
  approvedAgeRecipient,
  assertCanUpload,
  assertRailwayBackupEnvironment,
  dailyBackupObjectKey,
  protectedBackupObjectKey,
  redactBackupError,
  runAbortableCommand,
  runApprovedRailwayBackup,
} from "./independent-backup-railway-once";

const approvedEnv = {
  BITS_BACKUP_AGE_RECIPIENT: approvedAgeRecipient,
  BITS_BACKUP_R2_BUCKET: "bits-independent-backups",
  BITS_BACKUP_R2_ENDPOINT: "https://32d6232bc07b4dbcde185128f4848924.r2.cloudflarestorage.com",
  BITS_BACKUP_R2_ACCESS_KEY_ID: "approved-access-key",
  BITS_BACKUP_R2_SECRET_ACCESS_KEY: "approved-secret",
  DATABASE_URL: "postgresql://postgres:secret@postgres.railway.internal:5432/railway",
};

const nextDailyRun = new Date("2026-11-18T11:15:00.000Z");

describe("manual railway backup job", () => {
  it("keeps the public recipient and writes one new daily key", () => {
    const key = dailyBackupObjectKey(nextDailyRun);
    expect(key).toBe("test/postgres/daily/2026-11-18/bits-test-db-20261118T111500Z.dump.age");
    expect(key.startsWith("test/postgres/weekly/") || key.startsWith("test/statements/")).toBe(false);
    expect(assertRailwayBackupEnvironment(approvedEnv, nextDailyRun).key).toBe(key);
    expect(assertRailwayBackupEnvironment(approvedEnv, nextDailyRun).recipient).toBe(approvedAgeRecipient);
    expect(dailyBackupObjectKey(new Date("2026-11-15T11:15:00.000Z"))).toBe(
      "test/postgres/daily/2026-11-15/bits-test-db-20261115T111500Z.dump.age",
    );
  });

  it("refuses the protected archive, an existing key, a private age key, or another database", () => {
    expect(() => dailyBackupObjectKey(new Date("2026-11-17T21:01:00.000Z"))).toThrow(/protected backup/);
    expect(() =>
      assertCanUpload({
        key: "test/postgres/daily/2026-11-18/bits-test-db-20261118T111500Z.dump.age",
        existingKeys: ["test/postgres/daily/2026-11-18/bits-test-db-20261118T111500Z.dump.age"],
        archiveBytes: 384_906,
        existingBytes: 385_186,
        incomingBytes: 385_186,
      }),
    ).toThrow(/existing backup/);
    expect(
      assertCanUpload({
        key: "test/postgres/daily/2026-11-18/bits-test-db-20261118T111500Z.dump.age",
        existingKeys: [protectedBackupObjectKey],
        archiveBytes: 384_906,
        existingBytes: 385_186,
        incomingBytes: 385_200,
      }),
    ).toBe("test/postgres/daily/2026-11-18/bits-test-db-20261118T111500Z.dump.age");
    expect(() =>
      assertRailwayBackupEnvironment({
        ...approvedEnv,
        BITS_BACKUP_AGE_IDENTITY: "AGE-SECRET-KEY-EXAMPLE",
      }),
    ).toThrow(/private-key variable/);
    expect(() =>
      assertRailwayBackupEnvironment({
        ...approvedEnv,
        DATABASE_URL: "postgresql://postgres:secret@postgres.railway.internal:5432/bits",
      }, nextDailyRun),
    ).toThrow(/bits-test-db/);
    expect(redactBackupError(new Error("failed postgres://postgres:secret@db.internal/railway"))).not.toContain(
      "secret",
    );
  });

  it("removes the temporary directory when the dump command fails", async () => {
    const before = new Set(readdirSync(tmpdir()));
    await expect(
      runApprovedRailwayBackup(approvedEnv, {
        now: nextDailyRun,
        runCommand: async () => {
          throw new BackupGuardError("pg_dump failed");
        },
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(/pg_dump failed/);
    const leftovers = readdirSync(tmpdir()).filter(
      (name) => name.startsWith("bits-test-backup-") && !before.has(name),
    );
    expect(leftovers).toEqual([]);
  });

  it("kills the dump process when the backup signal aborts", async () => {
    const pidFile = join(tmpdir(), `bits-backup-child-${process.pid}`);
    const controller = new AbortController();
    const pending = runAbortableCommand(
      "sh",
      ["-c", `echo $$ > '${pidFile}'; sleep 30`],
      controller.signal,
    );
    const started = Date.now();
    while (!readFileExists(pidFile)) {
      if (Date.now() - started > 2_000) throw new Error("The child did not record its process id.");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const pid = Number(readFileSync(pidFile, "utf8").trim());
    controller.abort();
    await expect(pending).rejects.toThrow(/timed out/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(() => process.kill(pid, 0)).toThrow();
    rmSync(pidFile, { force: true });
  });

  it("redacts a database URL printed by a failed command", async () => {
    const controller = new AbortController();
    await expect(
      runAbortableCommand(
        "node",
        ["-e", "process.stderr.write('postgres://postgres:secret@db.internal/railway'); process.exit(1)"],
        controller.signal,
      ),
    ).rejects.toThrow(/postgres:\/\/redacted/);
  });
});

function readFileExists(path: string) {
  try {
    return readFileSync(path, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}
