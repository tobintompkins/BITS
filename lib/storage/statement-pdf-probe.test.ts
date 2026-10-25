import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildStatementPdfProbeKeys,
  checkUnsignedObjectPrivacy,
  classifyStatementPdfExecutionKind,
  persistFailedCleanupManifest,
  preflightStatementPdfProbe,
  redactStatementPdfProbeText,
  runStatementPdfRestoreRehearsal,
  runStatementPdfStorageProbe,
  statementPdfProbeManifestRelative,
} from "./statement-pdf-probe";
import type { StatementS3Sender } from "./statement-pdf-s3";

const TEST_ENV = {
  BITS_STATEMENT_S3_TEST_TARGET: "1",
  BITS_STATEMENT_S3_TEST_BUCKET: "bits-statements-test",
  BITS_STATEMENT_S3_TEST_REGION: "us-east-1",
};

const RUN_ID = "00000000-0000-4000-8000-00000000aa01";

function commandName(command: unknown) {
  return (command as { constructor?: { name?: string } }).constructor?.name ?? "";
}

function commandKey(command: unknown) {
  return String((command as { input?: { Key?: string } }).input?.Key ?? "");
}

function memorySender(options?: { omitRecovery?: boolean }) {
  const objects = new Map<string, Buffer>();
  const send: StatementS3Sender = async (command) => {
    const name = commandName(command);
    const key = commandKey(command);
    if (name === "PutObjectCommand") {
      const input = (command as { input?: { IfNoneMatch?: string; Body?: Buffer } })
        .input;
      if (input?.IfNoneMatch === "*" && objects.has(key)) {
        const error = new Error("exists");
        error.name = "PreconditionFailed";
        (error as { $metadata?: { httpStatusCode: number } }).$metadata = {
          httpStatusCode: 412,
        };
        throw error;
      }
      if (options?.omitRecovery && key.endsWith("/recovery.pdf")) {
        return {};
      }
      objects.set(key, Buffer.from(input?.Body ?? []));
      return {};
    }
    if (name === "GetObjectCommand") {
      const body = objects.get(key);
      if (!body) {
        const error = new Error("missing");
        error.name = "NoSuchKey";
        (error as { $metadata?: { httpStatusCode: number } }).$metadata = {
          httpStatusCode: 404,
        };
        throw error;
      }
      return { Body: Readable.from(body), ContentLength: body.byteLength };
    }
    if (name === "DeleteObjectCommand") {
      objects.delete(key);
      return {};
    }
    throw new Error(`unexpected command ${name}`);
  };
  return { objects, send };
}

