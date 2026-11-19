import { createHash } from "node:crypto";

import { STATEMENT_PDF_MAX_BYTES, STATEMENT_PDF_PROBE_ORGANIZATION_ID } from "../storage/statement-pdf-config";
import { logicalStatementPdfObjectKey } from "../storage/statement-pdf-ref";

import {
  BackupGuardError,
  assertAgeRecipient,
  assertUploadAllowed,
  backupLimits,
  independentBackupBucket,
  withBackupTimeout,
  withBoundedRetries,
} from "./independent-backup-guard";
import { approvedAgeRecipient, redactBackupError } from "./independent-backup-railway-once";

export const statementAppBucketDisplayName = "bits-statements-app-test";
export const rehearsalStatementBucketName = "bits-statements-test-hrqzaa";
export const statementAppEndpoint = "https://t3.storageapi.dev";
export const statementRehearsalRunId = "00000000-0000-4000-8000-00000000a104";
export const statementRehearsalNow = "2026-11-18T19:30:00.000Z";
export const statementCopyLockDays = 90;
export const statementCopyExpireEligibleDays = 91;

const privateKeyVariableNames = ["AGE_IDENTITY", "AGE_SECRET_KEY", "BITS_BACKUP_AGE_IDENTITY"];
const pdfMagic = Buffer.from("%PDF-", "ascii");
const statementKeyPattern =
  /^private\/statements\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[^/]+\.pdf$/i;

export type StatementSourceObject = {
  key: string;
  bytes: Buffer;
};

export type StoredStatementCopy = {
  key: string;
  size: number;
  sourceKeySha256?: string;
  sourceSha256?: string;
};

export type StatementCopyReport = {
  outcome: "empty" | "unchanged" | "planned" | "copied" | "missing-rehearsal-pdf" | "unconfigured";
  pdfsPresent: number;
  copied: number;
  unchanged: number;
  retainedAbsentSources: number;
  recoveryProof: false;
  deletes: false;
  upload: boolean;
  scheduleEnabled: false;
  weeklyDatabaseImplemented: false;
  statementScheduleEnabled: false;
  destinationKeys: string[];
  manifestKey: string | null;
  sourceBucket: string | null;
  destinationBucket: typeof independentBackupBucket;
  lockDays: typeof statementCopyLockDays;
  expireEligibleDays: typeof statementCopyExpireEligibleDays;
  label: string;
};

export type StatementCopyClients = {
  listSource: (signal: AbortSignal) => Promise<StatementSourceObject[]>;
  listDestination: (signal: AbortSignal) => Promise<{ objects: StoredStatementCopy[]; totalBytes: number }>;
  putDestination: (
    input: { key: string; body: Buffer; metadata: Record<string, string> },
    signal: AbortSignal,
  ) => Promise<void>;
  encrypt: (bytes: Buffer, signal: AbortSignal) => Promise<Buffer>;
};

