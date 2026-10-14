import { Readable } from "node:stream";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildStatementPdfProbeKeys,
  checkUnsignedObjectPrivacy,
  preflightStatementPdfProbe,
  redactStatementPdfProbeText,
  runStatementPdfRestoreRehearsal,
  runStatementPdfStorageProbe,
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
});
