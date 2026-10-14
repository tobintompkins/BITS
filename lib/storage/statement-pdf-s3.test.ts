import { Readable } from "node:stream";
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  deleteAndVerifyRemoteStatementPdf,
  deleteRemoteStatementPdf,
  inspectRemoteStatementPdf,
  openRemoteStatementPdf,
  readStatementPdfBody,
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

  it("streams incrementally and never calls transformToByteArray on an SDK-like body", async () => {
    const transformToByteArray = vi.fn(async () => Buffer.alloc(20 * 1024 * 1024));
    const stream = Readable.from([
      Buffer.alloc(8 * 1024 * 1024, 1),
      Buffer.alloc(8 * 1024 * 1024, 2),
    ]);
    Object.assign(stream, { transformToByteArray });
    await expect(
      readStatementPdfBody(stream, 15 * 1024 * 1024),
    ).resolves.toBeNull();
    expect(transformToByteArray).not.toHaveBeenCalled();
  });

  it("enforces the size cap when ContentLength is missing", async () => {
    const oversized = Readable.from([
      Buffer.from("%PDF-1.4\n"),
      Buffer.alloc(15 * 1024 * 1024, 9),
    ]);
    const opened = await openRemoteStatementPdf(
      config,
      { objectKey: "private/statements/o/s/file.pdf", checksum: null },
      async () => ({ Body: oversized }),
    );
    expect(opened.ok).toBe(false);
  });

  it("reports write and inspect timeouts instead of success", async () => {
    const send = async () => {
      const error = new Error("aborted");
      error.name = "TimeoutError";
      throw error;
    };
    await expect(
      writeRemoteStatementPdf(
        config,
        { objectKey: "private/statements/o/s/file.pdf", bytes: pdfBytes() },
        send,
      ),
    ).resolves.toEqual({ ok: false, reason: "TIMEOUT" });
    await expect(
      inspectRemoteStatementPdf(
        config,
        "private/statements/o/s/file.pdf",
        send,
      ),
    ).resolves.toEqual({ status: "unknown", reason: "TIMEOUT" });
  });

  it("reports cleanup failed when the exact key is still readable", async () => {
    const bytes = pdfBytes("still-here");
    const verified = await deleteAndVerifyRemoteStatementPdf(
      config,
      "private/statements/o/s/file.pdf",
      async (command) => {
        const name = (command as { constructor?: { name?: string } }).constructor
          ?.name;
        if (name === "DeleteObjectCommand") return {};
        return { Body: bytes, ContentLength: bytes.byteLength };
      },
    );
    expect(verified.cleanedUp).toBe(false);
    expect(verified.status).toBe("present");
  });

  it("does not treat a silent delete as cleanup proof", async () => {
    const send = async () => {
      const error = new Error("denied");
      error.name = "AccessDenied";
      (error as { $metadata?: { httpStatusCode: number } }).$metadata = {
        httpStatusCode: 403,
      };
      throw error;
    };
    await deleteRemoteStatementPdf(
      config,
      "private/statements/o/s/file.pdf",
      send,
    );
    const verified = await deleteAndVerifyRemoteStatementPdf(
      config,
      "private/statements/o/s/file.pdf",
      send,
    );
    expect(verified).toEqual({
      cleanedUp: false,
      status: "unknown",
      reason: "Delete was denied; absence was not verified.",
    });
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
