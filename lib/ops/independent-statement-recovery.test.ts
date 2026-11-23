import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BackupGuardError, backupLimits } from "./independent-backup-guard";
import { sha256, statementBackupIsExpired, statementBackupObjectKey, statementManifestKey, statementRehearsalPdf, statementRehearsalRestoreKey, statementRehearsalSourceKey, newestRetainedStatementBackup } from "./independent-statement-copy";
import {
  executeStatementRecovery,
  preparedStatementRecoveryBytes,
  preparedStatementRecoveryRunId,
  preparedStatementRecoverySha256,
  type StatementRecoveryClients,
} from "./independent-statement-recovery";

const sourceBucket = "bits-statements-app-test-zxau99";
const manifestKey = "test/statements/manifests/2026-11-23/20261123T173000Z.json.age";
const pdf = readFileSync("e2e/.local/statement-rehearsal/probe.pdf");
const sourceKey = statementRehearsalSourceKey(preparedStatementRecoveryRunId);
const restoreKey = statementRehearsalRestoreKey(preparedStatementRecoveryRunId);
const backupKey = `test/statements/objects/2026-11-23/20261123T173000Z/${sha256(sourceKey)}.pdf.age`;
const ciphertext = Buffer.from(`age-ciphertext:${preparedStatementRecoverySha256}`);
const manifestCiphertext = Buffer.from("age-manifest");

function manifest(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      sourceBucket,
      objects: [
        {
          sourceKey,
          sourceSha256: preparedStatementRecoverySha256,
          sourceBytes: pdf.byteLength,
          destinationKey: backupKey,
          ciphertextSha256: sha256(ciphertext),
          ...overrides,
        },
      ],
    }),
    "utf8",
  );
}

function clients(overrides: Partial<StatementRecoveryClients> = {}) {
  const downloads: string[] = [];
  const puts: Array<{ key: string; body: Buffer }> = [];
  const api: StatementRecoveryClients = {
    async downloadEncrypted(key) {
      downloads.push(key);
      if (key === sourceKey || key === restoreKey) {
        throw new Error("recovery read the application original");
      }
      if (key === manifestKey) return manifestCiphertext;
      if (key === backupKey) return ciphertext;
      return null;
    },
    async decrypt(bytes) {
      if (bytes.equals(manifestCiphertext)) return manifest();
      if (bytes.equals(ciphertext)) return pdf;
      throw new Error("age rejected the ciphertext");
    },
    async restoreExists() {
      return false;
    },
    async putRestore(key, body) {
      puts.push({ key, body });
    },
    ...overrides,
  };
  return { api, downloads, puts };
}

function recover(
  clientOverrides: Partial<StatementRecoveryClients> = {},
  input: Partial<Parameters<typeof executeStatementRecovery>[0]> = {},
) {
  const io = clients(clientOverrides);
  return {
    io,
    result: executeStatementRecovery({
      sourceBucket,
      runId: preparedStatementRecoveryRunId,
      manifestKey,
      apply: true,
      clients: io.api,
      sleep: async () => undefined,
      ...input,
    }),
  };
}

