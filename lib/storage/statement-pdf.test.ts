import { createHash } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildPrivateStatementPdfStorageKey,
  deletePrivateStatementPdf,
  isSafeStatementPdfStorageKey,
  openAuthorizedStatementPdf,
  sanitizeStatementPdfFileName,
  writePrivateStatementPdf,
} from "@/lib/storage/statement-pdf";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const STATEMENT_ID = "00000000-0000-4000-8000-00000000b001";

const previousRoot = process.env.BITS_FILE_STORAGE_ROOT;

async function withTempRoot() {
  const root = path.join(
    os.tmpdir(),
    `bits-statement-pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  process.env.BITS_FILE_STORAGE_ROOT = root;
  const dir = path.join(
    root,
    "storage",
    "private",
    "statements",
    ORG_ID,
    STATEMENT_ID,
  );
  await mkdir(dir, { recursive: true });
  return { root, dir };
}

function pdfBytes(extra = "1 0 obj\n<<>>\nendobj\n") {
  return Buffer.from(`%PDF-1.4\n${extra}`, "utf8");
}

afterEach(() => {
  if (previousRoot === undefined) {
    delete process.env.BITS_FILE_STORAGE_ROOT;
  } else {
    process.env.BITS_FILE_STORAGE_ROOT = previousRoot;
  }
});

describe("statement PDF storage adapter", () => {
  it("sanitizes the statement identifier as a .pdf filename", () => {
    expect(sanitizeStatementPdfFileName("STMT 2025 / A")).toBe("STMT_2025_A.pdf");
    expect(sanitizeStatementPdfFileName("../secret")).toBe("secret.pdf");
  });

  it("rejects traversal, absolute paths, and cross-statement keys", () => {
    expect(
      isSafeStatementPdfStorageKey(
        `private/statements/${ORG_ID}/${STATEMENT_ID}/file.pdf`,
        ORG_ID,
        STATEMENT_ID,
      ),
    ).toBe(true);
    expect(
      isSafeStatementPdfStorageKey(
        `private/statements/${ORG_ID}/${STATEMENT_ID}/../other.pdf`,
        ORG_ID,
        STATEMENT_ID,
      ),
    ).toBe(false);
    expect(
      isSafeStatementPdfStorageKey(
        `/tmp/private/statements/${ORG_ID}/${STATEMENT_ID}/file.pdf`,
        ORG_ID,
        STATEMENT_ID,
      ),
    ).toBe(false);
    expect(
      isSafeStatementPdfStorageKey(
        `private/statements/${ORG_ID}/00000000-0000-4000-8000-00000000ffff/file.pdf`,
        ORG_ID,
        STATEMENT_ID,
      ),
    ).toBe(false);
  });

  it("opens a valid PDF whose checksum matches", async () => {
    const { dir } = await withTempRoot();
    const bytes = pdfBytes();
    const filePath = path.join(dir, "statement.pdf");
    await writeFile(filePath, bytes);
    const checksum = createHash("sha256").update(bytes).digest("hex");

    const opened = await openAuthorizedStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey: `private/statements/${ORG_ID}/${STATEMENT_ID}/statement.pdf`,
      checksum,
    });
    expect(opened.ok).toBe(true);
    if (opened.ok) opened.stream.destroy();
  });

  it("rejects a missing file", async () => {
    await withTempRoot();
    const opened = await openAuthorizedStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey: `private/statements/${ORG_ID}/${STATEMENT_ID}/missing.pdf`,
      checksum: null,
    });
    expect(opened.ok).toBe(false);
  });

  it("rejects a non-PDF file", async () => {
    const { dir } = await withTempRoot();
    await writeFile(path.join(dir, "note.pdf"), "not a pdf");
    const opened = await openAuthorizedStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey: `private/statements/${ORG_ID}/${STATEMENT_ID}/note.pdf`,
      checksum: null,
    });
    expect(opened.ok).toBe(false);
  });

  it("rejects a checksum mismatch", async () => {
    const { dir } = await withTempRoot();
    await writeFile(path.join(dir, "statement.pdf"), pdfBytes());
    const opened = await openAuthorizedStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey: `private/statements/${ORG_ID}/${STATEMENT_ID}/statement.pdf`,
      checksum: "a".repeat(64),
    });
    expect(opened.ok).toBe(false);
  });

  it("rejects an escaped symlink", async () => {
    const { root, dir } = await withTempRoot();
    const outside = path.join(root, "outside.pdf");
    await writeFile(outside, pdfBytes());
    await symlink(outside, path.join(dir, "escaped.pdf"));

    const opened = await openAuthorizedStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey: `private/statements/${ORG_ID}/${STATEMENT_ID}/escaped.pdf`,
      checksum: null,
    });
    expect(opened.ok).toBe(false);
  });

  it("writes a PDF exclusively and returns a checksum", async () => {
    await withTempRoot();
    const bytes = pdfBytes();
    const storageKey = buildPrivateStatementPdfStorageKey(
      ORG_ID,
      STATEMENT_ID,
      "IND-2026-ABCD",
    );
    const written = await writePrivateStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey,
      bytes,
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    expect(written.checksum).toBe(createHash("sha256").update(bytes).digest("hex"));

    const opened = await openAuthorizedStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey,
      checksum: written.checksum,
    });
    expect(opened.ok).toBe(true);
    if (opened.ok) opened.stream.destroy();
  });

  it("does not overwrite an existing statement PDF", async () => {
    await withTempRoot();
    const storageKey = buildPrivateStatementPdfStorageKey(
      ORG_ID,
      STATEMENT_ID,
      "statement",
    );
    const first = await writePrivateStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey,
      bytes: pdfBytes("first"),
    });
    expect(first.ok).toBe(true);
    const second = await writePrivateStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey,
      bytes: pdfBytes("second"),
    });
    expect(second).toEqual({ ok: false, reason: "ALREADY_EXISTS" });
  });

  it("rejects traversal keys on write and cleanup", async () => {
    await withTempRoot();
    const unsafe = `private/statements/${ORG_ID}/${STATEMENT_ID}/../secret.pdf`;
    await expect(
      writePrivateStatementPdf({
        organizationId: ORG_ID,
        statementId: STATEMENT_ID,
        storageKey: unsafe,
        bytes: pdfBytes(),
      }),
    ).resolves.toEqual({ ok: false, reason: "UNSAFE_KEY" });
    await deletePrivateStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey: unsafe,
    });
  });

  it("rejects non-PDF bytes on write", async () => {
    await withTempRoot();
    await expect(
      writePrivateStatementPdf({
        organizationId: ORG_ID,
        statementId: STATEMENT_ID,
        storageKey: buildPrivateStatementPdfStorageKey(
          ORG_ID,
          STATEMENT_ID,
          "note",
        ),
        bytes: Buffer.from("not a pdf"),
      }),
    ).resolves.toEqual({ ok: false, reason: "INVALID_PDF" });
  });

  it("cleans up a written PDF used to compensate a failed record create", async () => {
    await withTempRoot();
    const storageKey = buildPrivateStatementPdfStorageKey(
      ORG_ID,
      STATEMENT_ID,
      "IND-2026-CLEAN",
    );
    const written = await writePrivateStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey,
      bytes: pdfBytes(),
    });
    expect(written.ok).toBe(true);
    await deletePrivateStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey,
    });
    const opened = await openAuthorizedStatementPdf({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      storageKey,
      checksum: null,
    });
    expect(opened.ok).toBe(false);
  });
});
