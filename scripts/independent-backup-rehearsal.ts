import { spawn, spawnSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  BackupGuardError,
  assertAgeRecipient,
  assertUploadAllowed,
  independentBackupBucket,
  withBackupTimeout,
  withBoundedRetries,
} from "../lib/ops/independent-backup-guard";

const dumpPath = join(
  process.cwd(),
  "e2e/.local/database-recovery/2026111717161546d41ce7/bits-test-db.dump",
);
const expectedDumpSha256 = "9429863446c929ef21d5151c916ed85cfe7cc1a2f8fa3fecdd75749e4fa9e50f";
const identityPath = join(homedir(), "Library/Application Support/BITS/independent-backup/age-identity.txt");
const ageBin = join(homedir(), ".local/bin/age");
const prefix = "test/rehearsal/manual-20261117/";
const dumpKey = `${prefix}bits-test-db.dump.age`;
const pdfKey = `${prefix}synthetic-statement.pdf.age`;
const approvedKeys = [dumpKey, pdfKey] as const;

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameBytes(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function publicError(error: unknown) {
  if (error instanceof BackupGuardError) return error.message;
  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name?: unknown }).name ?? "Error");
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    return status ? `${name} HTTP ${status}` : name;
  }
  return "Backup rehearsal failed.";
}

function syntheticPdf() {
  const stream = "BT /F1 12 Tf 36 100 Td (BITS synthetic backup rehearsal. No church records.) Tj ET\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xrefStart = Buffer.byteLength(body);
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, "utf8");
}

function readPublicRecipient() {
  const recipient = readFileSync(identityPath, "utf8")
    .split("\n")
    .find((line) => line.startsWith("# public key:"))
    ?.replace("# public key:", "")
    .trim();
  return assertAgeRecipient(recipient);
}

function loadUploadCredential() {
  const result = spawnSyncSecurity();
  const parsed = JSON.parse(result) as {
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    bucket?: string;
  };
  if (parsed.bucket !== independentBackupBucket) {
    throw new BackupGuardError("Keychain credential is not scoped to the approved bucket.");
  }
  if (!parsed.accessKeyId || !parsed.secretAccessKey || !parsed.endpoint?.startsWith("https://")) {
    throw new BackupGuardError("Keychain credential is incomplete.");
  }
  return {
    accessKeyId: parsed.accessKeyId,
    secretAccessKey: parsed.secretAccessKey,
    endpoint: parsed.endpoint,
  };
}

function spawnSyncSecurity() {
  const result = spawnSync(
    "security",
    ["find-generic-password", "-s", "bits-independent-backups-upload", "-a", "r2-object-read-write", "-w"],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new BackupGuardError("Upload credential was not readable from the keychain.");
  }
  return result.stdout.trim();
}

function runAge(args: string[], signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ageBin, args, { stdio: "ignore" });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => {
      if (!child.killed) child.kill("SIGKILL");
      finish(new BackupGuardError("Backup timed out after 120000ms."));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (signal.aborted) return;
      if (code === 0) finish();
      else finish(new BackupGuardError(`age exited ${code ?? "unknown"}.`));
    });
  });
}

async function guarded<T>(operation: (signal: AbortSignal) => Promise<T>) {
  return withBoundedRetries(() => withBackupTimeout(operation));
}

