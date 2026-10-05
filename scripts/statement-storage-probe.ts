import { randomUUID } from "node:crypto";

import {
  resolveStatementPdfS3Config,
  resolveStatementPdfWriteConfig,
} from "../lib/storage/statement-pdf-config";
import {
  deleteRemoteStatementPdf,
  openRemoteStatementPdf,
  writeRemoteStatementPdf,
} from "../lib/storage/statement-pdf-s3";

const PROBE_ORG = "00000000-0000-4000-8000-00000000f00d";

async function main() {
  const write = resolveStatementPdfWriteConfig();
  if (!write.ok || write.backend !== "s3") {
    console.error(
      "Probe requires BITS_STATEMENT_PDF_BACKEND=s3 and a valid private bucket configuration. No real statement records were used.",
    );
    process.exit(2);
  }
  const config = resolveStatementPdfS3Config();
  if (!config.ok || config.backend !== "s3") {
    console.error(config.ok ? "S3 configuration is not ready." : config.message);
    process.exit(2);
  }

  const statementId = randomUUID();
  const objectKey = `private/statements/${PROBE_ORG}/${statementId}/probe.pdf`;
  const bytes = Buffer.from("%PDF-1.4\nBITS statement storage probe\n", "utf8");
  const written = await writeRemoteStatementPdf(config, { objectKey, bytes });
  if (!written.ok) {
    console.error(`Probe write failed: ${written.reason}`);
    process.exit(2);
  }
  const opened = await openRemoteStatementPdf(config, {
    objectKey,
    checksum: written.checksum,
  });
  if (!opened.ok) {
    console.error("Probe read/checksum failed.");
    process.exit(2);
  }
  opened.stream.destroy();
  await deleteRemoteStatementPdf(config, objectKey);
  console.log(
    JSON.stringify(
      {
        ok: true,
        synthetic: true,
        usedRealStatement: false,
        checksumVerified: true,
        cleanedUp: true,
      },
      null,
      2,
    ),
  );
}

main().catch(() => {
  console.error("Statement storage probe failed.");
  process.exit(1);
});
