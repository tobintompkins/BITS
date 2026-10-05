import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  deletePdf: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    contributionStatement: { findUnique: m.findUnique },
  },
}));

vi.mock("@/lib/storage/statement-pdf", () => ({
  deletePrivateStatementPdf: m.deletePdf,
}));

import { deleteUnreferencedPrivateStatementPdf } from "./statement-pdf-cleanup";

const input = {
  organizationId: "org-a",
  statementId: "stmt-a",
  storageKey: "private/statements/org-a/stmt-a/file.pdf",
};

describe("unreferenced statement PDF cleanup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not delete a PDF that is already referenced by a committed statement", async () => {
    m.findUnique.mockResolvedValue({
      organizationId: "org-a",
      pdfStorageKey: input.storageKey,
    });
    await deleteUnreferencedPrivateStatementPdf(input);
    expect(m.deletePdf).not.toHaveBeenCalled();
  });

  it("deletes only an unreferenced failed-attempt artifact", async () => {
    m.findUnique.mockResolvedValue(null);
    await deleteUnreferencedPrivateStatementPdf(input);
    expect(m.deletePdf).toHaveBeenCalledWith(input);
  });
});
