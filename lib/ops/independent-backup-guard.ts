export const independentBackupBucket = "bits-independent-backups";

export const backupLimits = {
  maxPostgresArchiveBytes: 100 * 1024 * 1024,
  maxStatementObjects: 1000,
  maxStatementBytes: 1024 * 1024 * 1024,
  maxStoredTotalBytes: 8 * 1024 * 1024 * 1024,
  maxAttempts: 3,
  retryDelaysMs: [5_000, 15_000] as const,
  timeoutMs: 120_000,
} as const;

export class BackupGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupGuardError";
  }
}

export type BackupUploadRequest = {
  kind: "postgres" | "statements";
  archiveBytes?: number;
  statementObjects?: number;
  statementBytes?: number;
  existingBucketBytes: number;
  incomingBytes: number;
};

function assertByteCount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BackupGuardError(`${label} must be a non-negative integer.`);
  }
}

export function assertAgeRecipient(recipient: string | undefined) {
  const value = recipient?.trim() ?? "";
  if (value.startsWith("AGE-SECRET-KEY-")) {
    throw new BackupGuardError("The backup recipient must be an age public key.");
  }
  if (!/^age1[0-9a-z]{20,}$/.test(value)) {
    throw new BackupGuardError("An age public recipient is required before encryption.");
  }
  return value;
}

export function assertUploadAllowed(request: BackupUploadRequest) {
  assertByteCount(request.existingBucketBytes, "Existing bucket size");
  assertByteCount(request.incomingBytes, "Incoming backup size");
  if (request.kind === "postgres") {
    const archiveBytes = request.archiveBytes ?? request.incomingBytes;
    assertByteCount(archiveBytes, "Postgres archive size");
    if (archiveBytes > backupLimits.maxPostgresArchiveBytes) {
      throw new BackupGuardError("Postgres archive exceeds 100 MiB.");
    }
  } else {
    const statementObjects = request.statementObjects ?? 0;
    const statementBytes = request.statementBytes ?? request.incomingBytes;
    assertByteCount(statementObjects, "Statement object count");
    assertByteCount(statementBytes, "Statement copy size");
    if (statementObjects > backupLimits.maxStatementObjects) {
      throw new BackupGuardError("Statement copy exceeds 1,000 objects.");
    }
    if (statementBytes > backupLimits.maxStatementBytes) {
      throw new BackupGuardError("Statement copy exceeds 1 GiB.");
    }
  }
  if (request.existingBucketBytes + request.incomingBytes > backupLimits.maxStoredTotalBytes) {
    throw new BackupGuardError("Stored total would exceed 8 GiB.");
  }
}

export async function withBoundedRetries<T>(
  operation: (attempt: number) => Promise<T>,
  options: {
    sleep?: (delayMs: number) => Promise<void>;
    signal?: AbortSignal;
  } = {},
) {
  const sleep = options.sleep ?? ((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= backupLimits.maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new BackupGuardError(`Backup timed out after ${backupLimits.timeoutMs}ms.`);
    }
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) break;
      const delay = backupLimits.retryDelaysMs[attempt - 1];
      if (delay === undefined) break;
      await sleep(delay);
      if (options.signal?.aborted) break;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new BackupGuardError("Backup attempt failed.");
}

export async function withBackupTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
) {
  const timeoutMs = options.timeoutMs ?? backupLimits.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new BackupGuardError("Backup timeout must be a positive integer.");
  }
  if (options.signal?.aborted) {
    throw new BackupGuardError(`Backup timed out after ${timeoutMs}ms.`);
  }
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new BackupGuardError(`Backup timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}
