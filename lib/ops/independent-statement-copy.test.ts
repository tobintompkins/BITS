import { describe, expect, it } from "vitest";

import { BackupGuardError, backupLimits } from "./independent-backup-guard";
import { approvedAgeRecipient } from "./independent-backup-railway-once";
import {
  assertStatementCopyEnvironment,
  assertStatementDestinationKey,
  assertStatementInvocation,
  executeStatementCopy,
  statementBackupIsExpired,
  statementBackupNeedsRenewal,
  statementBackupObjectKey,
  statementBackupSchedulePlan,
  statementCopyExitCode,
  statementManifestKey,
  statementRehearsalPdf,
  statementRehearsalProposal,
  statementRehearsalRestoreKey,
  statementRehearsalSourceKey,
  sha256,
  type StatementCopyClients,
  type StatementSourceObject,
  type StoredStatementCopy,
} from "./independent-statement-copy";

const sourceBucket = "bits-statements-app-test-example";
const now = new Date("2026-11-18T19:30:00.000Z");

function pdf(marker: string) {
  return Buffer.from(`%PDF-1.4\n${marker}\n%%EOF\n`, "utf8");
}

function source(key: string, bytes = pdf("synthetic")): StatementSourceObject {
  return { key, bytes };
}

function clients(input: {
  sources?: StatementSourceObject[];
  stored?: StoredStatementCopy[];
  totalBytes?: number;
  failPut?: boolean;
}) {
  const puts: string[] = [];
  const deletes: string[] = [];
  const api: StatementCopyClients = {
    async listSource() {
      return input.sources ?? [];
    },
    async listDestination() {
      return { objects: input.stored ?? [], totalBytes: input.totalBytes ?? 0 };
    },
    async putDestination(object) {
      if (input.failPut) throw new BackupGuardError("Put failed.");
      puts.push(object.key);
    },
    async encrypt(bytes) {
      return Buffer.concat([Buffer.from("age"), bytes]);
    },
  };
  return { api, puts, deletes };
}

const rehearsalSource = source(statementRehearsalSourceKey(), statementRehearsalPdf());

