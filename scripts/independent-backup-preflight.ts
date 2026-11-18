import { assertUploadAllowed, type BackupUploadRequest } from "../lib/ops/independent-backup-guard";

function readFlag(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function readBytes(name: string) {
  const value = readFlag(name);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return Number(value);
}

function main() {
  const kind = readFlag("--kind");
  if (kind !== "postgres" && kind !== "statements") {
    throw new Error("Pass --kind postgres or --kind statements.");
  }
  const existingBucketBytes = readBytes("--existing-bytes");
  const incomingBytes = readBytes("--incoming-bytes");
  if (existingBucketBytes === undefined || incomingBytes === undefined) {
    throw new Error("Pass --existing-bytes and --incoming-bytes.");
  }
  const request: BackupUploadRequest = {
    kind,
    existingBucketBytes,
    incomingBytes,
    archiveBytes: readBytes("--archive-bytes"),
    statementObjects: readBytes("--statement-objects"),
    statementBytes: readBytes("--statement-bytes"),
  };
  assertUploadAllowed(request);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      upload: false,
      enforced: ["postgres-size", "statement-size", "stored-total"],
      documentedOnly: ["retention", "deletion-protection"],
      request,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Backup preflight failed.";
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