export function sha256(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function statementRehearsalSourceKey() {
  return logicalStatementPdfObjectKey(
    STATEMENT_PDF_PROBE_ORGANIZATION_ID,
    statementRehearsalRunId,
    "probe.pdf",
  );
}

export function statementRehearsalRestoreKey() {
  return logicalStatementPdfObjectKey(
    STATEMENT_PDF_PROBE_ORGANIZATION_ID,
    statementRehearsalRunId,
    "restored.pdf",
  );
}

export function statementRehearsalPdf() {
  return Buffer.from(`%PDF-1.4\nprobe-${statementRehearsalRunId}\n%%EOF\n`, "utf8");
}

export function assertStatementAppBucket(bucket: string) {
  const name = bucket.trim();
  if (name === independentBackupBucket) {
    throw new BackupGuardError("The statement source cannot be the independent backup bucket.");
  }
  if (name === rehearsalStatementBucketName) {
    throw new BackupGuardError("The rehearsal bucket cannot be the application statement bucket.");
  }
  if (!/^bits-statements-app-test-[a-z0-9]+$/.test(name)) {
    throw new BackupGuardError(
      "The application statement bucket must be the bits-statements-app-test bucket assigned by Railway.",
    );
  }
  return name;
}

export function assertStatementSourceKey(key: string) {
  const match = statementKeyPattern.exec(key);
  if (!match) {
    throw new BackupGuardError("A statement source key is outside private/statements.");
  }
  return key;
}

export function statementBackupObjectKey(now: Date, sourceKey: string) {
  if (Number.isNaN(now.getTime())) {
    throw new BackupGuardError("Statement copy time is invalid.");
  }
  const sourceKeySha256 = sha256(assertStatementSourceKey(sourceKey));
  const day = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `test/statements/objects/${day}/${stamp}/${sourceKeySha256}.pdf.age`;
}

export function statementManifestKey(now: Date) {
  if (Number.isNaN(now.getTime())) {
    throw new BackupGuardError("Statement copy time is invalid.");
  }
  const day = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `test/statements/manifests/${day}/${stamp}.json.age`;
}

export function redactStatementCopyError(error: unknown, secrets: readonly string[]) {
  return secrets.reduce((message, secret) => {
    if (secret.trim().length < 8) return message;
    return message.split(secret).join("[redacted]");
  }, redactBackupError(error));
}

export function assertStatementCopyEnvironment(env: Record<string, string | undefined>) {
  for (const name of privateKeyVariableNames) {
    if (env[name]) {
      throw new BackupGuardError("Refusing to copy statements with an age private-key variable set.");
    }
  }
  for (const value of Object.values(env)) {
    if (value?.includes("AGE-SECRET-KEY-")) {
      throw new BackupGuardError("Refusing to copy statements with an age private key in the environment.");
    }
  }
  const recipient = assertAgeRecipient(env.BITS_BACKUP_AGE_RECIPIENT);
  if (recipient !== approvedAgeRecipient) {
    throw new BackupGuardError("The age recipient does not match the approved public recipient.");
  }
  const sourceBucket = assertStatementAppBucket(env.BITS_STATEMENT_S3_BUCKET ?? "");
  if ((env.BITS_STATEMENT_S3_REGION ?? "").trim() !== "auto") {
    throw new BackupGuardError("The statement source region must be auto.");
  }
  const sourceEndpoint = (env.BITS_STATEMENT_S3_ENDPOINT ?? "").trim();
  if (sourceEndpoint !== statementAppEndpoint) {
    throw new BackupGuardError("The statement source endpoint is not the Railway bucket endpoint.");
  }
  if ((env.BITS_STATEMENT_S3_FORCE_PATH_STYLE ?? "").trim() === "1") {
    throw new BackupGuardError("The Railway statement bucket uses virtual-hosted URLs.");
  }
  const sourceAccessKeyId = env.BITS_BACKUP_STATEMENT_SOURCE_ACCESS_KEY_ID?.trim() ?? "";
  const sourceSecret = env.BITS_BACKUP_STATEMENT_SOURCE_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!sourceAccessKeyId || !sourceSecret) {
    throw new BackupGuardError("The statement source credential is incomplete.");
  }
  if (env.BITS_BACKUP_R2_BUCKET !== independentBackupBucket) {
    throw new BackupGuardError("The statement copy destination is not bits-independent-backups.");
  }
  const destinationEndpoint = env.BITS_BACKUP_R2_ENDPOINT?.trim() ?? "";
  if (!destinationEndpoint.startsWith("https://") || !destinationEndpoint.endsWith(".r2.cloudflarestorage.com")) {
    throw new BackupGuardError("The R2 endpoint is not the approved Cloudflare endpoint.");
  }
  const destinationAccessKeyId = env.BITS_BACKUP_R2_ACCESS_KEY_ID?.trim() ?? "";
  const destinationSecret = env.BITS_BACKUP_R2_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!destinationAccessKeyId || !destinationSecret) {
    throw new BackupGuardError("The independent-backup upload credential is incomplete.");
  }
  if (sourceAccessKeyId === destinationAccessKeyId || sourceSecret === destinationSecret) {
    throw new BackupGuardError("The statement source credential must not be the independent-backup upload credential.");
  }
  return {
    recipient,
    sourceBucket,
    sourceEndpoint,
    sourceAccessKeyId,
    sourceSecret,
    destinationBucket: independentBackupBucket,
    destinationEndpoint,
    destinationAccessKeyId,
    destinationSecret,
  };
}

function reportBase(
  outcome: StatementCopyReport["outcome"],
  input: {
    pdfsPresent: number;
    copied: number;
    unchanged: number;
    retainedAbsentSources: number;
    upload: boolean;
    destinationKeys: string[];
    manifestKey: string | null;
    sourceBucket: string | null;
    label: string;
  },
): StatementCopyReport {
  return {
    outcome,
    pdfsPresent: input.pdfsPresent,
    copied: input.copied,
    unchanged: input.unchanged,
    retainedAbsentSources: input.retainedAbsentSources,
    recoveryProof: false,
    deletes: false,
    upload: input.upload,
    scheduleEnabled: false,
    weeklyDatabaseImplemented: false,
    statementScheduleEnabled: false,
    destinationKeys: input.destinationKeys,
    manifestKey: input.manifestKey,
    sourceBucket: input.sourceBucket,
    destinationBucket: independentBackupBucket,
    lockDays: statementCopyLockDays,
    expireEligibleDays: statementCopyExpireEligibleDays,
    label: input.label,
  };
}