describe("independent statement recovery", () => {
  it("reviews the prepared PDF before restoring it from the backup", () => {
    expect(pdf.byteLength).toBe(preparedStatementRecoveryBytes);
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(sha256(pdf)).toBe(preparedStatementRecoverySha256);
    expect(sourceKey).toBe(
      "private/statements/00000000-0000-4000-8000-00000000f00d/175b63ed-d44d-432e-867f-504064727ce8/probe.pdf",
    );
    expect(restoreKey).toBe(
      "private/statements/00000000-0000-4000-8000-00000000f00d/175b63ed-d44d-432e-867f-504064727ce8/restored.pdf",
    );
  });

  it("restores only the decrypted backup to this run's restored PDF", async () => {
    const localOriginal = Buffer.from("%PDF-1.4\nlocal original\n%%EOF\n");
    const { io, result } = recover();
    const report = await result;
    expect(report).toMatchObject({
      outcome: "restored",
      restoreKey,
      backupKey,
      sourceSha256: preparedStatementRecoverySha256,
      checksumMatched: true,
      usedApplicationOriginal: false,
      upload: true,
      deletes: false,
      scheduleEnabled: false,
      recoveryProof: true,
    });
    expect(io.downloads).toEqual([manifestKey, backupKey]);
    expect(io.puts).toHaveLength(1);
    expect(io.puts[0]?.key).toBe(restoreKey);
    expect(sha256(io.puts[0]?.body ?? Buffer.alloc(0))).toBe(preparedStatementRecoverySha256);
    expect(io.puts[0]?.body.equals(localOriginal)).toBe(false);
  });

  it("plans a recovery without writing when apply is off", async () => {
    const { io, result } = recover({}, { apply: false });
    await expect(result).resolves.toMatchObject({ outcome: "planned", upload: false, recoveryProof: false });
    expect(io.puts).toEqual([]);
  });

  it("rejects a wrong checksum without writing", async () => {
    const { io, result } = recover({
      async decrypt(bytes) {
        if (bytes.equals(manifestCiphertext)) return manifest();
        return Buffer.from("%PDF-1.4\nwrong\n%%EOF\n");
      },
    });
    await expect(result).rejects.toThrow("checksum does not match");
    expect(io.puts).toEqual([]);
    expect(io.downloads).not.toContain(sourceKey);
  });

  it("retries a missing backup and does not substitute another file", async () => {
    let calls = 0;
    const { io, result } = recover({
      async downloadEncrypted() {
        calls += 1;
        return null;
      },
    });
    await expect(result).rejects.toThrow("backup is missing");
    expect(calls).toBe(backupLimits.maxAttempts);
    expect(io.puts).toEqual([]);
  });

  it("retries a decryption failure", async () => {
    let calls = 0;
    const { result } = recover({
      async decrypt(bytes) {
        if (bytes.equals(manifestCiphertext)) return manifest();
        calls += 1;
        throw new Error("age rejected the ciphertext");
      },
    });
    await expect(result).rejects.toThrow("could not decrypt");
    expect(calls).toBe(backupLimits.maxAttempts);
  });

  it("rejects a backup object for a different statement", async () => {
    const { io, result } = recover({
      async decrypt(bytes) {
        if (bytes.equals(manifestCiphertext)) {
          return manifest({
            destinationKey: "test/statements/objects/2026-11-23/20261123T173000Z/ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff.pdf.age",
          });
        }
        return pdf;
      },
    });
    await expect(result).rejects.toThrow("not this run's restored PDF");
    expect(io.downloads).toEqual([manifestKey]);
    expect(io.puts).toEqual([]);
  });

  it("refuses to overwrite an existing restored PDF", async () => {
    const { io, result } = recover({
      async restoreExists() {
        return true;
      },
    });
    await expect(result).rejects.toThrow("existing restored statement");
    expect(io.downloads).toEqual([]);
    expect(io.puts).toEqual([]);
  });

  it("rejects the rehearsal bucket and a stored total over 8 GiB", async () => {
    await expect(
      executeStatementRecovery({
        sourceBucket: "bits-statements-test-hrqzaa",
        runId: preparedStatementRecoveryRunId,
        manifestKey,
        apply: false,
        clients: clients().api,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow(BackupGuardError);

    const { result } = recover({}, { existingBucketBytes: backupLimits.maxStoredTotalBytes });
    await expect(result).rejects.toThrow("8 GiB");
  });

  it("stops when the recovery timeout is reached", async () => {
    const { result } = recover(
      {
        async downloadEncrypted(_key, signal) {
          await new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new BackupGuardError("stopped")), { once: true });
          });
          return null;
        },
      },
      { timeoutMs: 20 },
    );
    await expect(result).rejects.toThrow("timed out");
  });

  it("recovers from the renewed copy after the older backup expires", async () => {
    const runId = "175b63ed-d44d-432e-867f-504064727ce9";
    const now = new Date("2026-11-24T12:15:00.000Z");
    const dayMs = 24 * 60 * 60 * 1000;
    const expiredAt = new Date(now.getTime() - 91 * dayMs);
    const sourceKey = statementRehearsalSourceKey(runId);
    const pdfBytes = statementRehearsalPdf();
    const sourceSha256 = sha256(pdfBytes);
    const expiredKey = statementBackupObjectKey(expiredAt, sourceKey);
    const renewedKey = statementBackupObjectKey(now, sourceKey);
    const renewedManifest = statementManifestKey(now);
    const expiredManifest = statementManifestKey(expiredAt);
    const retained = [
      { key: expiredKey, sourceKeySha256: sha256(sourceKey), sourceSha256 },
      { key: renewedKey, sourceKeySha256: sha256(sourceKey), sourceSha256 },
    ];
    expect(statementBackupIsExpired(expiredAt, now)).toBe(true);
    expect(newestRetainedStatementBackup(retained, sourceKey, sourceSha256, now)?.key).toBe(renewedKey);
    expect(newestRetainedStatementBackup([retained[0]], sourceKey, sourceSha256, now)).toBeNull();

    const ciphertext = Buffer.from("renewed-ciphertext");
    const manifestBody = Buffer.from(JSON.stringify({
      version: 1,
      sourceBucket,
      objects: [{
        sourceKey,
        sourceSha256,
        sourceBytes: pdfBytes.byteLength,
        destinationKey: renewedKey,
        ciphertextSha256: sha256(ciphertext),
      }],
    }));
    const downloads: string[] = [];
    const puts: string[] = [];
    const restored = await executeStatementRecovery({
      sourceBucket,
      runId,
      manifestKey: renewedManifest,
      apply: true,
      sleep: async () => undefined,
      clients: {
        async downloadEncrypted(key) {
          downloads.push(key);
          if (key === renewedManifest) return Buffer.from("manifest-cipher");
          if (key === renewedKey) return ciphertext;
          return null;
        },
        async decrypt(bytes) {
          if (bytes.equals(Buffer.from("manifest-cipher"))) return manifestBody;
          if (bytes.equals(ciphertext)) return pdfBytes;
          throw new Error("unexpected ciphertext");
        },
        async restoreExists() {
          return false;
        },
        async putRestore(key) {
          puts.push(key);
        },
      },
    });
    expect(restored).toMatchObject({
      outcome: "restored",
      backupKey: renewedKey,
      checksumMatched: true,
      usedApplicationOriginal: false,
      deletes: false,
      recoveryProof: true,
    });
    expect(downloads).toEqual([renewedManifest, renewedKey]);
    expect(downloads).not.toContain(sourceKey);
    expect(downloads).not.toContain(expiredKey);
    expect(puts).toEqual([statementRehearsalRestoreKey(runId)]);

    const expiredDownloads: string[] = [];
    await expect(executeStatementRecovery({
      sourceBucket,
      runId,
      manifestKey: expiredManifest,
      apply: true,
      sleep: async () => undefined,
      clients: {
        async downloadEncrypted(key) {
          expiredDownloads.push(key);
          return null;
        },
        async decrypt() {
          throw new Error("expired copy was decrypted");
        },
        async restoreExists() {
          return false;
        },
        async putRestore() {
          throw new Error("expired copy was restored");
        },
      },
    })).rejects.toThrow("backup is missing");
    expect(expiredDownloads).not.toContain(sourceKey);
    expect(expiredDownloads).not.toContain(renewedKey);
  });
});
