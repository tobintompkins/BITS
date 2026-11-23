import { timingSafeEqual } from "node:crypto";

import { STATEMENT_PDF_MAX_BYTES } from "../storage/statement-pdf-config";

import {
  BackupGuardError,
  assertUploadAllowed,
  withBackupTimeout,
  withBoundedRetries,
} from "./independent-backup-guard";
import {
  assertStatementAppBucket,
  assertStatementRehearsalRunId,
  sha256,
  statementRehearsalRestoreKey,
  statementRehearsalSourceKey,
} from "./independent-statement-copy";

export const preparedStatementRecoveryRunId = "175b63ed-d44d-432e-867f-504064727ce8";
export const preparedStatementRecoverySha256 =
  "97681accf653a86d4aefc839c75c60e2b1d30f2032d182f19fc4c37dd67e27fc";
export const preparedStatementRecoveryBytes = 1106;

const pdfMagic = Buffer.from("%PDF-", "ascii");
const manifestKeyPattern =
  /^test\/statements\/manifests\/\d{4}-\d{2}-\d{2}\/\d{8}T\d{6}Z\.json\.age$/;

export type StatementRecoveryReport = {
  outcome: "planned" | "restored";
  runId: string;
  sourceKey: string;
  restoreKey: string;
  manifestKey: string;
  backupKey: string;
  sourceSha256: string;
  checksumMatched: true;
  usedApplicationOriginal: false;
  upload: boolean;
  deletes: false;
  scheduleEnabled: false;
  recoveryProof: boolean;
};

export type StatementRecoveryClients = {
  downloadEncrypted: (key: string, signal: AbortSignal) => Promise<Buffer | null>;
  decrypt: (ciphertext: Buffer, signal: AbortSignal) => Promise<Buffer>;
  restoreExists: (key: string, signal: AbortSignal) => Promise<boolean>;
  putRestore: (key: string, body: Buffer, signal: AbortSignal) => Promise<void>;
};

type ManifestObject = {
  sourceKey: string;
  sourceSha256: string;
  sourceBytes: number;
  destinationKey: string;
  ciphertextSha256: string;
};

function sameHex(left: string, right: string) {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedLeft) || !/^[0-9a-f]{64}$/.test(normalizedRight)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(normalizedLeft, "hex"), Buffer.from(normalizedRight, "hex"));
}

function assertManifestKey(manifestKey: string) {
  if (!manifestKeyPattern.test(manifestKey)) {
    throw new BackupGuardError("The statement manifest key is outside test/statements/manifests.");
  }
  return manifestKey;
}

function assertBackupObjectKey(sourceKey: string, destinationKey: string) {
  const sourceKeySha256 = sha256(sourceKey);
  const pattern = new RegExp(
    `^test/statements/objects/\\d{4}-\\d{2}-\\d{2}/\\d{8}T\\d{6}Z/${sourceKeySha256}\\.pdf\\.age$`,
  );
  if (!pattern.test(destinationKey)) {
    throw new BackupGuardError("Statement recovery destination is not this run's restored PDF.");
  }
  return destinationKey;
}

function parseManifest(bytes: Buffer, sourceKey: string): ManifestObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new BackupGuardError("The statement manifest could not be read.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new BackupGuardError("The statement manifest could not be read.");
  }
  const objects = (parsed as { objects?: unknown }).objects;
  if (!Array.isArray(objects) || objects.length !== 1) {
    throw new BackupGuardError("The statement manifest could not be read.");
  }
  const object = objects[0] as Partial<ManifestObject>;
  if (
    object.sourceKey !== sourceKey ||
    typeof object.sourceSha256 !== "string" ||
    typeof object.destinationKey !== "string" ||
    typeof object.ciphertextSha256 !== "string" ||
    !Number.isSafeInteger(object.sourceBytes)
  ) {
    throw new BackupGuardError("The statement manifest could not be read.");
  }
  return {
    sourceKey,
    sourceSha256: object.sourceSha256,
    sourceBytes: object.sourceBytes as number,
    destinationKey: object.destinationKey,
    ciphertextSha256: object.ciphertextSha256,
  };
}

function assertRecoveredPdf(bytes: Buffer, expectedSha256: string, expectedBytes: number) {
  if (bytes.byteLength <= 0 || bytes.byteLength > STATEMENT_PDF_MAX_BYTES) {
    throw new BackupGuardError("A statement PDF is empty or larger than 15 MiB.");
  }
  if (!bytes.subarray(0, pdfMagic.length).equals(pdfMagic)) {
    throw new BackupGuardError("A statement object is not a PDF.");
  }
  if (bytes.byteLength !== expectedBytes || !sameHex(sha256(bytes), expectedSha256)) {
    throw new BackupGuardError("The recovered statement checksum does not match.");
  }
}