function assertPdf(bytes: Buffer) {
  if (bytes.byteLength <= 0 || bytes.byteLength > STATEMENT_PDF_MAX_BYTES) {
    throw new BackupGuardError("A statement PDF is empty or larger than 15 MiB.");
  }
  if (!bytes.subarray(0, pdfMagic.length).equals(pdfMagic)) {
    throw new BackupGuardError("A statement object is not a PDF.");
  }
}

export function statementRehearsalProposal() {
  const now = new Date(statementRehearsalNow);
  const sourceKey = statementRehearsalSourceKey();
  const pdf = statementRehearsalPdf();
  return {
    sourceBucketDisplayName: statementAppBucketDisplayName,
    sourceBucketApiName: "assigned by Railway when the bucket is created",
    sourceKey,
    restoreKey: statementRehearsalRestoreKey(),
    sourceSha256: sha256(pdf),
    sourceBytes: pdf.byteLength,
    destinationKey: statementBackupObjectKey(now, sourceKey),
    manifestKey: statementManifestKey(now),
    lockDays: statementCopyLockDays,
    expireEligibleDays: statementCopyExpireEligibleDays,
    appObjectsDeletableAfterVerification: true,
    independentObjectsDeletableNow: false,
    recoveryProof: false,
    scheduleEnabled: false,
  };
}

