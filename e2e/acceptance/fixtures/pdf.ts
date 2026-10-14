import { buildPrivateStatementPdfStorageKey, writePrivateStatementPdf } from "@/lib/storage/statement-pdf";

export function originalV1PdfBytes(marker: string) {
  const body = [
    "%PDF-1.4",
    `% ${marker}`,
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj",
    "3 0 obj<</Type/Page/MediaBox[0 0 72 72]/Parent 2 0 R>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
    "",
  ].join("\n");
  return Buffer.from(body, "utf8");
}

export async function writeOriginalV1StatementPdf(input: {
  organizationId: string;
  statementId: string;
  marker: string;
}) {
  const storageKey = buildPrivateStatementPdfStorageKey(
    input.organizationId,
    input.statementId,
    "statement.pdf",
  );
  const bytes = originalV1PdfBytes(input.marker);
  const written = await writePrivateStatementPdf({
    organizationId: input.organizationId,
    statementId: input.statementId,
    storageKey,
    bytes,
  });
  if (!written.ok) {
    throw new Error(
      `Unable to write the isolated original-v1 statement PDF fixture (${written.reason}).`,
    );
  }
  return { storageKey, checksum: written.checksum, bytes };
}
