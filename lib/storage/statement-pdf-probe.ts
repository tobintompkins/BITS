import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  STATEMENT_PDF_PROBE_ORGANIZATION_ID,
  resolveStatementPdfTestTarget,
  type StatementPdfS3Config,
} from "@/lib/storage/statement-pdf-config";
import { logicalStatementPdfObjectKey } from "@/lib/storage/statement-pdf-ref";
import {
  deleteAndVerifyRemoteStatementPdf,
  inspectRemoteStatementPdf,
  openRemoteStatementPdf,
  writeRemoteStatementPdf,
  type StatementS3Sender,
} from "@/lib/storage/statement-pdf-s3";

export const STATEMENT_PDF_PROBE_MANIFEST_DIR_RELATIVE =
  "e2e/.local/statement-probe-manifests";
export const STATEMENT_PDF_PROBE_MANIFEST_RELATIVE =
  "e2e/.local/statement-probe-manifest.json";
export const UNSIGNED_PRIVACY_TIMEOUT_MS = 5_000;
export const UNSIGNED_PRIVACY_MAX_BYTES = 64 * 1024;

export type StatementPdfProbeCheckStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "inconclusive";

export type StatementPdfProbeCheck = {
  id: string;
  status: StatementPdfProbeCheckStatus;
  detail: string;
};

export type StatementPdfProbeReport = {
  ok: boolean;
  mode: "preflight" | "probe" | "restore";
  synthetic: true;
  usedRealStatement: false;
  targetKind: "unconfigured" | "designated-test";
  executionKind: "none" | "mock" | "emulator" | "live-provider";
  runId: string | null;
  checks: StatementPdfProbeCheck[];
  cleanedUp: boolean | null;
  cleanupStatus: "absent" | "present" | "unknown" | "skipped";
  notes: string[];
};

function syntheticPdf(marker: string) {
  return Buffer.from(`%PDF-1.4\n${marker}\n%%EOF\n`, "utf8");
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRunOwnedKey(objectKey: string, runId: string) {
  const prefix = `private/statements/${STATEMENT_PDF_PROBE_ORGANIZATION_ID}/${runId}/`;
  return objectKey.startsWith(prefix) && !objectKey.includes("..");
}

export function buildStatementPdfProbeKeys(runId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      runId,
    )
  ) {
    throw new Error("Probe run IDs must be UUIDs.");
  }
  return {
    source: logicalStatementPdfObjectKey(
      STATEMENT_PDF_PROBE_ORGANIZATION_ID,
      runId,
      "probe.pdf",
    ),
    recovery: logicalStatementPdfObjectKey(
      STATEMENT_PDF_PROBE_ORGANIZATION_ID,
      runId,
      "recovery.pdf",
    ),
    restored: logicalStatementPdfObjectKey(
      STATEMENT_PDF_PROBE_ORGANIZATION_ID,
      runId,
      "restored.pdf",
    ),
  };
}

export function unsignedStatementObjectUrl(
  config: StatementPdfS3Config,
  objectKey: string,
) {
  const key = `${config.prefix}${objectKey}`;
  if (config.endpoint) {
    const endpoint = new URL(config.endpoint);
    endpoint.username = "";
    endpoint.password = "";
    const base = endpoint.toString().replace(/\/+$/, "");
    return `${base}/${config.bucket}/${key}`;
  }
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

export function redactStatementPdfProbeText(value: string) {
  return value
    .replace(/(AKIA|ASIA)[A-Z0-9]{16}/g, "[redacted-key]")
    .replace(/(sk_live_|sk_test_|whsec_)[A-Za-z0-9]+/g, "[redacted-secret]")
    .replace(/[?&](X-Amz-Signature|X-Amz-Credential)=[^&]+/gi, "[redacted-sig]");
}

function add(
  checks: StatementPdfProbeCheck[],
  id: string,
  status: StatementPdfProbeCheckStatus,
  detail: string,
) {
  checks.push({ id, status, detail: redactStatementPdfProbeText(detail) });
}

export function statementPdfProbeManifestRelative(runId: string) {
  return path.join(STATEMENT_PDF_PROBE_MANIFEST_DIR_RELATIVE, `run-${runId}.json`);
}

export function classifyStatementPdfExecutionKind(input: {
  configured: boolean;
  injectedSender?: boolean;
  endpoint?: string;
}): StatementPdfProbeReport["executionKind"] {
  if (!input.configured) return "none";
  if (input.injectedSender) return "mock";
  if (!input.endpoint) return "live-provider";
  try {
    const host = new URL(input.endpoint).hostname;
    if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
      return "emulator";
    }
  } catch {
    return "none";
  }
  return "live-provider";
}

