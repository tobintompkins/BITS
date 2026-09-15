import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type StatementRow = {
  id: string;
  organizationId: string;
  statementType: StatementType;
  status: StatementStatus;
  householdId: string | null;
  statementIdentifier: string;
  pdfStorageKey: string;
  pdfChecksum: string | null;
};

const store = vi.hoisted(() => ({
  statements: [] as StatementRow[],
  lastFindFirstWhere: null as unknown,
  findFirstCalls: 0,
}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getGivingAccess: vi.fn(),
  openAuthorizedStatementPdf: vi.fn(),
  createAuditEvent: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/giving-permissions", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/giving-permissions")
  >("@/lib/auth/giving-permissions");
  return {
    ...actual,
    getGivingAccess: mocks.getGivingAccess,
    requireStatementManageAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canManageStatements) throw new Error("denied");
      return access;
    },
  };
});

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
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

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    contributionStatement: {
      findFirst: async ({
        where,
        select,
      }: {
        where: {
          id: string;
          organizationId: string;
          statementType: StatementType;
          status: StatementStatus;
          householdId: null;
        };
        select: Record<string, boolean>;
      }) => {
        store.findFirstCalls += 1;
        store.lastFindFirstWhere = { where, select };
        const row = store.statements.find(
          (statement) =>
            statement.id === where.id &&
            statement.organizationId === where.organizationId &&
            statement.statementType === where.statementType &&
            statement.status === where.status &&
            statement.householdId === where.householdId,
        );
        if (!row) return null;
        return {
          id: row.id,
          organizationId: row.organizationId,
          statementType: row.statementType,
          status: row.status,
          statementIdentifier: row.statementIdentifier,
          pdfStorageKey: row.pdfStorageKey,
          pdfChecksum: row.pdfChecksum,
        };
      },
    },
  },
}));

import { GET } from "@/app/api/staff/statements/[id]/pdf/route";
import { VIEW_GENERATED_CONTRIBUTION_STATEMENT } from "@/server/services/staff-generated-statement-pdf.service";

const STATEMENT_ID = "00000000-0000-4000-8000-00000000b001";
const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const CHECKSUM = "a".repeat(64);
const STORAGE_KEY = `private/statements/${ORG_ID}/${STATEMENT_ID}/IND-2026-ABCD.pdf`;

function makeRequest() {
  return new Request(
    `http://localhost/api/staff/statements/${STATEMENT_ID}/pdf`,
  );
}

function params(id = STATEMENT_ID) {
  return { params: Promise.resolve({ id }) };
}

function generatedStatement(
  overrides: Partial<StatementRow> = {},
): StatementRow {
  return {
    id: STATEMENT_ID,
    organizationId: ORG_ID,
    statementType: StatementType.INDIVIDUAL,
    status: StatementStatus.GENERATED,
    householdId: null,
    statementIdentifier: "IND-2026-ABCD",
    pdfStorageKey: STORAGE_KEY,
    pdfChecksum: CHECKSUM,
    ...overrides,
  };
}

function pdfStream() {
  const stream = Readable.from([Buffer.from("%PDF-1.4\n")]);
  const destroy = vi.spyOn(stream, "destroy");
  return { stream, destroy };
}