describe("statement PDF probe and restore rehearsal", () => {
  it("stays read-only until --apply and never inherits the app bucket", () => {
    const report = preflightStatementPdfProbe({
      BITS_STATEMENT_S3_BUCKET: "bits-prod",
      BITS_STATEMENT_S3_REGION: "us-east-1",
    });
    expect(report.mode).toBe("preflight");
    expect(report.ok).toBe(false);
    expect(report.checks[0]?.status).toBe("blocked");
  });

  it("rejects overwrite, verifies checksums, and reports verified cleanup", async () => {
    const { objects, send } = memorySender();
    const report = await runStatementPdfStorageProbe({
      apply: true,
      env: TEST_ENV,
      send,
      runId: RUN_ID,
      fetchImpl: async () =>
        new Response(null, { status: 403 }) as Response,
    });
    const keys = buildStatementPdfProbeKeys(RUN_ID);
    expect(report.cleanedUp).toBe(true);
    expect(report.cleanupStatus).toBe("absent");
    expect(objects.has(keys.source)).toBe(false);
    expect(report.checks.find((check) => check.id === "immutable-overwrite")?.status).toBe(
      "passed",
    );
    expect(report.checks.find((check) => check.id === "checksum-mismatch")?.status).toBe(
      "passed",
    );
    expect(report.checks.find((check) => check.id === "cleanup-scope")?.status).toBe(
      "passed",
    );
    expect(report.ok).toBe(true);
    expect(report.executionKind).toBe("mock");
  });

  it("fails when an unsigned request returns object bytes", async () => {
    const bytes = Buffer.from("%PDF-1.4\npublic\n", "utf8");
    const check = await checkUnsignedObjectPrivacy({
      url: "https://bits-statements-test.s3.us-east-1.amazonaws.com/probe.pdf",
      fetchImpl: async () => new Response(bytes, { status: 200 }),
    });
    expect(check.status).toBe("failed");
  });

  it("restores from the recovery copy, not from an in-memory source", async () => {
    const { send } = memorySender();
    const report = await runStatementPdfRestoreRehearsal({
      apply: true,
      env: TEST_ENV,
      send,
      runId: RUN_ID,
    });
    expect(report.checks.find((check) => check.id === "restore")?.status).toBe(
      "passed",
    );
    expect(report.checks.find((check) => check.id === "recovery-copy")?.status).toBe(
      "passed",
    );
    expect(report.checks.find((check) => check.id === "restore")?.detail).toMatch(
      /byte length/,
    );
    expect(report.cleanedUp).toBe(true);
    expect(report.executionKind).toBe("mock");
  });

  it("fails restore when the recovery copy is missing", async () => {
    const { send } = memorySender({ omitRecovery: true });
    const report = await runStatementPdfRestoreRehearsal({
      apply: true,
      env: TEST_ENV,
      send,
      runId: RUN_ID,
    });
    expect(report.checks.some((check) => check.id === "recovery-copy" && check.status === "failed")).toBe(
      true,
    );
    expect(report.ok).toBe(false);
  });

  it("redacts credentials from probe text", () => {
    expect(
      redactStatementPdfProbeText(
        "url?X-Amz-Signature=abc123&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE",
      ),
    ).not.toContain("abc123");
    expect(createHash("sha256").update("x").digest("hex")).toHaveLength(64);
  });

  it("treats hanging unsigned fetches as inconclusive and never loads a large body", async () => {
    const hanging = await checkUnsignedObjectPrivacy({
      url: "https://bits-statements-test.s3.us-east-1.amazonaws.com/probe.pdf",
      timeoutMs: 20,
      fetchImpl: (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });
    expect(hanging.status).toBe("inconclusive");
    expect(hanging.detail).toMatch(/timed out/i);

    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const large = await checkUnsignedObjectPrivacy({
      url: "https://bits-statements-test.s3.us-east-1.amazonaws.com/probe.pdf",
      fetchImpl: async () => new Response(stream, { status: 200 }),
    });
    expect(large.status).toBe("failed");
    expect(cancelled).toBe(true);
  });

  it("does not treat redirects, 404s, or credentialed URLs as privacy proof", async () => {
    const redirected = await checkUnsignedObjectPrivacy({
      url: "https://bits-statements-test.s3.us-east-1.amazonaws.com/probe.pdf",
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://evil.example/probe.pdf" },
        }),
    });
    expect(redirected.status).toBe("inconclusive");

    const missing = await checkUnsignedObjectPrivacy({
      url: "https://bits-statements-test.s3.us-east-1.amazonaws.com/probe.pdf",
      fetchImpl: async () => new Response(null, { status: 404 }),
    });
    expect(missing.status).toBe("inconclusive");

    let sent = false;
    const credentialed = await checkUnsignedObjectPrivacy({
      url: "https://user:secret@bits-statements-test.s3.us-east-1.amazonaws.com/probe.pdf",
      fetchImpl: async () => {
        sent = true;
        return new Response(null, { status: 403 });
      },
    });
    expect(credentialed.status).toBe("inconclusive");
    expect(sent).toBe(false);

    const mismatched = await checkUnsignedObjectPrivacy({
      url: "https://other-bucket.s3.us-east-1.amazonaws.com/probe.pdf",
      expectedUrl:
        "https://bits-statements-test.s3.us-east-1.amazonaws.com/probe.pdf",
      fetchImpl: async () => new Response(null, { status: 403 }),
    });
    expect(mismatched.status).toBe("inconclusive");
  });

  it("keeps failed-cleanup manifests run-owned and does not overwrite another run", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bits-probe-manifest-"));
    const first = await persistFailedCleanupManifest(
      {
        runId: "run-a",
        keys: ["org/run-a/source.pdf"],
        cleanupStatus: "unknown",
      },
      root,
    );
    const second = await persistFailedCleanupManifest(
      {
        runId: "run-b",
        keys: ["org/run-b/source.pdf"],
        cleanupStatus: "present",
      },
      root,
    );
    const overwrite = await persistFailedCleanupManifest(
      {
        runId: "run-a",
        keys: ["org/run-a/other.pdf"],
        cleanupStatus: "present",
      },
      root,
    );
    expect(first.wrote).toBe(true);
    expect(second.wrote).toBe(true);
    expect(overwrite.wrote).toBe(false);
    expect(first.filePath).toBe(path.join(root, statementPdfProbeManifestRelative("run-a")));
    const retained = JSON.parse(await readFile(first.filePath, "utf8")) as {
      keys: string[];
    };
    expect(retained.keys).toEqual(["org/run-a/source.pdf"]);
    const other = JSON.parse(await readFile(second.filePath, "utf8")) as {
      runId: string;
    };
    expect(other.runId).toBe("run-b");
  });

  it("retains failed restore cleanup evidence instead of overwriting another run", async () => {
    const { send } = memorySender();
    const refuseDelete: StatementS3Sender = async (command) => {
      if (commandName(command) === "DeleteObjectCommand") {
        return {};
      }
      return send(command);
    };
    const root = await mkdtemp(path.join(tmpdir(), "bits-restore-manifest-"));
    const report = await runStatementPdfRestoreRehearsal({
      apply: true,
      env: TEST_ENV,
      send: refuseDelete,
      runId: RUN_ID,
      manifestRoot: root,
    });
    expect(report.cleanedUp).toBe(false);
    expect(report.cleanupStatus).toBe("present");
    const manifestPath = path.join(root, statementPdfProbeManifestRelative(RUN_ID));
    const retained = JSON.parse(await readFile(manifestPath, "utf8")) as {
      runId: string;
      keys: string[];
    };
    expect(retained.runId).toBe(RUN_ID);
    expect(retained.keys.length).toBeGreaterThan(0);
  });

  it("classifies mock, emulator, and live-provider execution separately", () => {
    expect(
      classifyStatementPdfExecutionKind({ configured: false }),
    ).toBe("none");
    expect(
      classifyStatementPdfExecutionKind({
        configured: true,
        injectedSender: true,
      }),
    ).toBe("mock");
    expect(
      classifyStatementPdfExecutionKind({
        configured: true,
        endpoint: "http://127.0.0.1:9000",
      }),
    ).toBe("emulator");
    expect(
      classifyStatementPdfExecutionKind({ configured: true }),
    ).toBe("live-provider");
  });
});