export async function persistFailedCleanupManifest(
  input: {
    runId: string;
    keys: string[];
    cleanupStatus: string;
  },
  rootDir = process.cwd(),
) {
  const relative = statementPdfProbeManifestRelative(input.runId);
  const filePath = path.join(rootDir, relative);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const payload = `${JSON.stringify(
    {
      runId: input.runId,
      organizationId: STATEMENT_PDF_PROBE_ORGANIZATION_ID,
      keys: input.keys,
      cleanupStatus: input.cleanupStatus,
    },
    null,
    2,
  )}\n`;
  try {
    await writeFile(filePath, payload, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    return { wrote: true, filePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return { wrote: false, filePath };
    }
    throw error;
  }
}

function normalizeObjectUrl(value: string) {
  const parsed = new URL(value);
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

async function unsignedResponseHasObjectBytes(
  response: Response,
  signal: AbortSignal,
) {
  if (!response.body) {
    return false;
  }
  const reader = response.body.getReader();
  let total = 0;
  try {
    while (total < UNSIGNED_PRIVACY_MAX_BYTES) {
      if (signal.aborted) return total > 0;
      const { done, value } = await reader.read();
      if (done) break;
      total += value?.byteLength ?? 0;
      if (total > 0) return true;
    }
    return total > 0;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function checkUnsignedObjectPrivacy(input: {
  url: string;
  expectedUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<StatementPdfProbeCheck> {
  const timeoutMs = input.timeoutMs ?? UNSIGNED_PRIVACY_TIMEOUT_MS;
  try {
    const requested = new URL(input.url);
    if (requested.username || requested.password) {
      return {
        id: "privacy",
        status: "inconclusive",
        detail: "Unsigned request URL contained credentials and was not sent.",
      };
    }
    if (
      input.expectedUrl &&
      normalizeObjectUrl(input.url) !== normalizeObjectUrl(input.expectedUrl)
    ) {
      return {
        id: "privacy",
        status: "inconclusive",
        detail: "Requested URL did not match the intended object URL.",
      };
    }
  } catch {
    return {
      id: "privacy",
      status: "inconclusive",
      detail: "Unsigned request URL was not a valid object URL.",
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(input.url, {
      redirect: "manual",
      headers: {},
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      return {
        id: "privacy",
        status: "passed",
        detail:
          "Unsigned request was denied. This is a single-object check, not a bucket-policy certification.",
      };
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      return {
        id: "privacy",
        status: "inconclusive",
        detail: `Unsigned request redirected (${response.status}). Redirects are not privacy proof.`,
      };
    }
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return {
        id: "privacy",
        status: "inconclusive",
        detail: "Unsigned request returned 404. Missing objects are not privacy proof.",
      };
    }
    if (response.status >= 200 && response.status < 300) {
      const hasBytes = await unsignedResponseHasObjectBytes(
        response,
        controller.signal,
      );
      if (hasBytes) {
        return {
          id: "privacy",
          status: "failed",
          detail: "Unsigned request returned object bytes. The test target is not private.",
        };
      }
    }
    await response.body?.cancel().catch(() => undefined);
    return {
      id: "privacy",
      status: "inconclusive",
      detail: `Unsigned request status ${response.status} is not privacy proof.`,
    };
  } catch (error) {
    const aborted =
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    return {
      id: "privacy",
      status: "inconclusive",
      detail: aborted
        ? "Unsigned request timed out. Timeouts are not privacy proof."
        : "Unsigned request did not reach the object. Connection or DNS failure is inconclusive.",
    };
  } finally {
    clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
  }
}

export function preflightStatementPdfProbe(
  env: Record<string, string | undefined> = process.env,
): StatementPdfProbeReport {
  const target = resolveStatementPdfTestTarget(env);
  const checks: StatementPdfProbeCheck[] = [];
  if (!target.ok) {
    add(checks, "test-target", "blocked", target.message);
  } else {
    add(
      checks,
      "test-target",
      "passed",
      "A designated isolated test bucket is configured.",
    );
  }
  return {
    ok: target.ok,
    mode: "preflight",
    synthetic: true,
    usedRealStatement: false,
    targetKind: target.ok ? "designated-test" : "unconfigured",
    executionKind: classifyStatementPdfExecutionKind({
      configured: target.ok,
      endpoint: target.ok && target.backend === "s3" ? target.endpoint : undefined,
    }),
    runId: null,
    checks,
    cleanedUp: null,
    cleanupStatus: "skipped",
    notes: [
      "Default command is read-only. Pass --apply to run synthetic writes against the designated test target only.",
      "This is not proof of production storage, historical PDF migration, or disaster recovery.",
    ],
  };
}

export async function runStatementPdfStorageProbe(input: {
  apply: boolean;
  env?: Record<string, string | undefined>;
  send?: StatementS3Sender;
  fetchImpl?: typeof fetch;
  runId?: string;
  manifestRoot?: string;
}): Promise<StatementPdfProbeReport> {
  const preflight = preflightStatementPdfProbe(input.env);
  if (!input.apply) {
    return preflight;
  }
  const target = resolveStatementPdfTestTarget(input.env);
  if (!target.ok || target.backend !== "s3") {
    return { ...preflight, mode: "probe", ok: false };
  }

  const runId = input.runId ?? randomUUID();
  const keys = buildStatementPdfProbeKeys(runId);
  const original = syntheticPdf(`probe-${runId}`);
  const overwrite = syntheticPdf(`overwrite-${runId}`);
  const originalHash = sha256(original);
  const checks = [...preflight.checks];
  const owned = [keys.source];

  try {
    const created = await writeRemoteStatementPdf(
      target,
      { objectKey: keys.source, bytes: original },
      input.send,
    );
    if (!created.ok) {
      add(checks, "conditional-create", "failed", `Create failed: ${created.reason}.`);
    } else {
      add(checks, "conditional-create", "passed", "Conditional create succeeded for a run-owned key.");
    }

    if (created.ok) {
      const second = await writeRemoteStatementPdf(
        target,
        { objectKey: keys.source, bytes: overwrite },
        input.send,
      );
      if (second.ok) {
        add(
          checks,
          "immutable-overwrite",
          "failed",
          "A second put with different bytes succeeded. If-None-Match was not honored.",
        );
      } else if (second.reason === "ALREADY_EXISTS") {
        const inspect = await inspectRemoteStatementPdf(
          target,
          keys.source,
          input.send,
        );
        if (inspect.status === "present" && inspect.checksum === originalHash) {
          add(
            checks,
            "immutable-overwrite",
            "passed",
            "Second put was rejected and the original bytes remain unchanged.",
          );
        } else {
          add(
            checks,
            "immutable-overwrite",
            "failed",
            "Second put was rejected but the stored checksum does not match the original.",
          );
        }
      } else {
        add(
          checks,
          "immutable-overwrite",
          second.reason === "TIMEOUT" ? "inconclusive" : "failed",
          `Second put ended with ${second.reason}.`,
        );
      }

      const opened = await openRemoteStatementPdf(
        target,
        { objectKey: keys.source, checksum: originalHash },
        input.send,
      );
      if (opened.ok) {
        opened.stream.destroy();
        add(checks, "read-checksum", "passed", "Exact bytes and SHA-256 matched. ETag was not used.");
      } else {
        add(checks, "read-checksum", "failed", "Read or checksum verification failed.");
      }

      const wrong = await openRemoteStatementPdf(
        target,
        { objectKey: keys.source, checksum: "a".repeat(64) },
        input.send,
      );
      if (!wrong.ok) {
        add(checks, "checksum-mismatch", "passed", "A deliberately wrong checksum was rejected.");
      } else {
        wrong.stream.destroy();
        add(checks, "checksum-mismatch", "failed", "A wrong checksum was accepted.");
      }

      const objectUrl = unsignedStatementObjectUrl(target, keys.source);
      checks.push(
        await checkUnsignedObjectPrivacy({
          url: objectUrl,
          expectedUrl: objectUrl,
          fetchImpl: input.fetchImpl,
        }),
      );
    }
  } finally {
    const cleanup = await deleteAndVerifyRemoteStatementPdf(
      target,
      keys.source,
      input.send,
    );
    if (!isRunOwnedKey(keys.source, runId)) {
      add(checks, "cleanup-scope", "failed", "Cleanup refused a key outside this run.");
    } else {
      add(
        checks,
        "cleanup-scope",
        "passed",
        "Cleanup targeted only this run-owned key.",
      );
    }
    if (cleanup.cleanedUp) {
      add(
        checks,
        "cleanup",
        "passed",
        "Current object key is absent. Version history was not inspected.",
      );
    } else if (cleanup.status === "present") {
      add(checks, "cleanup", "failed", cleanup.reason);
    } else {
      add(checks, "cleanup", "inconclusive", cleanup.reason);
    }
    if (!cleanup.cleanedUp) {
      await persistFailedCleanupManifest(
        {
          runId,
          keys: owned,
          cleanupStatus: cleanup.status,
        },
        input.manifestRoot ?? process.cwd(),
      ).catch(() => undefined);
    }
    const failed = checks.some(
      (check) => check.status === "failed" || check.status === "blocked",
    );
    return {
      ok: !failed && cleanup.cleanedUp,
      mode: "probe",
      synthetic: true,
      usedRealStatement: false,
      targetKind: "designated-test",
      executionKind: classifyStatementPdfExecutionKind({
        configured: true,
        injectedSender: Boolean(input.send),
        endpoint: target.endpoint,
      }),
      runId,
      checks,
      cleanedUp: cleanup.cleanedUp,
      cleanupStatus: cleanup.status,
      notes: [
        "Synthetic probe only. Not production configuration, historical migration, or disaster recovery.",
        "Versioned buckets may retain hidden versions after a delete marker.",
      ],
    };
  }
}

export async function runStatementPdfRestoreRehearsal(input: {
  apply: boolean;
  env?: Record<string, string | undefined>;
  send?: StatementS3Sender;
  runId?: string;
  manifestRoot?: string;
}): Promise<StatementPdfProbeReport> {
  const preflight = preflightStatementPdfProbe(input.env);
  if (!input.apply) {
    return { ...preflight, mode: "restore" };
  }
  const target = resolveStatementPdfTestTarget(input.env);
  if (!target.ok || target.backend !== "s3") {
    return { ...preflight, mode: "restore", ok: false };
  }

  const runId = input.runId ?? randomUUID();
  const keys = buildStatementPdfProbeKeys(runId);
  const original = syntheticPdf(`restore-${runId}`);
  const originalHash = sha256(original);
  const checks = [...preflight.checks];
  const owned = [keys.source, keys.recovery, keys.restored];
  const executionKind = classifyStatementPdfExecutionKind({
    configured: true,
    injectedSender: Boolean(input.send),
    endpoint: target.endpoint,
  });

  try {
    const source = await writeRemoteStatementPdf(
      target,
      { objectKey: keys.source, bytes: original },
      input.send,
    );
    if (!source.ok) {
      add(checks, "source-create", "failed", `Source create failed: ${source.reason}.`);
      return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
    }
    add(checks, "source-create", "passed", "Synthetic source object was created.");

    const recovery = await writeRemoteStatementPdf(
      target,
      { objectKey: keys.recovery, bytes: original },
      input.send,
    );
    if (!recovery.ok) {
      add(checks, "recovery-copy", "failed", `Recovery copy failed: ${recovery.reason}.`);
      return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
    }

    const recoveryRead = await inspectRemoteStatementPdf(
      target,
      keys.recovery,
      input.send,
    );
    if (
      recoveryRead.status !== "present" ||
      recoveryRead.checksum !== originalHash ||
      recoveryRead.byteLength !== original.byteLength
    ) {
      add(
        checks,
        "recovery-copy",
        "failed",
        "Recovery copy was not independently readable with the expected SHA-256 and byte length. Source was not deleted.",
      );
      return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
    }
    add(
      checks,
      "recovery-copy",
      "passed",
      `Recovery copy was independently readable before any source deletion (${recoveryRead.byteLength} bytes).`,
    );

    const sourceGone = await deleteAndVerifyRemoteStatementPdf(
      target,
      keys.source,
      input.send,
    );
    if (!sourceGone.cleanedUp) {
      add(checks, "simulated-loss", "failed", sourceGone.reason);
      return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
    }
    add(checks, "simulated-loss", "passed", "Synthetic source key is absent after verified delete.");

    const backup = await inspectRemoteStatementPdf(
      target,
      keys.recovery,
      input.send,
    );
    if (backup.status !== "present") {
      add(checks, "restore", "failed", "Recovery copy was missing when restore was attempted.");
      return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
    }
    if (backup.checksum !== originalHash || backup.byteLength !== original.byteLength) {
      add(
        checks,
        "restore",
        "failed",
        "Recovery copy SHA-256 or byte length changed before restore.",
      );
      return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
    }

    const openedBackup = await openRemoteStatementPdf(
      target,
      { objectKey: keys.recovery, checksum: backup.checksum },
      input.send,
    );
    if (!openedBackup.ok) {
      add(checks, "restore", "failed", "Could not read recovery copy for restore.");
      return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
    }
    const chunks: Buffer[] = [];
    for await (const chunk of openedBackup.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fromBackup = Buffer.concat(chunks);
    if (
      fromBackup.byteLength !== original.byteLength ||
      sha256(fromBackup) !== originalHash
    ) {
      add(
        checks,
        "restore",
        "failed",
        "Fetched backup bytes did not match the recovery-copy SHA-256 or byte length.",
      );
      return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
    }

    const restored = await writeRemoteStatementPdf(
      target,
      { objectKey: keys.restored, bytes: fromBackup },
      input.send,
    );
    if (!restored.ok) {
      add(checks, "restore", "failed", `Restore create failed: ${restored.reason}.`);
      return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
    }
    const verify = await inspectRemoteStatementPdf(
      target,
      keys.restored,
      input.send,
    );
    if (
      verify.status === "present" &&
      verify.checksum === originalHash &&
      verify.byteLength === original.byteLength
    ) {
      add(
        checks,
        "restore",
        "passed",
        `Restored object matched the recovery-copy SHA-256 and byte length (${verify.byteLength} bytes) on a fresh read. Same-bucket copy is not an independent durable backup.`,
      );
    } else {
      add(checks, "restore", "failed", "Restored object did not match the recovery copy.");
    }
    return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
  } catch (error) {
    add(
      checks,
      "restore",
      "failed",
      error instanceof Error ? error.message : "Restore rehearsal failed.",
    );
    return await finishRestore(
        checks,
        runId,
        executionKind,
        target,
        owned,
        input.send,
        input.manifestRoot,
      );
  }
}

async function finishRestore(
  checks: StatementPdfProbeCheck[],
  runId: string,
  executionKind: StatementPdfProbeReport["executionKind"],
  target: StatementPdfS3Config,
  owned: string[],
  send?: StatementS3Sender,
  manifestRoot?: string,
): Promise<StatementPdfProbeReport> {
  let cleanupStatus: StatementPdfProbeReport["cleanupStatus"] = "absent";
  const leftover: string[] = [];
  for (const key of owned) {
    if (!isRunOwnedKey(key, runId)) continue;
    const result = await deleteAndVerifyRemoteStatementPdf(target, key, send);
    if (!result.cleanedUp) {
      leftover.push(key);
      if (result.status === "present") cleanupStatus = "present";
      else if (cleanupStatus !== "present") cleanupStatus = "unknown";
    }
  }
  if (leftover.length === 0) {
    add(
      checks,
      "cleanup",
      "passed",
      "Owned restore keys are absent. Version history was not inspected.",
    );
  } else {
    add(
      checks,
      "cleanup",
      cleanupStatus === "present" ? "failed" : "inconclusive",
      "Owned restore cleanup was not verified. Failed-cleanup evidence was retained.",
    );
    await persistFailedCleanupManifest(
      {
        runId,
        keys: leftover,
        cleanupStatus,
      },
      manifestRoot ?? process.cwd(),
    ).catch(() => undefined);
  }
  const failed = checks.some(
    (check) => check.status === "failed" || check.status === "blocked",
  );
  return {
    ok: !failed && leftover.length === 0 && checks.some((check) => check.status === "passed"),
    mode: "restore",
    synthetic: true,
    usedRealStatement: false,
    targetKind: "designated-test",
    executionKind,
    runId,
    checks,
    cleanedUp: leftover.length === 0,
    cleanupStatus: leftover.length === 0 ? "absent" : cleanupStatus,
    notes: [
      "Synthetic restore rehearsal only. Not a durable independent backup or database-plus-PDF disaster recovery.",
      "A copy in the same bucket or failure domain is not an offsite backup.",
    ],
  };
}
