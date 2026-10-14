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

export const STATEMENT_PDF_PROBE_MANIFEST_RELATIVE =
  "e2e/.local/statement-probe-manifest.json";

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

async function persistFailedCleanupManifest(input: {
  runId: string;
  keys: string[];
  cleanupStatus: string;
}) {
  const filePath = path.join(process.cwd(), STATEMENT_PDF_PROBE_MANIFEST_RELATIVE);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        runId: input.runId,
        organizationId: STATEMENT_PDF_PROBE_ORGANIZATION_ID,
        keys: input.keys,
        cleanupStatus: input.cleanupStatus,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

export async function checkUnsignedObjectPrivacy(input: {
  url: string;
  fetchImpl?: typeof fetch;
}): Promise<StatementPdfProbeCheck> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(input.url, {
      redirect: "manual",
      headers: {},
    });
    if (response.status === 401 || response.status === 403) {
      return {
        id: "privacy",
        status: "passed",
        detail: "Unsigned request was denied. This is a single-object check, not a bucket-policy certification.",
      };
    }
    if (response.status >= 200 && response.status < 300) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > 0) {
        return {
          id: "privacy",
          status: "failed",
          detail: "Unsigned request returned object bytes. The test target is not private.",
        };
      }
    }
    return {
      id: "privacy",
      status: "inconclusive",
      detail: `Unsigned request status ${response.status} is not privacy proof.`,
    };
  } catch {
    return {
      id: "privacy",
      status: "inconclusive",
      detail:
        "Unsigned request did not reach the object. Connection or DNS failure is inconclusive.",
    };
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

      checks.push(
        await checkUnsignedObjectPrivacy({
          url: unsignedStatementObjectUrl(target, keys.source),
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
      await persistFailedCleanupManifest({
        runId,
        keys: owned,
        cleanupStatus: cleanup.status,
      }).catch(() => undefined);
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

  try {
    const source = await writeRemoteStatementPdf(
      target,
      { objectKey: keys.source, bytes: original },
      input.send,
    );
    if (!source.ok) {
      add(checks, "source-create", "failed", `Source create failed: ${source.reason}.`);
      return finishRestore(checks, runId, "skipped");
    }
    add(checks, "source-create", "passed", "Synthetic source object was created.");

    const recovery = await writeRemoteStatementPdf(
      target,
      { objectKey: keys.recovery, bytes: original },
      input.send,
    );
    if (!recovery.ok) {
      add(checks, "recovery-copy", "failed", `Recovery copy failed: ${recovery.reason}.`);
      return finishRestore(checks, runId, "skipped");
    }

    const recoveryRead = await inspectRemoteStatementPdf(
      target,
      keys.recovery,
      input.send,
    );
    if (recoveryRead.status !== "present" || recoveryRead.checksum !== originalHash) {
      add(
        checks,
        "recovery-copy",
        "failed",
        "Recovery copy was not independently readable with the expected checksum. Source was not deleted.",
      );
      return finishRestore(checks, runId, "skipped");
    }
    add(
      checks,
      "recovery-copy",
      "passed",
      "Recovery copy was independently readable before any source deletion.",
    );

    const sourceGone = await deleteAndVerifyRemoteStatementPdf(
      target,
      keys.source,
      input.send,
    );
    if (!sourceGone.cleanedUp) {
      add(checks, "simulated-loss", "failed", sourceGone.reason);
      return finishRestore(checks, runId, sourceGone.status);
    }
    add(checks, "simulated-loss", "passed", "Synthetic source key is absent after verified delete.");

    const backup = await inspectRemoteStatementPdf(
      target,
      keys.recovery,
      input.send,
    );
    if (backup.status !== "present") {
      add(checks, "restore", "failed", "Recovery copy was missing when restore was attempted.");
      return finishRestore(checks, runId, "skipped");
    }
    if (backup.checksum !== originalHash) {
      add(checks, "restore", "failed", "Recovery copy checksum changed before restore.");
      return finishRestore(checks, runId, "skipped");
    }

    const openedBackup = await openRemoteStatementPdf(
      target,
      { objectKey: keys.recovery, checksum: backup.checksum },
      input.send,
    );
    if (!openedBackup.ok) {
      add(checks, "restore", "failed", "Could not read recovery copy for restore.");
      return finishRestore(checks, runId, "skipped");
    }
    const chunks: Buffer[] = [];
    for await (const chunk of openedBackup.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fromBackup = Buffer.concat(chunks);

    const restored = await writeRemoteStatementPdf(
      target,
      { objectKey: keys.restored, bytes: fromBackup },
      input.send,
    );
    if (!restored.ok) {
      add(checks, "restore", "failed", `Restore create failed: ${restored.reason}.`);
      return finishRestore(checks, runId, "skipped");
    }
    const verify = await inspectRemoteStatementPdf(
      target,
      keys.restored,
      input.send,
    );
    if (verify.status === "present" && verify.checksum === originalHash) {
      add(
        checks,
        "restore",
        "passed",
        "Restored object matched the recovery-copy checksum on a fresh read. Same-bucket copy is not an independent durable backup.",
      );
    } else {
      add(checks, "restore", "failed", "Restored object did not match the recovery copy.");
    }
    return finishRestore(checks, runId, "skipped");
  } finally {
    for (const key of owned) {
      if (!isRunOwnedKey(key, runId)) continue;
      await deleteAndVerifyRemoteStatementPdf(target, key, input.send);
    }
  }
}

function finishRestore(
  checks: StatementPdfProbeCheck[],
  runId: string,
  cleanupStatus: StatementPdfProbeReport["cleanupStatus"],
): StatementPdfProbeReport {
  const failed = checks.some(
    (check) => check.status === "failed" || check.status === "blocked",
  );
  return {
    ok: !failed && checks.some((check) => check.status === "passed"),
    mode: "restore",
    synthetic: true,
    usedRealStatement: false,
    targetKind: "designated-test",
    runId,
    checks,
    cleanedUp: cleanupStatus === "absent" ? true : cleanupStatus === "skipped" ? null : false,
    cleanupStatus,
    notes: [
      "Synthetic restore rehearsal only. Not a durable independent backup or database-plus-PDF disaster recovery.",
      "A copy in the same bucket or failure domain is not an offsite backup.",
    ],
  };
}
