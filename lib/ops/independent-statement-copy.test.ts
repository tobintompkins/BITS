import { describe, expect, it } from "vitest";

import { BackupGuardError, backupLimits } from "./independent-backup-guard";
import { approvedAgeRecipient } from "./independent-backup-railway-once";
import {
  assertStatementCopyEnvironment,
  executeStatementCopy,
  statementBackupObjectKey,
  statementRehearsalPdf,
  statementRehearsalProposal,
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
});
