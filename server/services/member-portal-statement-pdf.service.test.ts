import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  donorFindFirst: vi.fn(),
  statementFindFirst: vi.fn(),
  accessCreate: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    donor: { findFirst: mocks.donorFindFirst },
    contributionStatement: { findFirst: mocks.statementFindFirst },
    statementAccessEvent: { create: mocks.accessCreate },
  },
}));

import {
  authorizePortalStatementPdf,
  portalPublishedIndividualStatementWhere,
  recordPortalStatementAccess,
} from "./member-portal-statement-pdf.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const STATEMENT_ID = "00000000-0000-4000-8000-00000000b001";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";

describe("authorizePortalStatementPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.donorFindFirst.mockResolvedValue({ id: DONOR_ID });
  });

  it("returns signed out without querying statements", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      authorizePortalStatementPdf(STATEMENT_ID, "view"),
    ).resolves.toEqual({ status: "SIGNED_OUT" });
    expect(mocks.donorFindFirst).not.toHaveBeenCalled();
    expect(mocks.statementFindFirst).not.toHaveBeenCalled();
  });

  it("rejects invalid UUIDs and modes before lookup", async () => {
    await expect(authorizePortalStatementPdf("not-a-uuid", "view")).resolves.toEqual({
      status: "INVALID_REQUEST",
    });
    await expect(
      authorizePortalStatementPdf(STATEMENT_ID, "preview"),
    ).resolves.toEqual({ status: "INVALID_REQUEST" });
    expect(mocks.statementFindFirst).not.toHaveBeenCalled();
  });

  it("scopes lookup by organization, connected active donor, individual type, and PUBLISHED", async () => {
    mocks.statementFindFirst.mockResolvedValue({
      id: STATEMENT_ID,
      organizationId: ORG_ID,
      statementIdentifier: "STMT-2025",
      pdfStorageKey: `private/statements/${ORG_ID}/${STATEMENT_ID}/file.pdf`,
      pdfChecksum: null,
    });

    const result = await authorizePortalStatementPdf(STATEMENT_ID, "download");
    expect(result.status).toBe("AUTHORIZED");
    expect(mocks.donorFindFirst).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        userAccountId: USER_ID,
        active: true,
      },
      select: { id: true },
    });
    expect(mocks.statementFindFirst).toHaveBeenCalledWith({
      where: portalPublishedIndividualStatementWhere({
        organizationId: ORG_ID,
        donorId: DONOR_ID,
        statementId: STATEMENT_ID,
      }),
      select: expect.any(Object),
    });
    expect(portalPublishedIndividualStatementWhere({
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      statementId: STATEMENT_ID,
    })).toEqual({
      id: STATEMENT_ID,
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      householdId: null,
      statementType: "INDIVIDUAL",
      status: "PUBLISHED",
    });
  });

  it("hides another donor, other org, household, and unpublished rows as unavailable", async () => {
    mocks.statementFindFirst.mockResolvedValue(null);
    await expect(
      authorizePortalStatementPdf(STATEMENT_ID, "view"),
    ).resolves.toEqual({ status: "NOT_AVAILABLE" });
  });

  it("records VIEWED and DOWNLOADED with authorized IDs only", async () => {
    mocks.accessCreate.mockResolvedValue({ id: "evt" });
    await recordPortalStatementAccess({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      userAccountId: USER_ID,
      mode: "view",
    });
    await recordPortalStatementAccess({
      organizationId: ORG_ID,
      statementId: STATEMENT_ID,
      userAccountId: USER_ID,
      mode: "download",
    });
    expect(mocks.accessCreate.mock.calls[0]?.[0]).toEqual({
      data: {
        organizationId: ORG_ID,
        statementId: STATEMENT_ID,
        userAccountId: USER_ID,
        action: "VIEWED",
      },
    });
    expect(mocks.accessCreate.mock.calls[1]?.[0]).toEqual({
      data: {
        organizationId: ORG_ID,
        statementId: STATEMENT_ID,
        userAccountId: USER_ID,
        action: "DOWNLOADED",
      },
    });
  });
});