describe("GET /api/staff/statements/[id]/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.statements = [generatedStatement()];
    store.lastFindFirstWhere = null;
    store.findFirstCalls = 0;
    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
    mocks.createAuditEvent.mockResolvedValue({ id: "audit-1" });
    const { stream } = pdfStream();
    mocks.openAuthorizedStatementPdf.mockResolvedValue({
      ok: true,
      absolutePath: "/tmp/hidden-statement.pdf",
      stream,
    });
  });

  it("returns 401 for signed-out users", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await GET(makeRequest(), params());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(store.findFirstCalls).toBe(0);
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("returns the same 404 for an invalid UUID", async () => {
    const response = await GET(makeRequest(), params("not-a-uuid"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(store.findFirstCalls).toBe(0);
    expect(mocks.openAuthorizedStatementPdf).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it.each([RoleCode.REPORT_VIEWER, RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "returns 404 for %s without revealing the statement",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      const response = await GET(makeRequest(), params());
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Not found" });
      expect(store.findFirstCalls).toBe(0);
      expect(mocks.createAuditEvent).not.toHaveBeenCalled();
    },
  );

  it("does not open a statement from another organization", async () => {
    store.statements = [
      generatedStatement({
        organizationId: OTHER_ORG,
        pdfStorageKey: `private/statements/${OTHER_ORG}/${STATEMENT_ID}/file.pdf`,
      }),
    ];
    const response = await GET(makeRequest(), params());
    expect(response.status).toBe(404);
    expect(store.lastFindFirstWhere).toMatchObject({
      where: {
        id: STATEMENT_ID,
        organizationId: ORG_ID,
        statementType: StatementType.INDIVIDUAL,
        status: StatementStatus.GENERATED,
      },
    });
    expect(mocks.openAuthorizedStatementPdf).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it.each([StatementStatus.PUBLISHED, StatementStatus.VOIDED])(
    "denies a %s statement through this generated-review route",
    async (status) => {
      store.statements = [generatedStatement({ status })];
      const response = await GET(makeRequest(), params());
      expect(response.status).toBe(404);
      expect(mocks.openAuthorizedStatementPdf).not.toHaveBeenCalled();
      expect(mocks.createAuditEvent).not.toHaveBeenCalled();
    },
  );

  it("denies a household statement", async () => {
    store.statements = [
      generatedStatement({
        statementType: StatementType.HOUSEHOLD,
      }),
    ];
    const response = await GET(makeRequest(), params());
    expect(response.status).toBe(404);
    expect(mocks.openAuthorizedStatementPdf).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("denies a missing or unsafe storage file without auditing", async () => {
    store.statements = [
      generatedStatement({
        pdfStorageKey: `private/statements/${ORG_ID}/${STATEMENT_ID}/../secret.pdf`,
      }),
    ];
    const unsafe = await GET(makeRequest(), params());
    expect(unsafe.status).toBe(404);
    expect(mocks.openAuthorizedStatementPdf).not.toHaveBeenCalled();

    store.statements = [generatedStatement({ pdfChecksum: null })];
    const missingChecksum = await GET(makeRequest(), params());
    expect(missingChecksum.status).toBe(404);

    store.statements = [generatedStatement()];
    mocks.openAuthorizedStatementPdf.mockResolvedValue({
      ok: false,
      reason: "UNAVAILABLE",
    });
    const missingFile = await GET(makeRequest(), params());
    expect(missingFile.status).toBe(404);
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
    expect(JSON.stringify(await missingFile.json())).not.toMatch(
      /storage|private\/statements|\/tmp|checksum/i,
    );
  });

  it("streams a generated PDF with safe headers and records the audit first", async () => {
    const { stream } = pdfStream();
    mocks.openAuthorizedStatementPdf.mockResolvedValue({
      ok: true,
      absolutePath: "/tmp/hidden-statement.pdf",
      stream,
    });
    const response = await GET(makeRequest(), params());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="IND-2026-ABCD.pdf"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const headerBlob = JSON.stringify([
      ...response.headers.entries(),
    ]);
    expect(headerBlob).not.toContain(STORAGE_KEY);
    expect(headerBlob).not.toContain("/tmp/hidden");
    expect(headerBlob).not.toContain(CHECKSUM);
    expect(mocks.createAuditEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
      action: VIEW_GENERATED_CONTRIBUTION_STATEMENT,
      entityType: "ContributionStatement",
      entityId: STATEMENT_ID,
      changes: expect.arrayContaining([
        expect.objectContaining({
          field: "statementType",
          newValue: "INDIVIDUAL",
        }),
        expect.objectContaining({
          field: "statementIdentifier",
          newValue: "IND-2026-ABCD",
        }),
        expect.objectContaining({ field: "status", newValue: "GENERATED" }),
      ]),
    });
    const auditJson = JSON.stringify(mocks.createAuditEvent.mock.calls[0]?.[0]);
    expect(auditJson).not.toMatch(
      /10 Oak|private\/statements|\/tmp\/hidden|checksum/i,
    );
    const body = await response.text();
    expect(body.startsWith("%PDF-")).toBe(true);
    expect(body).not.toContain("private/statements");
    expect(body).not.toContain("/tmp/hidden");
  });

  it("does not stream the PDF when audit recording fails", async () => {
    const { stream, destroy } = pdfStream();
    mocks.openAuthorizedStatementPdf.mockResolvedValue({
      ok: true,
      absolutePath: "/tmp/hidden-statement.pdf",
      stream,
    });
    mocks.createAuditEvent.mockRejectedValue(new Error("audit down"));
    const response = await GET(makeRequest(), params());
    expect(response.status).toBe(500);
    expect(destroy).toHaveBeenCalled();
    const json = await response.json();
    expect(json).toEqual({ error: "Unable to open statement." });
    expect(JSON.stringify(json)).not.toMatch(
      /private\/statements|\/tmp\/hidden|IND-2026-ABCD/i,
    );
    expect(response.headers.get("Content-Type")).not.toBe("application/pdf");
  });
});
