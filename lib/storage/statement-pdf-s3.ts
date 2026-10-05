import { Readable } from "node:stream";
import { createHash, timingSafeEqual } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import {
  STATEMENT_PDF_MAX_BYTES,
  STATEMENT_PDF_OPERATION_TIMEOUT_MS,
  type StatementPdfS3Config,
} from "@/lib/storage/statement-pdf-config";

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

export type StatementPdfS3WriteResult =
  | { ok: true; checksum: string }
  | {
      ok: false;
      reason: "INVALID_PDF" | "ALREADY_EXISTS" | "UNAVAILABLE";
    };

export type StatementPdfS3OpenResult =
  | { ok: true; stream: Readable; byteLength: number }
  | { ok: false; reason: "UNAVAILABLE" };

let client: S3Client | null = null;
let clientSignature = "";

export type StatementS3Sender = (command: unknown) => Promise<unknown>;

function configSignature(config: StatementPdfS3Config) {
  return [
    config.bucket,
    config.region,
    config.endpoint ?? "",
    config.forcePathStyle ? "1" : "0",
  ].join("|");
}

export function resetStatementS3ClientForTests() {
  client = null;
  clientSignature = "";
}

function getClient(config: StatementPdfS3Config) {
  const signature = configSignature(config);
  if (client && clientSignature === signature) return client;
  const options: S3ClientConfig = {
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
  if (config.endpoint) {
    options.endpoint = config.endpoint;
  }
  client = new S3Client(options);
  clientSignature = signature;
  return client;
}

function objectKey(config: StatementPdfS3Config, logicalKey: string) {
  return `${config.prefix}${logicalKey}`;
}

function abortSignal() {
  return AbortSignal.timeout(STATEMENT_PDF_OPERATION_TIMEOUT_MS);
}

function s3ErrorName(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const name =
    "name" in error && typeof error.name === "string" ? error.name : "";
  const code =
    "$metadata" in error &&
    error.$metadata &&
    typeof error.$metadata === "object" &&
    "httpStatusCode" in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : 0;
  return `${name}:${code}`;
}

function isAlreadyExists(error: unknown) {
  const key = s3ErrorName(error);
  return (
    key.includes("PreconditionFailed") ||
    key.includes(":412") ||
    key.includes("ConditionalRequestConflict")
  );
}

function isMissing(error: unknown) {
  const key = s3ErrorName(error);
  return (
    key.includes("NoSuchKey") ||
    key.includes("NotFound") ||
    key.includes(":404")
  );
}

async function readBody(body: unknown, maxBytes: number) {
  if (!body) return null;
  if (body instanceof Uint8Array) {
    if (body.byteLength > maxBytes) return null;
    return Buffer.from(body);
  }
  if (typeof body === "string") {
    const buffer = Buffer.from(body);
    return buffer.byteLength > maxBytes ? null : buffer;
  }
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (
      body as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    if (bytes.byteLength > maxBytes) return null;
    return Buffer.from(bytes);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > maxBytes) return null;
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }
  return null;
}

export async function writeRemoteStatementPdf(
  config: StatementPdfS3Config,
  input: {
    objectKey: string;
    bytes: Uint8Array;
  },
  send?: StatementS3Sender,
): Promise<StatementPdfS3WriteResult> {
  if (
    input.bytes.byteLength <= 0 ||
    input.bytes.byteLength > STATEMENT_PDF_MAX_BYTES
  ) {
    return { ok: false, reason: "INVALID_PDF" };
  }
  const header = Buffer.from(input.bytes.subarray(0, PDF_MAGIC.length));
  if (!header.equals(PDF_MAGIC)) {
    return { ok: false, reason: "INVALID_PDF" };
  }
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey(config, input.objectKey),
    Body: Buffer.from(input.bytes),
    ContentType: "application/pdf",
    ContentLength: input.bytes.byteLength,
    IfNoneMatch: "*",
  });
  try {
    await (send ?? ((next) => getClient(config).send(next as never)))(command);
  } catch (error) {
    if (isAlreadyExists(error)) {
      return { ok: false, reason: "ALREADY_EXISTS" };
    }
    return { ok: false, reason: "UNAVAILABLE" };
  }
  return { ok: true, checksum };
}

export async function openRemoteStatementPdf(
  config: StatementPdfS3Config,
  input: {
    objectKey: string;
    checksum: string | null | undefined;
  },
  send?: StatementS3Sender,
): Promise<StatementPdfS3OpenResult> {
  try {
    const response = (await (
      send ?? ((next) => getClient(config).send(next as never, { abortSignal: abortSignal() }))
    )(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: objectKey(config, input.objectKey),
      }),
    )) as {
      ContentLength?: number;
      Body?: unknown;
    };
    if (
      typeof response.ContentLength === "number" &&
      (response.ContentLength <= 0 ||
        response.ContentLength > STATEMENT_PDF_MAX_BYTES)
    ) {
      return { ok: false, reason: "UNAVAILABLE" };
    }
    const bytes = await readBody(response.Body, STATEMENT_PDF_MAX_BYTES);
    if (!bytes || bytes.byteLength <= 0) {
      return { ok: false, reason: "UNAVAILABLE" };
    }
    if (!bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      return { ok: false, reason: "UNAVAILABLE" };
    }
    if (input.checksum?.trim()) {
      const expected = input.checksum.trim().toLowerCase();
      const actual = createHash("sha256").update(bytes).digest("hex");
      const expectedBuf = Buffer.from(expected, "hex");
      const actualBuf = Buffer.from(actual, "hex");
      if (
        !/^[0-9a-f]{64}$/.test(expected) ||
        expectedBuf.length !== actualBuf.length ||
        !timingSafeEqual(expectedBuf, actualBuf)
      ) {
        return { ok: false, reason: "UNAVAILABLE" };
      }
    }
    return {
      ok: true,
      stream: Readable.from(bytes),
      byteLength: bytes.byteLength,
    };
  } catch (error) {
    if (isMissing(error)) {
      return { ok: false, reason: "UNAVAILABLE" };
    }
    return { ok: false, reason: "UNAVAILABLE" };
  }
}

export async function deleteRemoteStatementPdf(
  config: StatementPdfS3Config,
  objectKeyValue: string,
  send?: StatementS3Sender,
): Promise<void> {
  try {
    await (send ?? ((next) => getClient(config).send(next as never)))(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: objectKey(config, objectKeyValue),
      }),
    );
  } catch {
    // Compensating cleanup is best-effort for a single proven key.
  }
}
