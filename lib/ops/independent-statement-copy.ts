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
export const statementCopyRenewalLeadDays = 7;

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
  ciphertextSha256?: string;
};

export type StatementCopyFailure = {
  sourceKey: string;
  reason: "copy" | "verification" | "overwrite";
};

export type StatementCopyReport = {
  outcome: "empty" | "unchanged" | "planned" | "copied" | "failed" | "missing-rehearsal-pdf" | "unconfigured";
  pdfsPresent: number;
  copied: number;
  unchanged: number;
  renewed: number;
  failed: number;
  failedFiles: StatementCopyFailure[];
  retainedAbsentSources: number;
  verified: boolean;
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
  confirmStored?: (
    key: string,
    signal: AbortSignal,
  ) => Promise<{ sourceKeySha256?: string; sourceSha256?: string; ciphertextSha256?: string } | null>;
};

const statementObjectKeyPattern =
  /^test\/statements\/objects\/\d{4}-\d{2}-\d{2}\/\d{8}T\d{6}Z\/[0-9a-f]{64}\.pdf\.age$/;
const statementManifestKeyPattern =
  /^test\/statements\/manifests\/\d{4}-\d{2}-\d{2}\/\d{8}T\d{6}Z\.json\.age$/;

export function sha256(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

const statementRunIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertStatementRehearsalRunId(runId: string) {
  if (!statementRunIdPattern.test(runId)) {
    throw new BackupGuardError("Statement rehearsal run ID must be a UUID.");
  }
  return runId;
}

export function statementRehearsalSourceKey(runId = statementRehearsalRunId) {
  return logicalStatementPdfObjectKey(
    STATEMENT_PDF_PROBE_ORGANIZATION_ID,
    assertStatementRehearsalRunId(runId),
    "probe.pdf",
  );
}

export function statementRehearsalRestoreKey(runId = statementRehearsalRunId) {
  return logicalStatementPdfObjectKey(
    STATEMENT_PDF_PROBE_ORGANIZATION_ID,
    assertStatementRehearsalRunId(runId),
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

export function assertStatementDestinationKey(key: string) {
  if (!statementObjectKeyPattern.test(key) && !statementManifestKeyPattern.test(key)) {
    throw new BackupGuardError("The statement backup destination is outside test/statements.");
  }
  return key;
}

export function statementCopyExitCode(report: Pick<StatementCopyReport, "outcome">) {
  if (report.outcome === "failed") return 1;
  if (report.outcome === "missing-rehearsal-pdf" || report.outcome === "unconfigured") return 2;
  return 0;
}

export function assertStatementInvocation(flags: {
  rehearsal: boolean;
  scheduled: boolean;
  recover: boolean;
  delete: boolean;
  schedule: boolean;
}) {
  if (flags.delete || flags.schedule) {
    throw new BackupGuardError("The statement copy does not delete objects or enable a schedule.");
  }
  if (flags.scheduled && flags.rehearsal) {
    throw new BackupGuardError("A scheduled statement backup is not the recovery rehearsal.");
  }
  if (flags.scheduled && flags.recover) {
    throw new BackupGuardError("A scheduled statement backup does not restore a PDF.");
  }
}

export const statementBackupSchedulePlan = {
  project: "bits-test",
  projectId: "bd76fc8a-0408-443d-a2d4-7dfd2fbdde9c",
  environment: "test",
  environmentId: "6dfca267-20cf-419d-8c3a-1297737b1b86",
  serviceName: "bits-test-statement-backup",
  serviceId: null,
  scheduleUtc: "15 12 * * *",
  scheduleEnabled: false,
  statementScheduleEnabled: false,
  command: "npm run backup:statements -- --scheduled --apply",
  databaseServiceName: "bits-test-backup",
  databaseServiceId: "0f68511a-a35d-4d0a-af5c-48b9a0e93265",
  databaseScheduleUtc: "15 11 * * *",
  watchWorkflow: ".github/workflows/bits-test-backup-watch.yml",
  watchScheduleUtc: "45 11 * * *",
  sourceBucketApiName: "bits-statements-app-test-zxau99",
  destinationBucket: independentBackupBucket,
  lockDays: statementCopyLockDays,
  expireEligibleDays: statementCopyExpireEligibleDays,
  renewalLeadDays: statementCopyRenewalLeadDays,
  privateKeyAccepted: false,
} as const;

export function statementBackupObjectKey(now: Date, sourceKey: string) {
  if (Number.isNaN(now.getTime())) {
    throw new BackupGuardError("Statement copy time is invalid.");
  }
  const sourceKeySha256 = sha256(assertStatementSourceKey(sourceKey));
  const day = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `test/statements/objects/${day}/${stamp}/${sourceKeySha256}.pdf.age`;
}

const statementBackupStampPattern =
  /^test\/statements\/objects\/\d{4}-\d{2}-\d{2}\/(\d{8}T\d{6}Z)\/[0-9a-f]{64}\.pdf\.age$/;
const dayMs = 24 * 60 * 60 * 1000;

export function statementBackupStoredAt(key: string) {
  const stamp = statementBackupStampPattern.exec(key)?.[1];
  if (!stamp) return null;
  const storedAt = new Date(
    `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`,
  );
  return Number.isNaN(storedAt.getTime()) ? null : storedAt;
}

export function statementBackupNeedsRenewal(storedAt: Date | null, now: Date) {
  if (!storedAt || Number.isNaN(storedAt.getTime()) || Number.isNaN(now.getTime())) return false;
  const renewAfterDays = statementCopyExpireEligibleDays - statementCopyRenewalLeadDays;
  return now.getTime() - storedAt.getTime() >= renewAfterDays * dayMs;
}

export function statementBackupIsExpired(storedAt: Date | null, now: Date) {
  if (!storedAt || Number.isNaN(storedAt.getTime()) || Number.isNaN(now.getTime())) return false;
  return now.getTime() - storedAt.getTime() >= statementCopyExpireEligibleDays * dayMs;
}

export function newestRetainedStatementBackup(
  objects: ReadonlyArray<{ key: string; sourceKeySha256?: string; sourceSha256?: string }>,
  sourceKey: string,
  sourceSha256: string,
  now: Date,
) {
  const sourceKeySha256 = sha256(sourceKey);
  let newest: { key: string; storedAt: Date } | null = null;
  for (const object of objects) {
    if (object.sourceKeySha256 !== sourceKeySha256 || object.sourceSha256 !== sourceSha256) continue;
    const storedAt = statementBackupStoredAt(object.key);
    if (!storedAt || statementBackupIsExpired(storedAt, now)) continue;
    if (!newest || storedAt > newest.storedAt) newest = { key: object.key, storedAt };
  }
  return newest;
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
    renewed?: number;
    retainedAbsentSources: number;
    upload: boolean;
    destinationKeys: string[];
    manifestKey: string | null;
    sourceBucket: string | null;
    label: string;
    failedFiles?: StatementCopyFailure[];
    verified?: boolean;
  },
): StatementCopyReport {
  const failedFiles = input.failedFiles ?? [];
  return {
    outcome,
    pdfsPresent: input.pdfsPresent,
    copied: input.copied,
    unchanged: input.unchanged,
    renewed: input.renewed ?? 0,
    failed: failedFiles.length,
    failedFiles,
    retainedAbsentSources: input.retainedAbsentSources,
    verified: input.verified ?? false,
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

function copyFailureReason(error: unknown): StatementCopyFailure["reason"] {
  if (error instanceof BackupGuardError && error.message.includes("overwrite")) return "overwrite";
  return "copy";
}

function isBackupTimeout(error: unknown) {
  return error instanceof BackupGuardError && error.message.includes("timed out");
}

export async function executeStatementCopy(input: {
  sourceBucket: string;
  now: Date;
  apply: boolean;
  rehearsal: boolean;
  scheduled?: boolean;
  runId?: string;
  existingBucketBytes?: number;
  timeoutMs?: number;
  clients: StatementCopyClients;
  sleep?: (delayMs: number) => Promise<void>;
}) {
  if (input.rehearsal && input.scheduled) {
    throw new BackupGuardError("A scheduled statement backup is not the recovery rehearsal.");
  }
  const sourceBucket = assertStatementAppBucket(input.sourceBucket);
  return withBackupTimeout(async (signal) => {
    const guarded = <T>(operation: (child: AbortSignal) => Promise<T>) =>
      withBoundedRetries(() => withBackupTimeout(operation, { signal }), { signal, sleep: input.sleep });
    const sources = await guarded((child) => input.clients.listSource(child));
    if (sources.length > backupLimits.maxStatementObjects) {
      throw new BackupGuardError("Statement copy exceeds 1,000 objects.");
    }
    const rehearsalKey = statementRehearsalSourceKey(input.runId);
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
    const failedFiles: StatementCopyFailure[] = [];
    const validSources: StatementSourceObject[] = [];
    for (const source of sources) {
      try {
        assertStatementSourceKey(source.key);
        assertPdf(source.bytes);
        validSources.push(source);
      } catch (error) {
        if (!input.scheduled || isBackupTimeout(error)) throw error;
        failedFiles.push({ sourceKey: source.key, reason: "copy" });
      }
    }
    const sourceBytes = validSources.reduce((total, source) => total + source.bytes.byteLength, 0);
    if (sourceBytes > backupLimits.maxStatementBytes) {
      throw new BackupGuardError("Statement copy exceeds 1 GiB.");
    }
    const destination = await guarded((child) => input.clients.listDestination(child));
    const existingKeys = new Set(destination.objects.map((object) => object.key));
    const newestStoredAt = new Map<string, Date | null>();
    for (const object of destination.objects) {
      if (!object.sourceKeySha256 || !object.sourceSha256) continue;
      const id = `${object.sourceKeySha256}:${object.sourceSha256}`;
      const storedAt = statementBackupStoredAt(object.key);
      if (!newestStoredAt.has(id)) {
        newestStoredAt.set(id, storedAt);
        continue;
      }
      const current = newestStoredAt.get(id) ?? null;
      if (storedAt && (!current || storedAt > current)) newestStoredAt.set(id, storedAt);
    }
    const currentHashes = new Set(validSources.map((source) => sha256(source.key)));
    const absentSourceKeys = new Set<string>();
    for (const id of newestStoredAt.keys()) {
      const sourceKeySha256 = id.slice(0, 64);
      if (!currentHashes.has(sourceKeySha256)) absentSourceKeys.add(sourceKeySha256);
    }
    const retainedAbsentSources = absentSourceKeys.size;
    const copies: Array<{ source: StatementSourceObject; destinationKey: string; sourceSha256: string; renewing: boolean }> = [];
    let unchanged = 0;
    for (const source of validSources) {
      const sourceSha256 = sha256(source.bytes);
      const sourceKeySha256 = sha256(source.key);
      const retainedAt = newestStoredAt.get(`${sourceKeySha256}:${sourceSha256}`);
      const hasRetainedCopy = retainedAt !== undefined;
      if (hasRetainedCopy && !statementBackupNeedsRenewal(retainedAt, input.now)) {
        unchanged += 1;
        continue;
      }
      const destinationKey = statementBackupObjectKey(input.now, source.key);
      if (existingKeys.has(destinationKey) || copies.some((copy) => copy.destinationKey === destinationKey)) {
        if (input.scheduled) {
          failedFiles.push({ sourceKey: source.key, reason: "overwrite" });
          continue;
        }
        throw new BackupGuardError("Refusing to overwrite an existing statement backup.");
      }
      copies.push({ source, destinationKey, sourceSha256, renewing: hasRetainedCopy });
    }
    const renewedCopies = copies.filter((copy) => copy.renewing).length;
    const reportInput = {
      pdfsPresent: sources.length,
      unchanged,
      retainedAbsentSources,
      sourceBucket,
    };
    if (sources.length === 0) {
      return reportBase("empty", {
        ...reportInput,
        copied: 0,
        upload: false,
        destinationKeys: [],
        manifestKey: null,
        label: input.scheduled
          ? "0 PDFs present. This is not proof that a statement PDF was backed up."
          : "0 PDFs present. This is not statement recovery.",
      });
    }
    if (copies.length === 0 && failedFiles.length === 0) {
      return reportBase("unchanged", {
        ...reportInput,
        copied: 0,
        upload: false,
        destinationKeys: [],
        manifestKey: null,
        verified: Boolean(input.scheduled),
        renewed: 0,
        label: "Unchanged statement PDFs were not copied again.",
      });
    }
    const manifestKey = statementManifestKey(input.now);
    if (existingKeys.has(manifestKey)) {
      if (!input.scheduled) throw new BackupGuardError("Refusing to overwrite an existing statement manifest.");
      failedFiles.push({ sourceKey: manifestKey, reason: "overwrite" });
    }
    if (!input.apply || (copies.length === 0 && failedFiles.length > 0)) {
      return reportBase(failedFiles.length > 0 ? "failed" : "planned", {
        ...reportInput,
        copied: 0,
        renewed: failedFiles.length > 0 ? 0 : renewedCopies,
        failedFiles,
        upload: false,
        destinationKeys: copies.map((copy) => copy.destinationKey),
        manifestKey: failedFiles.some((failure) => failure.sourceKey === manifestKey) ? null : manifestKey,
          label: failedFiles.length > 0
            ? "Statement backup failed before upload. Retained backups were not overwritten."
            : renewedCopies > 0
              ? "Dry run. Retention renewal would store a fresh copy without deleting the existing backup."
              : "Dry run. No statement backup was uploaded.",
      });
    }
    const estimatedIncoming = copies.reduce((total, copy) => total + copy.source.bytes.byteLength + 4096, 65_536);
    assertUploadAllowed({
      kind: "statements",
      statementObjects: copies.length + 1,
      statementBytes: sourceBytes,
      existingBucketBytes: input.existingBucketBytes ?? destination.totalBytes,
      incomingBytes: estimatedIncoming,
    });
    const manifestObjects: Array<Record<string, string | number>> = [];
    const destinationKeys: string[] = [];
    let stored = 0;
    const confirm = async (
      key: string,
      expected: { sourceKeySha256?: string; sourceSha256?: string; ciphertextSha256: string },
      child: AbortSignal,
    ) => {
      assertStatementDestinationKey(key);
      const found = input.clients.confirmStored
        ? await input.clients.confirmStored(key, child)
        : (await input.clients.listDestination(child)).objects.find((object) => object.key === key) ?? null;
      if (!found || found.ciphertextSha256 !== expected.ciphertextSha256) return false;
      if (expected.sourceKeySha256 && found.sourceKeySha256 !== expected.sourceKeySha256) return false;
      if (expected.sourceSha256 && found.sourceSha256 !== expected.sourceSha256) return false;
      return true;
    };
    for (const copy of copies) {
      try {
        const encrypted = await guarded((child) => input.clients.encrypt(copy.source.bytes, child));
        const ciphertextSha256 = sha256(encrypted);
        assertUploadAllowed({
          kind: "statements",
          statementObjects: 1,
          statementBytes: encrypted.byteLength,
          existingBucketBytes: input.existingBucketBytes ?? destination.totalBytes,
          incomingBytes: encrypted.byteLength,
        });
        const metadata = {
          "source-key-sha256": sha256(copy.source.key),
          "source-sha256": copy.sourceSha256,
          "ciphertext-sha256": ciphertextSha256,
        };
        assertStatementDestinationKey(copy.destinationKey);
        await guarded((child) => input.clients.putDestination({ key: copy.destinationKey, body: encrypted, metadata }, child));
        stored += 1;
        if (input.scheduled) {
          const verified = await guarded((child) =>
            confirm(copy.destinationKey, {
              sourceKeySha256: metadata["source-key-sha256"],
              sourceSha256: metadata["source-sha256"],
              ciphertextSha256,
            }, child),
          );
          if (!verified) {
            failedFiles.push({ sourceKey: copy.source.key, reason: "verification" });
            continue;
          }
        }
        destinationKeys.push(copy.destinationKey);
        manifestObjects.push({
          sourceKey: copy.source.key,
          sourceSha256: copy.sourceSha256,
          sourceBytes: copy.source.bytes.byteLength,
          destinationKey: copy.destinationKey,
          ciphertextSha256,
        });
      } catch (error) {
        if (!input.scheduled || isBackupTimeout(error) || signal.aborted) throw error;
        failedFiles.push({ sourceKey: copy.source.key, reason: copyFailureReason(error) });
      }
    }
    const storedRenewals = destinationKeys.filter((key) =>
      copies.some((copy) => copy.renewing && copy.destinationKey === key),
    ).length;
    if (failedFiles.length > 0 || destinationKeys.length !== copies.length) {
      return reportBase("failed", {
        ...reportInput,
        copied: destinationKeys.length,
        renewed: storedRenewals,
        failedFiles,
        upload: stored > 0,
        destinationKeys,
        manifestKey: null,
        label: "Statement backup failed. Stored objects were left in place and nothing was deleted.",
      });
    }
    const manifest = Buffer.from(JSON.stringify({ version: 1, sourceBucket, objects: manifestObjects }), "utf8");
    let encryptedManifest: Buffer;
    let manifestCiphertextSha256 = "";
    try {
      encryptedManifest = await guarded((child) => input.clients.encrypt(manifest, child));
      manifestCiphertextSha256 = sha256(encryptedManifest);
      assertStatementDestinationKey(manifestKey);
      await guarded((child) =>
        input.clients.putDestination(
          { key: manifestKey, body: encryptedManifest, metadata: { "ciphertext-sha256": manifestCiphertextSha256 } },
          child,
        ),
      );
    } catch (error) {
      if (!input.scheduled || isBackupTimeout(error) || signal.aborted) throw error;
      return reportBase("failed", {
        ...reportInput,
        copied: destinationKeys.length,
        renewed: storedRenewals,
        failedFiles: [{ sourceKey: manifestKey, reason: copyFailureReason(error) }],
        upload: true,
        destinationKeys,
        manifestKey: null,
        label: "Statement backup failed. Stored objects were left in place and nothing was deleted.",
      });
    }
    if (input.scheduled) {
      const manifestVerified = await guarded((child) =>
        confirm(manifestKey, { ciphertextSha256: manifestCiphertextSha256 }, child),
      );
      if (!manifestVerified) {
        return reportBase("failed", {
          ...reportInput,
          copied: destinationKeys.length,
          renewed: storedRenewals,
          failedFiles: [{ sourceKey: manifestKey, reason: "verification" }],
          upload: true,
          destinationKeys,
          manifestKey: null,
          label: "Statement backup failed. Stored objects were left in place and nothing was deleted.",
        });
      }
    }
    return reportBase("copied", {
      ...reportInput,
      copied: destinationKeys.length,
      renewed: storedRenewals,
      upload: true,
      verified: Boolean(input.scheduled),
      destinationKeys,
      manifestKey,
      label: storedRenewals > 0
        ? "Retention renewal stored a fresh encrypted copy. Existing backups were not deleted."
        : "Encrypted statement copies were stored. This is not signed-in statement acceptance.",
    });
  }, { timeoutMs: input.timeoutMs });
}