export async function executeStatementRecovery(input: {
  sourceBucket: string;
  runId: string;
  manifestKey: string;
  apply: boolean;
  existingBucketBytes?: number;
  timeoutMs?: number;
  clients: StatementRecoveryClients;
  sleep?: (delayMs: number) => Promise<void>;
}) {
  assertStatementAppBucket(input.sourceBucket);
  const runId = assertStatementRehearsalRunId(input.runId);
  const sourceKey = statementRehearsalSourceKey(runId);
  const restoreKey = statementRehearsalRestoreKey(runId);
  const manifestKey = assertManifestKey(input.manifestKey);

  return withBackupTimeout(async (signal) => {
    const guarded = <T>(operation: (child: AbortSignal) => Promise<T>) =>
      withBoundedRetries(() => withBackupTimeout(operation, { signal }), {
        signal,
        sleep: input.sleep,
      });
    const download = async (key: string) => {
      if (key === sourceKey || key === restoreKey) {
        throw new BackupGuardError("Statement recovery cannot read the application copy.");
      }
      return guarded(async (child) => {
        const downloaded = await input.clients.downloadEncrypted(key, child);
        if (!downloaded || downloaded.byteLength === 0) {
          throw new BackupGuardError("The independent statement backup is missing.");
        }
        return downloaded;
      });
    };

    if (await guarded((child) => input.clients.restoreExists(restoreKey, child))) {
      throw new BackupGuardError("Refusing to overwrite an existing restored statement.");
    }

    const manifestCiphertext = await download(manifestKey);
    const manifestPlain = await guarded(async (child) => {
      try {
        return await input.clients.decrypt(manifestCiphertext, child);
      } catch (error) {
        if (error instanceof BackupGuardError) throw error;
        throw new BackupGuardError("Statement recovery could not decrypt the backup.");
      }
    });
    const manifest = parseManifest(manifestPlain, sourceKey);
    const backupKey = assertBackupObjectKey(sourceKey, manifest.destinationKey);
    if (backupKey === sourceKey || backupKey === restoreKey || backupKey === manifestKey) {
      throw new BackupGuardError("Statement recovery destination is not this run's restored PDF.");
    }

    const pdfCiphertext = await download(backupKey);
    if (!sameHex(sha256(pdfCiphertext), manifest.ciphertextSha256)) {
      throw new BackupGuardError("The recovered statement checksum does not match.");
    }
    const pdf = await guarded(async (child) => {
      try {
        return await input.clients.decrypt(pdfCiphertext, child);
      } catch (error) {
        if (error instanceof BackupGuardError) throw error;
        throw new BackupGuardError("Statement recovery could not decrypt the backup.");
      }
    });
    if (runId === preparedStatementRecoveryRunId && !sameHex(manifest.sourceSha256, preparedStatementRecoverySha256)) {
      throw new BackupGuardError("The recovered statement checksum does not match.");
    }
    assertRecoveredPdf(pdf, manifest.sourceSha256, manifest.sourceBytes);
    assertUploadAllowed({
      kind: "statements",
      statementObjects: 1,
      statementBytes: pdf.byteLength,
      existingBucketBytes: input.existingBucketBytes ?? 0,
      incomingBytes: pdf.byteLength,
    });

    if (await guarded((child) => input.clients.restoreExists(restoreKey, child))) {
      throw new BackupGuardError("Refusing to overwrite an existing restored statement.");
    }
    if (!input.apply) {
      return {
        outcome: "planned" as const,
        runId,
        sourceKey,
        restoreKey,
        manifestKey,
        backupKey,
        sourceSha256: manifest.sourceSha256,
        checksumMatched: true as const,
        usedApplicationOriginal: false as const,
        upload: false,
        deletes: false as const,
        scheduleEnabled: false as const,
        recoveryProof: false,
      };
    }

    await guarded(async (child) => {
      if (restoreKey !== statementRehearsalRestoreKey(runId)) {
        throw new BackupGuardError("Statement recovery destination is not this run's restored PDF.");
      }
      await input.clients.putRestore(restoreKey, pdf, child);
    });
    return {
      outcome: "restored" as const,
      runId,
      sourceKey,
      restoreKey,
      manifestKey,
      backupKey,
      sourceSha256: sha256(pdf),
      checksumMatched: true as const,
      usedApplicationOriginal: false as const,
      upload: true,
      deletes: false as const,
      scheduleEnabled: false as const,
      recoveryProof: true,
    };
  }, { timeoutMs: input.timeoutMs });
}
