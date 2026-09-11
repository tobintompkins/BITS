import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  authorizePortalStatementPdf: vi.fn(),
  recordPortalStatementAccess: vi.fn(),
  openAuthorizedStatementPdf: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/server/services/member-portal-statement-pdf.service", () => ({
  authorizePortalStatementPdf: mocks.authorizePortalStatementPdf,
  recordPortalStatementAccess: mocks.recordPortalStatementAccess,
}));

vi.mock("@/lib/storage/statement-pdf", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/storage/statement-pdf")
  >("@/lib/storage/statement-pdf");
  return {
    ...actual,
    openAuthorizedStatementPdf: mocks.openAuthorizedStatementPdf,
  };
});

import { GET } from "@/app/api/portal/statements/[id]/pdf/route";

const STATEMENT_ID = "00000000-0000-4000-8000-00000000b001";
const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const USER_ID = "00000000-0000-4000-8000-00000000c001";

function makeRequest(mode: string) {
  return new Request(
    `http://localhost/api/portal/statements/${STATEMENT_ID}/pdf?mode=${mode}`,
  );
}

function authorized(mode: "view" | "download") {
  return {
    status: "AUTHORIZED" as const,
    organizationId: ORG_ID,
    statementId: STATEMENT_ID,
    userAccountId: USER_ID,
    statementIdentifier: "STMT-2025",
    pdfStorageKey: `private/statements/${ORG_ID}/${STATEMENT_ID}/file.pdf`,
    pdfChecksum: null,
    mode,
  };
}

describe("GET /api/portal/statements/[id]/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.recordPortalStatementAccess.mockResolvedValue(undefined);
  });

  it("returns 401 for signed-out users", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await GET(makeRequest("view"), {
      params: Promise.resolve({ id: STATEMENT_ID }),
    });
    expect(response.status).toBe(401);
    expect(mocks.authorizePortalStatementPdf).not.toHaveBeenCalled();
    expect(mocks.recordPortalStatementAccess).not.toHaveBeenCalled();
  });

  it("returns the same 404 for unauthorized or missing statements", async () => {
    mocks.authorizePortalStatementPdf.mockResolvedValue({
      status: "NOT_AVAILABLE",
    });
    const response = await GET(makeRequest("view"), {
      params: Promise.resolve({ id: STATEMENT_ID }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(mocks.recordPortalStatementAccess).not.toHaveBeenCalled();
  });

  it("rejects invalid mode without creating an access event", async () => {
    mocks.authorizePortalStatementPdf.mockResolvedValue({
      status: "INVALID_REQUEST",
    });
    const response = await GET(makeRequest("preview"), {
      params: Promise.resolve({ id: STATEMENT_ID }),
    });
    expect(response.status).toBe(400);
    expect(mocks.recordPortalStatementAccess).not.toHaveBeenCalled();
  });

  it("lets an owner view a valid PDF and records VIEWED", async () => {
    mocks.authorizePortalStatementPdf.mockResolvedValue(authorized("view"));
    mocks.openAuthorizedStatementPdf.mockResolvedValue({
      ok: true,
      absolutePath: "/tmp/hidden",
      stream: Readable.from([Buffer.from("%PDF-1.4\n")]),
    });

    const response = await GET(makeRequest("view"), {
      params: Promise.resolve({ id: STATEMENT_ID }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="STMT-2025.pdf"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = await response.text();
    expect(body).not.toContain("private/statements");
    expect(body).not.toContain("/tmp/hidden");
    expect(mocks.recordPortalStatementAccess).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      userAccountId: USER_ID,
      mode: "view",
    });
  });

  it("records DOWNLOADED for attachment mode", async () => {
    mocks.authorizePortalStatementPdf.mockResolvedValue(authorized("download"));
    mocks.openAuthorizedStatementPdf.mockResolvedValue({
      ok: true,
      absolutePath: "/tmp/hidden",
      stream: Readable.from([Buffer.from("%PDF-1.4\n")]),
    });
    const response = await GET(makeRequest("download"), {
      params: Promise.resolve({ id: STATEMENT_ID }),
    });
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(mocks.recordPortalStatementAccess).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "download" }),
    );
  });

  it("does not record access when the file is unavailable", async () => {
    mocks.authorizePortalStatementPdf.mockResolvedValue(authorized("view"));
    mocks.openAuthorizedStatementPdf.mockResolvedValue({
      ok: false,
      reason: "UNAVAILABLE",
    });
    const response = await GET(makeRequest("view"), {
      params: Promise.resolve({ id: STATEMENT_ID }),
    });
    expect(response.status).toBe(404);
    expect(mocks.recordPortalStatementAccess).not.toHaveBeenCalled();
    const json = await response.json();
    expect(JSON.stringify(json)).not.toMatch(/storage|private\/statements|\/tmp/i);
  });
});
