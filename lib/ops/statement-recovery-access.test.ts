import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  portalOrg: vi.fn(),
  currentOrg: vi.fn(),
  manage: vi.fn(),
  donorFindFirst: vi.fn(),
  householdFindMany: vi.fn(),
  statementFindFirst: vi.fn(),
  accessCreate: vi.fn(),
  open: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.user,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findMemberPortalOrganization: mocks.portalOrg,
}));

vi.mock("@/lib/auth/current-organization", () => ({
  findCurrentOrganizationForUser: mocks.currentOrg,
}));

vi.mock("@/lib/auth/giving-permissions", () => ({
  requireStatementManageAccess: mocks.manage,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    donor: { findFirst: mocks.donorFindFirst },
    household: { findMany: mocks.householdFindMany },
    contributionStatement: { findFirst: mocks.statementFindFirst },
    statementAccessEvent: { create: mocks.accessCreate },
  },
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.audit,
}));

vi.mock("@/lib/storage/statement-pdf", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage/statement-pdf")>(
    "@/lib/storage/statement-pdf",
  );
  return { ...actual, openAuthorizedStatementPdf: mocks.open };
});

import { GET as getPortalPdf } from "@/app/api/portal/statements/[id]/pdf/route";
import { GET as getStaffPdf } from "@/app/api/staff/statements/[id]/pdf/route";
import { statementRecoveryCleanup, statementRecoveryIdentities } from "./statement-recovery-access";

const ids = statementRecoveryIdentities;
const published = { ...ids.statement, status: "PUBLISHED" as const };
const generated = { ...ids.statement, status: "GENERATED" as const };

function matches(
  row: typeof published | typeof generated,
  where: Record<string, unknown>,
) {
  if (where.id && row.id !== where.id) return false;
  if (where.organizationId && row.organizationId !== where.organizationId) return false;
  if (where.status && row.status !== where.status) return false;
  const branches = Array.isArray(where.OR) ? where.OR : [where];
  return branches.some((branch) => {
    const candidate = branch as Record<string, unknown>;
    if (candidate.statementType && row.statementType !== candidate.statementType) return false;
    if (candidate.status && row.status !== candidate.status) return false;
    if ("donorId" in candidate && row.donorId !== candidate.donorId) return false;
    if ("householdId" in candidate && row.householdId !== candidate.householdId) return false;
    return true;
  });
}

describe("statement recovery download authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.householdFindMany.mockResolvedValue([]);
    mocks.accessCreate.mockResolvedValue({});
    mocks.audit.mockResolvedValue({});
    mocks.open.mockResolvedValue({
      ok: true,
      absolutePath: "/tmp/statement-recovery-probe.pdf",
      stream: Readable.from([Buffer.from("%PDF-1.4\n")]),
    });
    mocks.donorFindFirst.mockImplementation(async ({ where }: { where: { userAccountId: string; active: boolean } }) => {
      const donor = [ids.donor, ids.otherDonor].find(
        (row) => row.userAccountId === where.userAccountId && row.active === where.active,
      );
      return donor ? { id: donor.id } : null;
    });
    mocks.statementFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const row = where.status === "GENERATED" ? generated : published;
      return matches(row, where) ? row : null;
    });
  });

  it("keeps cleanup inside this probe organization and statement", () => {
    expect(statementRecoveryCleanup.join(" ")).toContain(ids.statement.id);
    expect(statementRecoveryCleanup.join(" ")).toContain(ids.organization.id);
    expect(statementRecoveryCleanup.join(" ").toLowerCase()).not.toContain("first upc");
    expect(statementRecoveryCleanup.join(" ")).not.toContain("donation");
  });

  it("lets the disposable donor download and denies another donor", async () => {
    mocks.auth.mockResolvedValue({ userId: ids.donor.clerkUserId });
    mocks.user.mockResolvedValue({ id: ids.donor.userAccountId, active: true });
    mocks.portalOrg.mockResolvedValue({ id: ids.organization.id });
    const allowed = await getPortalPdf(new Request("http://localhost/api/portal/statements/pdf?mode=download"), {
      params: Promise.resolve({ id: ids.statement.id }),
    });
    expect(allowed.status).toBe(200);
    expect(mocks.open).toHaveBeenCalledWith({
      organizationId: ids.organization.id,
      statementId: ids.statement.id,
      storageKey: ids.statement.pdfStorageKey,
      checksum: ids.statement.pdfChecksum,
    });

    mocks.open.mockClear();
    mocks.auth.mockResolvedValue({ userId: ids.otherDonor.clerkUserId });
    mocks.user.mockResolvedValue({ id: ids.otherDonor.userAccountId, active: true });
    const denied = await getPortalPdf(new Request("http://localhost/api/portal/statements/pdf?mode=download"), {
      params: Promise.resolve({ id: ids.statement.id }),
    });
    expect(denied.status).toBe(404);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("lets the disposable administrator open the generated PDF and denies a report viewer", async () => {
    mocks.auth.mockResolvedValue({ userId: ids.staff.clerkUserId });
    mocks.user.mockResolvedValue({ id: ids.staff.id, active: true });
    mocks.currentOrg.mockResolvedValue({ id: ids.organization.id });
    mocks.manage.mockResolvedValue({ roleCode: ids.staff.roleCode });
    const allowed = await getStaffPdf(new Request("http://localhost/api/staff/statements/pdf"), {
      params: Promise.resolve({ id: ids.statement.id }),
    });
    expect(allowed.status).toBe(200);
    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ids.organization.id,
        statementId: ids.statement.id,
        storageKey: ids.statement.pdfStorageKey,
        checksum: ids.statement.pdfChecksum,
      }),
    );

    mocks.open.mockClear();
    mocks.auth.mockResolvedValue({ userId: ids.reportViewer.clerkUserId });
    mocks.user.mockResolvedValue({ id: ids.reportViewer.id, active: true });
    mocks.manage.mockRejectedValue(new Error("You do not have permission to manage contribution statements."));
    const denied = await getStaffPdf(new Request("http://localhost/api/staff/statements/pdf"), {
      params: Promise.resolve({ id: ids.statement.id }),
    });
    expect(denied.status).toBe(404);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("denies a signed-out request before opening the PDF", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await getPortalPdf(new Request("http://localhost/api/portal/statements/pdf?mode=download"), {
      params: Promise.resolve({ id: ids.statement.id }),
    });
    expect(response.status).toBe(401);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