async function main() {
  if (!process.argv.includes("--apply")) {
    throw new BackupGuardError("Refusing to upload without --apply. Recurring backups stay disabled.");
  }
  const recipient = readPublicRecipient();
  const credential = loadUploadCredential();
  const dump = readFileSync(dumpPath);
  const dumpChecksum = sha256(dump);
  if (dumpChecksum !== expectedDumpSha256) {
    throw new BackupGuardError("The existing TEST dump checksum does not match the recorded empty-schema dump.");
  }
  const pdf = syntheticPdf();
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new BackupGuardError("Synthetic PDF is not a PDF.");
  }
  const work = mkdtempSync(join(tmpdir(), "bits-backup-rehearsal-"));
  const client = new S3Client({
    region: "auto",
    endpoint: credential.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: credential.accessKeyId,
      secretAccessKey: credential.secretAccessKey,
    },
    maxAttempts: 1,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  let uploaded = false;
  let verified = false;
  try {
    const encryptedDumpPath = join(work, "dump.age");
    const encryptedPdfPath = join(work, "statement.age");
    await guarded((signal) => runAge(["-r", recipient, "-o", encryptedDumpPath, dumpPath], signal));
    writeFileSync(join(work, "synthetic.pdf"), pdf);
    await guarded((signal) =>
      runAge(["-r", recipient, "-o", encryptedPdfPath, join(work, "synthetic.pdf")], signal),
    );
    const encryptedDump = readFileSync(encryptedDumpPath);
    const encryptedPdf = readFileSync(encryptedPdfPath);
    const existing = await guarded((signal) => listBucket(client, signal));
    if (existing.keys.some((key) => approvedKeys.includes(key as (typeof approvedKeys)[number]))) {
      throw new BackupGuardError("This rehearsal's object names already exist. Nothing was overwritten.");
    }
    assertUploadAllowed({
      kind: "postgres",
      archiveBytes: dump.length,
      existingBucketBytes: existing.bytes,
      incomingBytes: encryptedDump.length,
    });
    assertUploadAllowed({
      kind: "statements",
      statementObjects: 1,
      statementBytes: pdf.length,
      existingBucketBytes: existing.bytes + encryptedDump.length,
      incomingBytes: encryptedPdf.length,
    });
    await upload(client, dumpKey, encryptedDump);
    await upload(client, pdfKey, encryptedPdf);
    uploaded = true;
    const downloadedDump = await download(client, dumpKey);
    const downloadedPdf = await download(client, pdfKey);
    if (!sameBytes(downloadedDump, encryptedDump) || !sameBytes(downloadedPdf, encryptedPdf)) {
      throw new BackupGuardError("Downloaded ciphertext does not match the uploaded ciphertext.");
    }
    const decryptedDumpPath = join(work, "dump.out");
    const decryptedPdfPath = join(work, "statement.out");
    writeFileSync(join(work, "downloaded-dump.age"), downloadedDump);
    await guarded((signal) =>
      runAge(["-d", "-i", identityPath, "-o", decryptedDumpPath, join(work, "downloaded-dump.age")], signal),
    );
    writeFileSync(join(work, "downloaded-pdf.age"), downloadedPdf);
    await guarded((signal) =>
      runAge(["-d", "-i", identityPath, "-o", decryptedPdfPath, join(work, "downloaded-pdf.age")], signal),
    );
    const decryptedDump = readFileSync(decryptedDumpPath);
    const decryptedPdf = readFileSync(decryptedPdfPath);
    const dumpMatch = sameBytes(decryptedDump, dump) && sha256(decryptedDump) === dumpChecksum;
    const pdfMatch = sameBytes(decryptedPdf, pdf) && sha256(decryptedPdf) === sha256(pdf);
    if (!dumpMatch || !pdfMatch) {
      throw new BackupGuardError("Decrypted checksums did not match. Uploaded objects were left in place.");
    }
    verified = true;
    await deleteApproved(client, dumpKey);
    await deleteApproved(client, pdfKey);
    const after = await guarded((signal) => listBucket(client, signal));
    const leftover = after.keys.filter((key) => approvedKeys.includes(key as (typeof approvedKeys)[number]));
    if (leftover.length > 0) {
      throw new BackupGuardError("Approved rehearsal objects were still present after deletion.");
    }
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        recurring: false,
        offlineRecoveryKey: "incomplete",
        bucket: independentBackupBucket,
        prefix,
        existingBucketBytesBefore: existing.bytes,
        otherObjectCountBefore: existing.keys.length,
        dump: {
          bytes: dump.length,
          sha256: dumpChecksum,
          encryptedBytes: encryptedDump.length,
          decryptedSha256: sha256(decryptedDump),
          match: true,
        },
        syntheticPdf: {
          bytes: pdf.length,
          sha256: sha256(pdf),
          encryptedBytes: encryptedPdf.length,
          decryptedSha256: sha256(decryptedPdf),
          match: true,
        },
        deletedKeys: approvedKeys,
        otherObjectCountAfter: after.keys.length,
      })}\n`,
    );
  } catch (error) {
    if (uploaded && !verified) {
      process.stderr.write("Checksum verification did not pass, so rehearsal objects were not deleted.\n");
    }
    throw error;
  } finally {
    client.destroy();
    rmSync(work, { recursive: true, force: true });
  }
}

async function listBucket(client: S3Client, signal: AbortSignal) {
  const keys: string[] = [];
  let bytes = 0;
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: independentBackupBucket,
        ContinuationToken: token,
      }),
      { abortSignal: signal },
    );
    for (const object of page.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
      bytes += object.Size ?? 0;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { keys, bytes };
}

async function upload(client: S3Client, key: string, body: Buffer) {
  if (!approvedKeys.includes(key as (typeof approvedKeys)[number])) {
    throw new BackupGuardError("Refusing to upload an unapproved object.");
  }
  await guarded((signal) =>
    client.send(
      new PutObjectCommand({
        Bucket: independentBackupBucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: "application/octet-stream",
      }),
      { abortSignal: signal },
    ),
  );
}

async function download(client: S3Client, key: string) {
  return guarded(async (signal) => {
    const response = await client.send(
      new GetObjectCommand({ Bucket: independentBackupBucket, Key: key }),
      { abortSignal: signal },
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new BackupGuardError("Downloaded object was empty.");
    return Buffer.from(bytes);
  });
}

async function deleteApproved(client: S3Client, key: string) {
  if (!approvedKeys.includes(key as (typeof approvedKeys)[number])) {
    throw new BackupGuardError("Refusing to delete an object outside this rehearsal.");
  }
  await guarded((signal) =>
    client.send(new DeleteObjectCommand({ Bucket: independentBackupBucket, Key: key }), { abortSignal: signal }),
  );
  await guarded(async (signal) => {
    try {
      await client.send(new HeadObjectCommand({ Bucket: independentBackupBucket, Key: key }), { abortSignal: signal });
    } catch (error) {
      const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (name === "NotFound" || name === "NoSuchKey" || status === 404) return;
      throw error;
    }
    throw new BackupGuardError("A rehearsal object was still present after deletion.");
  });
}

main().catch((error) => {
  process.stderr.write(`${publicError(error)}\n`);
  process.exit(1);
});