describe("independent statement copy", () => {
  it("treats an empty source as no PDFs and does not upload", async () => {
    const io = clients({});
    const report = await executeStatementCopy({
      sourceBucket,
      now,
      apply: true,
      rehearsal: false,
      clients: io.api,
    });
    expect(report).toMatchObject({
      outcome: "empty",
      pdfsPresent: 0,
      copied: 0,
      upload: false,
      recoveryProof: false,
      deletes: false,
      statementScheduleEnabled: false,
      weeklyDatabaseImplemented: false,
      label: "0 PDFs present. This is not statement recovery.",
    });
    expect(io.puts).toEqual([]);
    expect(io.deletes).toEqual([]);
  });

  it("plans a new PDF without uploading until apply is set", async () => {
    const io = clients({ sources: [rehearsalSource] });
    const planned = await executeStatementCopy({
      sourceBucket,
      now,
      apply: false,
      rehearsal: true,
      clients: io.api,
    });
    expect(planned.outcome).toBe("planned");
    expect(planned.upload).toBe(false);
    expect(planned.destinationKeys[0]).toBe(statementBackupObjectKey(now, rehearsalSource.key));
    expect(planned.destinationKeys.join(" ")).not.toContain(rehearsalSource.key);
    expect(io.puts).toEqual([]);

    const uploaded = await executeStatementCopy({
      sourceBucket,
      now,
      apply: true,
      rehearsal: true,
      clients: io.api,
    });
    expect(uploaded).toMatchObject({
      outcome: "copied",
      copied: 1,
      upload: true,
      recoveryProof: false,
      deletes: false,
    });
    expect(io.puts).toHaveLength(2);
    expect(io.puts[0]?.startsWith("test/statements/objects/")).toBe(true);
    expect(io.puts[1]?.startsWith("test/statements/manifests/")).toBe(true);
  });

  it("skips an unchanged PDF and keeps a backup whose source disappeared", async () => {
    const sourceSha256 = sha256(rehearsalSource.bytes);
    const sourceKeySha256 = sha256(rehearsalSource.key);
    const io = clients({
      sources: [rehearsalSource],
      stored: [
        {
          key: "test/statements/objects/2026-11-18/20261118T180000Z/old.pdf.age",
          size: 10,
          sourceKeySha256,
          sourceSha256,
        },
        {
          key: "test/statements/objects/2026-11-17/20261117T180000Z/absent.pdf.age",
          size: 10,
          sourceKeySha256: "b".repeat(64),
          sourceSha256: "c".repeat(64),
        },
      ],
    });
    const report = await executeStatementCopy({
      sourceBucket,
      now,
      apply: true,
      rehearsal: true,
      clients: io.api,
    });
    expect(report).toMatchObject({ outcome: "unchanged", copied: 0, retainedAbsentSources: 1, upload: false });
    expect(io.puts).toEqual([]);
  });

  it("stores a changed PDF under a new key", async () => {
    const io = clients({
      sources: [rehearsalSource],
      stored: [
        {
          key: "test/statements/objects/2026-11-18/20261118T180000Z/previous.pdf.age",
          size: 10,
          sourceKeySha256: sha256(rehearsalSource.key),
          sourceSha256: "d".repeat(64),
        },
      ],
    });
    const report = await executeStatementCopy({
      sourceBucket,
      now,
      apply: true,
      rehearsal: true,
      clients: io.api,
    });
    expect(report.copied).toBe(1);
    expect(report.destinationKeys[0]).not.toBe(io.puts[0] && "test/statements/objects/2026-11-18/20261118T180000Z/previous.pdf.age");
    expect(io.puts[0]).toBe(statementBackupObjectKey(now, rehearsalSource.key));
  });

  it("refuses to overwrite a locked key, a non-PDF, another source object, or the wrong bucket", async () => {
    const destinationKey = statementBackupObjectKey(now, rehearsalSource.key);
    const existing = clients({
      sources: [rehearsalSource],
      stored: [{ key: destinationKey, size: 10, sourceKeySha256: sha256(rehearsalSource.key), sourceSha256: "e".repeat(64) }],
    });
    await expect(
      executeStatementCopy({ sourceBucket, now, apply: true, rehearsal: true, clients: existing.api }),
    ).rejects.toThrow("overwrite");
    expect(existing.puts).toEqual([]);

    const invalid = clients({ sources: [source(rehearsalSource.key, Buffer.from("not a pdf"))] });
    await expect(
      executeStatementCopy({ sourceBucket, now, apply: true, rehearsal: true, clients: invalid.api }),
    ).rejects.toThrow("not a PDF");

    const extra = clients({
      sources: [rehearsalSource, source("private/statements/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/other.pdf")],
    });
    await expect(
      executeStatementCopy({ sourceBucket, now, apply: true, rehearsal: true, clients: extra.api }),
    ).rejects.toThrow("refuses every object");
    expect(extra.puts).toEqual([]);

    await expect(
      executeStatementCopy({
        sourceBucket: "bits-statements-test-hrqzaa",
        now,
        apply: false,
        rehearsal: true,
        clients: clients({}).api,
      }),
    ).rejects.toThrow("rehearsal bucket");
    await expect(
      executeStatementCopy({
        sourceBucket: "bits-independent-backups",
        now,
        apply: false,
        rehearsal: false,
        clients: clients({}).api,
      }),
    ).rejects.toThrow("independent backup bucket");
  });

  it("fails instead of storing a copy that would pass the 8 GiB guard", async () => {
    const io = clients({ sources: [rehearsalSource] });
    await expect(
      executeStatementCopy({
        sourceBucket,
        now,
        apply: true,
        rehearsal: true,
        existingBucketBytes: backupLimits.maxStoredTotalBytes,
        clients: io.api,
      }),
    ).rejects.toThrow("8 GiB");
    expect(io.puts).toEqual([]);
  });

  it("does not report success when encryption fails after a PDF was not stored", async () => {
    const io = clients({ sources: [rehearsalSource], failPut: true });
    await expect(
      executeStatementCopy({
        sourceBucket,
        now,
        apply: true,
        rehearsal: true,
        clients: io.api,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("Put failed.");
  });

  it("rejects a private key, the upload credential reused as the source, and a missing rehearsal PDF", async () => {
    expect(() =>
      assertStatementCopyEnvironment({
        BITS_BACKUP_AGE_RECIPIENT: approvedAgeRecipient,
        BITS_BACKUP_AGE_IDENTITY: "present",
      }),
    ).toThrow("private-key");
    expect(() =>
      assertStatementCopyEnvironment({
        BITS_BACKUP_AGE_RECIPIENT: approvedAgeRecipient,
        BITS_STATEMENT_S3_BUCKET: sourceBucket,
        BITS_STATEMENT_S3_REGION: "auto",
        BITS_STATEMENT_S3_ENDPOINT: "https://t3.storageapi.dev",
        BITS_BACKUP_STATEMENT_SOURCE_ACCESS_KEY_ID: "source-access-key",
        BITS_BACKUP_STATEMENT_SOURCE_SECRET_ACCESS_KEY: "source-secret-key",
        BITS_BACKUP_R2_BUCKET: "bits-independent-backups",
        BITS_BACKUP_R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
        BITS_BACKUP_R2_ACCESS_KEY_ID: "source-access-key",
        BITS_BACKUP_R2_SECRET_ACCESS_KEY: "destination-secret",
      }),
    ).toThrow("must not be the independent-backup upload credential");

    const missing = await executeStatementCopy({
      sourceBucket,
      now,
      apply: true,
      rehearsal: true,
      clients: clients({}).api,
    });
    expect(missing).toMatchObject({ outcome: "missing-rehearsal-pdf", pdfsPresent: 0, recoveryProof: false });
  });

  it("names the synthetic rehearsal without a donor key or an immediate independent-backup deletion", () => {
    const proposal = statementRehearsalProposal();
    expect(proposal.sourceKey).toBe(statementRehearsalSourceKey());
    expect(proposal.sourceKey).not.toContain("saco");
    expect(proposal.destinationKey.startsWith("test/statements/objects/2026-11-18/")).toBe(true);
    expect(proposal.manifestKey.startsWith("test/statements/manifests/2026-11-18/")).toBe(true);
    expect(proposal.destinationKey).not.toContain(proposal.sourceKey);
    expect(proposal).toMatchObject({
      lockDays: 90,
      expireEligibleDays: 91,
      independentObjectsDeletableNow: false,
      appObjectsDeletableAfterVerification: true,
      recoveryProof: false,
      scheduleEnabled: false,
    });
    expect(proposal.sourceSha256).toBe(sha256(statementRehearsalPdf()));
  });

  it("limits a rehearsal to the requested run and its later restore key", async () => {
    const runId = "175b63ed-d44d-432e-867f-504064727ce8";
    const sourceKey = statementRehearsalSourceKey(runId);
    const io = clients({ sources: [source(sourceKey, statementRehearsalPdf())] });
    const planned = await executeStatementCopy({
      sourceBucket,
      now: new Date("2026-11-23T17:30:00.000Z"),
      apply: false,
      rehearsal: true,
      runId,
      clients: io.api,
    });
    expect(sourceKey).toBe(
      "private/statements/00000000-0000-4000-8000-00000000f00d/175b63ed-d44d-432e-867f-504064727ce8/probe.pdf",
    );
    expect(statementRehearsalRestoreKey(runId)).toBe(
      "private/statements/00000000-0000-4000-8000-00000000f00d/175b63ed-d44d-432e-867f-504064727ce8/restored.pdf",
    );
    expect(planned.outcome).toBe("planned");
    expect(planned.destinationKeys[0]).toContain("/2026-11-23/");
    expect(planned.upload).toBe(false);

    const oldKey = clients({ sources: [rehearsalSource] });
    await expect(
      executeStatementCopy({
        sourceBucket,
        now,
        apply: false,
        rehearsal: true,
        runId,
        clients: oldKey.api,
      }),
    ).rejects.toThrow("refuses every object");
  });
});

const applicationKey =
  "private/statements/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/statement.pdf";
const secondApplicationKey =
  "private/statements/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/statement.pdf";

function scheduledClients(input: {
  sources?: StatementSourceObject[];
  stored?: StoredStatementCopy[];
  totalBytes?: number;
  failures?: Record<string, number>;
  confirm?: "missing" | "mismatch" | "stored";
}) {
  const puts: string[] = [];
  const stored = [...(input.stored ?? [])];
  const attempts = new Map<string, number>();
  const api: StatementCopyClients = {
    async listSource() {
      return input.sources ?? [];
    },
    async listDestination() {
      return { objects: stored, totalBytes: input.totalBytes ?? 0 };
    },
    async putDestination(object) {
      const seen = (attempts.get(object.key) ?? 0) + 1;
      attempts.set(object.key, seen);
      if (seen <= (input.failures?.[object.key] ?? 0)) throw new BackupGuardError("Put failed.");
      puts.push(object.key);
      stored.push({
        key: object.key,
        size: object.body.byteLength,
        sourceKeySha256: object.metadata["source-key-sha256"],
        sourceSha256: object.metadata["source-sha256"],
        ciphertextSha256: object.metadata["ciphertext-sha256"],
      });
    },
    async confirmStored(key) {
      if (input.confirm === "missing") return null;
      const found = stored.find((object) => object.key === key);
      if (!found) return null;
      if (input.confirm === "mismatch") return { ...found, ciphertextSha256: "f".repeat(64) };
      return found;
    },
    async encrypt(bytes) {
      return Buffer.concat([Buffer.from("age"), bytes]);
    },
  };
  return { api, puts, attempts, stored };
}

describe("scheduled statement backup", () => {
  const scheduledNow = new Date("2026-11-24T12:15:00.000Z");
  const applicationPdf = pdf("application-statement");

  it("copies the first application PDF and verifies it without enabling the schedule", async () => {
    const sourceObject = source(applicationKey, applicationPdf);
    const io = scheduledClients({ sources: [sourceObject] });
    const report = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: io.api,
      sleep: async () => undefined,
    });
    expect(report).toMatchObject({
      outcome: "copied",
      pdfsPresent: 1,
      copied: 1,
      unchanged: 0,
      failed: 0,
      verified: true,
      upload: true,
      recoveryProof: false,
      deletes: false,
      scheduleEnabled: false,
      statementScheduleEnabled: false,
    });
    expect(statementCopyExitCode(report)).toBe(0);
    expect(io.puts).toEqual([
      statementBackupObjectKey(scheduledNow, applicationKey),
      statementManifestKey(scheduledNow),
    ]);
    expect(io.puts.join(" ")).not.toContain("private/statements/");
  });

  it("does not upload an unchanged PDF again", async () => {
    const sourceObject = source(applicationKey, applicationPdf);
    const io = scheduledClients({
      sources: [sourceObject],
      stored: [{
        key: statementBackupObjectKey(new Date("2026-11-23T18:08:39.000Z"), applicationKey),
        size: 12,
        sourceKeySha256: sha256(applicationKey),
        sourceSha256: sha256(applicationPdf),
      }],
    });
    const report = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: io.api,
      sleep: async () => undefined,
    });
    expect(report).toMatchObject({ outcome: "unchanged", copied: 0, unchanged: 1, failed: 0, verified: true, upload: false });
    expect(io.puts).toEqual([]);
    expect(statementCopyExitCode(report)).toBe(0);
  });

  it("stores a changed PDF under a new key and keeps the retained backup", async () => {
    const sourceObject = source(applicationKey, applicationPdf);
    const retained = "test/statements/objects/2026-11-23/20261123T180839Z/previous.pdf.age";
    const io = scheduledClients({
      sources: [sourceObject],
      stored: [{
        key: retained,
        size: 12,
        sourceKeySha256: sha256(applicationKey),
        sourceSha256: "d".repeat(64),
      }],
    });
    const report = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: io.api,
      sleep: async () => undefined,
    });
    expect(report.copied).toBe(1);
    expect(report.verified).toBe(true);
    expect(io.puts[0]).toBe(statementBackupObjectKey(scheduledNow, applicationKey));
    expect(io.puts).not.toContain(retained);
  });

  it("retries one failed upload and reports a file that still fails", async () => {
    const retried = statementBackupObjectKey(scheduledNow, applicationKey);
    const retry = scheduledClients({
      sources: [source(applicationKey, applicationPdf)],
      failures: { [retried]: 1 },
    });
    const retriedReport = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: retry.api,
      sleep: async () => undefined,
    });
    expect(retriedReport).toMatchObject({ outcome: "copied", copied: 1, failed: 0, verified: true });
    expect(retry.attempts.get(retried)).toBe(2);

    const blocked = statementBackupObjectKey(scheduledNow, secondApplicationKey);
    const partial = scheduledClients({
      sources: [source(applicationKey, applicationPdf), source(secondApplicationKey, pdf("second"))],
      failures: { [blocked]: 3 },
    });
    const failedReport = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: partial.api,
      sleep: async () => undefined,
    });
    expect(failedReport).toMatchObject({
      outcome: "failed",
      copied: 1,
      failed: 1,
      upload: true,
      verified: false,
      deletes: false,
      manifestKey: null,
    });
    expect(failedReport.failedFiles).toEqual([{ sourceKey: secondApplicationKey, reason: "copy" }]);
    expect(partial.puts).toEqual([statementBackupObjectKey(scheduledNow, applicationKey)]);
    expect(partial.attempts.get(blocked)).toBe(backupLimits.maxAttempts);
    expect(statementCopyExitCode(failedReport)).toBe(1);
  });

  it("treats an empty source as a successful run and not a backup proof", async () => {
    const io = scheduledClients({});
    const report = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: io.api,
    });
    expect(report).toMatchObject({
      outcome: "empty",
      pdfsPresent: 0,
      copied: 0,
      unchanged: 0,
      failed: 0,
      verified: false,
      upload: false,
      recoveryProof: false,
    });
    expect(report.label).toContain("not proof");
    expect(io.puts).toEqual([]);
    expect(statementCopyExitCode(report)).toBe(0);
  });

  it("refuses the wrong source bucket, a non-statement destination, and an overwrite", async () => {
    expect(() => assertStatementDestinationKey("test/postgres/daily/2026-11-24/bits-test-db.dump.age")).toThrow(
      "outside test/statements",
    );
    expect(() => assertStatementDestinationKey(applicationKey)).toThrow("outside test/statements");
    await expect(
      executeStatementCopy({
        sourceBucket: "bits-independent-backups",
        now: scheduledNow,
        apply: true,
        rehearsal: false,
        scheduled: true,
        clients: scheduledClients({}).api,
      }),
    ).rejects.toThrow("independent backup bucket");
    await expect(
      executeStatementCopy({
        sourceBucket: "bits-statements-test-hrqzaa",
        now: scheduledNow,
        apply: false,
        rehearsal: false,
        scheduled: true,
        clients: scheduledClients({}).api,
      }),
    ).rejects.toThrow("rehearsal bucket");

    const occupied = statementBackupObjectKey(scheduledNow, applicationKey);
    const io = scheduledClients({
      sources: [source(applicationKey, applicationPdf)],
      stored: [{ key: occupied, size: 10, sourceKeySha256: sha256(applicationKey), sourceSha256: "e".repeat(64) }],
    });
    const report = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: io.api,
      sleep: async () => undefined,
    });
    expect(report).toMatchObject({ outcome: "failed", copied: 0, upload: false, deletes: false });
    expect(report.failedFiles).toEqual([{ sourceKey: applicationKey, reason: "overwrite" }]);
    expect(io.puts).toEqual([]);
    expect(() =>
      assertStatementInvocation({ rehearsal: true, scheduled: true, recover: false, delete: false, schedule: false }),
    ).toThrow("not the recovery rehearsal");
    expect(() =>
      assertStatementInvocation({ rehearsal: false, scheduled: true, recover: false, delete: false, schedule: true }),
    ).toThrow("does not delete objects or enable a schedule");
  });

  it("fails verification without deleting the stored object", async () => {
    const io = scheduledClients({
      sources: [source(applicationKey, applicationPdf)],
      confirm: "missing",
    });
    const report = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: io.api,
      sleep: async () => undefined,
    });
    expect(report).toMatchObject({ outcome: "failed", verified: false, manifestKey: null, deletes: false });
    expect(report.failedFiles).toEqual([{ sourceKey: applicationKey, reason: "verification" }]);
    expect(io.puts).toEqual([statementBackupObjectKey(scheduledNow, applicationKey)]);
  });

  it("stops before an upload that would pass 8 GiB", async () => {
    const io = scheduledClients({ sources: [source(applicationKey, applicationPdf)] });
    await expect(
      executeStatementCopy({
        sourceBucket,
        now: scheduledNow,
        apply: true,
        rehearsal: false,
        scheduled: true,
        existingBucketBytes: backupLimits.maxStoredTotalBytes,
        clients: io.api,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("8 GiB");
    expect(io.puts).toEqual([]);
  });

  it("stops when the scheduled copy times out", async () => {
    const pending = executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      timeoutMs: 20,
      sleep: async () => undefined,
      clients: {
        ...scheduledClients({}).api,
        async listSource(signal) {
          await new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new BackupGuardError("stopped")), { once: true });
          });
          return [];
        },
      },
    });
    await expect(pending).rejects.toThrow("timed out");
  });

  it("renews an unchanged PDF before expiration without deleting the retained copy", async () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const due = new Date(scheduledNow.getTime() - 84 * dayMs);
    const stillProtected = new Date(scheduledNow.getTime() - 84 * dayMs + 1000);
    expect(statementBackupNeedsRenewal(due, scheduledNow)).toBe(true);
    expect(statementBackupNeedsRenewal(stillProtected, scheduledNow)).toBe(false);
    expect(statementBackupIsExpired(new Date(scheduledNow.getTime() - 91 * dayMs), scheduledNow)).toBe(true);

    const sourceObject = source(applicationKey, applicationPdf);
    const oldKey = statementBackupObjectKey(due, applicationKey);
    const retained = [{
      key: oldKey,
      size: 12,
      sourceKeySha256: sha256(applicationKey),
      sourceSha256: sha256(applicationPdf),
    }];
    const io = scheduledClients({ sources: [sourceObject], stored: retained });
    const report = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: io.api,
      sleep: async () => undefined,
    });
    const renewedKey = statementBackupObjectKey(scheduledNow, applicationKey);
    expect(report).toMatchObject({
      outcome: "copied",
      copied: 1,
      renewed: 1,
      unchanged: 0,
      failed: 0,
      verified: true,
      deletes: false,
      statementScheduleEnabled: false,
    });
    expect(report.label).toContain("Existing backups were not deleted");
    expect(io.puts).toEqual([renewedKey, statementManifestKey(scheduledNow)]);
    expect(io.puts).not.toContain(oldKey);
    expect(io.stored.some((object) => object.key === oldKey)).toBe(true);
    expect(io.stored.some((object) => object.key === renewedKey)).toBe(true);

    const protectedKey = statementBackupObjectKey(stillProtected, applicationKey);
    const held = scheduledClients({
      sources: [sourceObject],
      stored: [{
        key: protectedKey,
        size: 12,
        sourceKeySha256: sha256(applicationKey),
        sourceSha256: sha256(applicationPdf),
      }],
    });
    const heldReport = await executeStatementCopy({
      sourceBucket,
      now: scheduledNow,
      apply: true,
      rehearsal: false,
      scheduled: true,
      clients: held.api,
      sleep: async () => undefined,
    });
    expect(heldReport).toMatchObject({ outcome: "unchanged", copied: 0, renewed: 0, upload: false, deletes: false });
    expect(held.puts).toEqual([]);
  });

  it("keeps the database backup schedule and backup watch unchanged", () => {
    expect(statementBackupSchedulePlan).toMatchObject({
      project: "bits-test",
      environment: "test",
      serviceName: "bits-test-statement-backup",
      serviceId: null,
      scheduleUtc: "15 12 * * *",
      scheduleEnabled: false,
      statementScheduleEnabled: false,
      databaseServiceName: "bits-test-backup",
      databaseServiceId: "0f68511a-a35d-4d0a-af5c-48b9a0e93265",
      databaseScheduleUtc: "15 11 * * *",
      watchWorkflow: ".github/workflows/bits-test-backup-watch.yml",
      watchScheduleUtc: "45 11 * * *",
      destinationBucket: "bits-independent-backups",
      lockDays: 90,
      expireEligibleDays: 91,
      renewalLeadDays: 7,
      privateKeyAccepted: false,
    });
    expect(statementBackupSchedulePlan.command).toBe("npm run backup:statements -- --scheduled --apply");
  });
});