export async function executeStatementCopy(input: {
  sourceBucket: string;
  now: Date;
  apply: boolean;
  rehearsal: boolean;
  existingBucketBytes?: number;
  timeoutMs?: number;
  clients: StatementCopyClients;
  sleep?: (delayMs: number) => Promise<void>;
}) {
  const sourceBucket = assertStatementAppBucket(input.sourceBucket);
  return withBackupTimeout(async (signal) => {
    const guarded = <T>(operation: (child: AbortSignal) => Promise<T>) =>
      withBoundedRetries(() => withBackupTimeout(operation, { signal }), { signal, sleep: input.sleep });
    const sources = await guarded((child) => input.clients.listSource(child));
    if (sources.length > backupLimits.maxStatementObjects) {
      throw new BackupGuardError("Statement copy exceeds 1,000 objects.");
    }
    const rehearsalKey = statementRehearsalSourceKey();
    if (input.rehearsal && sources.some((source) => source.key !== rehearsalKey)) {
      throw new BackupGuardError("The statement rehearsal refuses every object except its synthetic PDF.");
    }
    if (input.rehearsal && sources.length === 0) {
      return reportBase("missing-rehearsal-pdf", {
        pdfsPresent: 0,
        copied: 0,
        unchanged: 0,
        retainedAbsentSources: 0,
        upload: false,
        destinationKeys: [],
        manifestKey: null,
        sourceBucket,
        label: "0 PDFs present. This is not statement recovery.",
      });
    }
    for (const source of sources) {
      assertStatementSourceKey(source.key);
      assertPdf(source.bytes);
    }
    const sourceBytes = sources.reduce((total, source) => total + source.bytes.byteLength, 0);
    if (sourceBytes > backupLimits.maxStatementBytes) {
      throw new BackupGuardError("Statement copy exceeds 1 GiB.");
    }
    const destination = await guarded((child) => input.clients.listDestination(child));
    const existingKeys = new Set(destination.objects.map((object) => object.key));
    const knownCopies = new Map<string, Set<string>>();
    for (const object of destination.objects) {
      if (!object.sourceKeySha256 || !object.sourceSha256) continue;
      const checksums = knownCopies.get(object.sourceKeySha256) ?? new Set<string>();
      checksums.add(object.sourceSha256);
      knownCopies.set(object.sourceKeySha256, checksums);
    }
    const currentHashes = new Set(sources.map((source) => sha256(source.key)));
    let retainedAbsentSources = 0;
    for (const sourceKeySha256 of knownCopies.keys()) {
      if (!currentHashes.has(sourceKeySha256)) retainedAbsentSources += 1;
    }
    const copies: Array<{ source: StatementSourceObject; destinationKey: string; sourceSha256: string }> = [];
    let unchanged = 0;
    for (const source of sources) {
      const sourceSha256 = sha256(source.bytes);
      const sourceKeySha256 = sha256(source.key);
      if (knownCopies.get(sourceKeySha256)?.has(sourceSha256)) {
        unchanged += 1;
        continue;
      }
      const destinationKey = statementBackupObjectKey(input.now, source.key);
      if (existingKeys.has(destinationKey) || copies.some((copy) => copy.destinationKey === destinationKey)) {
        throw new BackupGuardError("Refusing to overwrite an existing statement backup.");
      }
      copies.push({ source, destinationKey, sourceSha256 });
    }
    if (sources.length === 0) {
      return reportBase("empty", {
        pdfsPresent: 0,
        copied: 0,
        unchanged: 0,
        retainedAbsentSources,
        upload: false,
        destinationKeys: [],
        manifestKey: null,
        sourceBucket,
        label: "0 PDFs present. This is not statement recovery.",
      });
    }
    if (copies.length === 0) {
      return reportBase("unchanged", {
        pdfsPresent: sources.length,
        copied: 0,
        unchanged,
        retainedAbsentSources,
        upload: false,
        destinationKeys: [],
        manifestKey: null,
        sourceBucket,
        label: "Unchanged statement PDFs were not copied again.",
      });
    }
    const manifestKey = statementManifestKey(input.now);
    if (existingKeys.has(manifestKey)) {
      throw new BackupGuardError("Refusing to overwrite an existing statement manifest.");
    }
    const estimatedIncoming = copies.reduce((total, copy) => total + copy.source.bytes.byteLength + 4096, 65_536);
    assertUploadAllowed({
      kind: "statements",
      statementObjects: copies.length + 1,
      statementBytes: sourceBytes,
      existingBucketBytes: input.existingBucketBytes ?? destination.totalBytes,
      incomingBytes: estimatedIncoming,
    });
    if (!input.apply) {
      return reportBase("planned", {
        pdfsPresent: sources.length,
        copied: 0,
        unchanged,
        retainedAbsentSources,
        upload: false,
        destinationKeys: copies.map((copy) => copy.destinationKey),
        manifestKey,
        sourceBucket,
        label: "Dry run. No statement backup was uploaded.",
      });
    }
    const manifestObjects: Array<Record<string, string | number>> = [];
    const destinationKeys: string[] = [];
    for (const copy of copies) {
      const encrypted = await guarded((child) => input.clients.encrypt(copy.source.bytes, child));
      const ciphertextSha256 = sha256(encrypted);
      assertUploadAllowed({
        kind: "statements",
        statementObjects: 1,
        statementBytes: encrypted.byteLength,
        existingBucketBytes: input.existingBucketBytes ?? destination.totalBytes,
        incomingBytes: encrypted.byteLength,
      });
      await guarded((child) =>
        input.clients.putDestination(
          {
            key: copy.destinationKey,
            body: encrypted,
            metadata: {
              "source-key-sha256": sha256(copy.source.key),
              "source-sha256": copy.sourceSha256,
              "ciphertext-sha256": ciphertextSha256,
            },
          },
          child,
        ),
      );
      destinationKeys.push(copy.destinationKey);
      manifestObjects.push({
        sourceKey: copy.source.key,
        sourceSha256: copy.sourceSha256,
        sourceBytes: copy.source.bytes.byteLength,
        destinationKey: copy.destinationKey,
        ciphertextSha256,
      });
    }
    const manifest = Buffer.from(
      JSON.stringify({
        version: 1,
        sourceBucket,
        objects: manifestObjects,
      }),
      "utf8",
    );
    const encryptedManifest = await guarded((child) => input.clients.encrypt(manifest, child));
    await guarded((child) =>
      input.clients.putDestination(
        {
          key: manifestKey,
          body: encryptedManifest,
          metadata: { "ciphertext-sha256": sha256(encryptedManifest) },
        },
        child,
      ),
    );
    if (destinationKeys.length !== copies.length) {
      throw new BackupGuardError("The statement copy stopped before every PDF was stored.");
    }
    return reportBase("copied", {
      pdfsPresent: sources.length,
      copied: destinationKeys.length,
      unchanged,
      retainedAbsentSources,
      upload: true,
      destinationKeys,
      manifestKey,
      sourceBucket,
      label: "Encrypted statement copies were stored. This is not signed-in statement acceptance.",
    });
  }, { timeoutMs: input.timeoutMs });
}
