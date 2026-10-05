import { Readable } from "node:stream";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  deleteRemoteStatementPdf,
  openRemoteStatementPdf,
  writeRemoteStatementPdf,
} from "./statement-pdf-s3";

const config = {
  ok: true as const,
  backend: "s3" as const,
  bucket: "bits-statements",
  region: "us-east-1",
  forcePathStyle: true,
  prefix: "",
  allowInsecureHttp: false,
};

function pdfBytes(label = "ok") {
  return Buffer.from(`%PDF-1.4\n${label}\n`, "utf8");
}

describe("remote statement PDF adapter", () => {
  it("conditionally creates an object and never treats ETag as the checksum", async () => {
    const bytes = pdfBytes();
    const send = async () => ({ ETag: "not-a-sha256" });
    const written = await writeRemoteStatementPdf(
      config,
      { objectKey: "private/statements/o/s/file.pdf", bytes },
      send,
    );
    expect(written).toEqual({
      ok: true,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    });
  });

  it("maps a precondition failure to ALREADY_EXISTS", async () => {
    const send = async () => {
      const error = new Error("exists");
      error.name = "PreconditionFailed";
      (error as { $metadata?: { httpStatusCode: number } }).$metadata = {
        httpStatusCode: 412,
      };
      throw error;
    };
    await expect(
      writeRemoteStatementPdf(
        config,
        { objectKey: "private/statements/o/s/file.pdf", bytes: pdfBytes() },
        send,
      ),
    ).resolves.toEqual({ ok: false, reason: "ALREADY_EXISTS" });
  });

  it("rejects bad headers, oversized objects and checksum mismatches before serving", async () => {
    const notPdf = await openRemoteStatementPdf(
      config,
      { objectKey: "private/statements/o/s/file.pdf", checksum: null },
      async () => ({ Body: Buffer.from("not-pdf") }),
    );
    expect(notPdf.ok).toBe(false);

    const oversized = await openRemoteStatementPdf(
      config,
      { objectKey: "private/statements/o/s/file.pdf", checksum: null },
      async () => ({ ContentLength: 16 * 1024 * 1024, Body: pdfBytes() }),
    );
    expect(oversized.ok).toBe(false);

    const mismatch = await openRemoteStatementPdf(
      config,
      { objectKey: "private/statements/o/s/file.pdf", checksum: "a".repeat(64) },
      async () => ({ Body: pdfBytes() }),
    );
    expect(mismatch.ok).toBe(false);
  });

  it("opens a verified object from a bounded buffer", async () => {
    const bytes = pdfBytes("verified");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const opened = await openRemoteStatementPdf(
      config,
      { objectKey: "private/statements/o/s/file.pdf", checksum },
      async () => ({ Body: Readable.from(bytes), ContentLength: bytes.byteLength }),
    );
    expect(opened.ok).toBe(true);
    if (opened.ok) opened.stream.destroy();
  });

  it("treats missing objects as unavailable", async () => {
    const send = async () => {
      const error = new Error("missing");
      error.name = "NoSuchKey";
      (error as { $metadata?: { httpStatusCode: number } }).$metadata = {
        httpStatusCode: 404,
      };
      throw error;
    };
    await expect(
      openRemoteStatementPdf(
        config,
        { objectKey: "private/statements/o/s/file.pdf", checksum: null },
        send,
      ),
    ).resolves.toEqual({ ok: false, reason: "UNAVAILABLE" });
  });

  it("deletes only the supplied key", async () => {
    const keys: string[] = [];
    await deleteRemoteStatementPdf(
      config,
      "private/statements/o/s/file.pdf",
      async (command) => {
        keys.push(String((command as { input?: { Key?: string } }).input?.Key));
        return {};
      },
    );
    expect(keys).toEqual(["private/statements/o/s/file.pdf"]);
  });
});
