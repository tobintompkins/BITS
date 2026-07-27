import { describe, expect, it } from "vitest";

import {
  MAX_MEMBER_DOCUMENT_BYTES,
  validateMemberDocumentFile,
} from "@/lib/storage/member-document";

function fakeFile(name: string, size: number, type: string) {
  const blob = new Blob([new Uint8Array(Math.min(size, 64))], { type });
  Object.defineProperty(blob, "size", { value: size });
  Object.defineProperty(blob, "name", { value: name });
  return blob as File;
}

describe("validateMemberDocumentFile", () => {
  it("allows PDF documents", () => {
    const result = validateMemberDocumentFile(
      fakeFile("certificate.pdf", 1024, "application/pdf"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extension).toBe(".pdf");
      expect(result.mimeType).toBe("application/pdf");
    }
  });

  it("rejects executable files", () => {
    const result = validateMemberDocumentFile(
      fakeFile("malware.exe", 1024, "application/octet-stream"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/executable/i);
    }
  });

  it("rejects oversized files", () => {
    const result = validateMemberDocumentFile(
      fakeFile("huge.pdf", MAX_MEMBER_DOCUMENT_BYTES + 1, "application/pdf"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/10MB/i);
    }
  });
});
