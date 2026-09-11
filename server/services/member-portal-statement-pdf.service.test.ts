import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  donorFindFirst: vi.fn(),
  householdFindMany: vi.fn(),
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
    household: { findMany: mocks.householdFindMany },
    contributionStatement: { findFirst: mocks.statementFindFirst },
    statementAccessEvent: { create: mocks.accessCreate },
  },
}));

import {
  authorizePortalStatementPdf,
  authorizedHouseholdRecipientWhere,
  portalPublishedIndividualStatementWhere,
  portalPublishedStatementAccessWhere,
  recordPortalStatementAccess,
} from "./member-portal-statement-pdf.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const STATEMENT_ID = "00000000-0000-4000-8000-00000000b001";
const HOUSEHOLD_STMT = "00000000-0000-4000-8000-00000000b002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-00000000e001";

function authorizedPdf(id = STATEMENT_ID) {
  return {
    id,
    organizationId: ORG_ID,
    statementIdentifier: "STMT-2025",
    pdfStorageKey: `private/statements/${ORG_ID}/${id}/file.pdf`,
    pdfChecksum: null,
  };
}

describe("authorizePortalStatementPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.donorFindFirst.mockResolvedValue({ id: DONOR_ID });
    mocks.householdFindMany.mockResolvedValue([]);
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
    expect(mocks.accessCreate).not.toHaveBeenCalled();
  });

  it("keeps existing individual access scoped to org, donor, INDIVIDUAL, PUBLISHED, householdId null", async () => {
    mocks.statementFindFirst.mockResolvedValue(authorizedPdf());

    const result = await authorizePortalStatementPdf(STATEMENT_ID, "download");
    expect(result.status).toBe("AUTHORIZED");
    expect(mocks.statementFindFirst).toHaveBeenCalledWith({
      where: portalPublishedStatementAccessWhere({
        organizationId: ORG_ID,
        donorId: DONOR_ID,
        authorizedHouseholdIds: [],
        statementId: STATEMENT_ID,
      }),
      select: expect.any(Object),
    });
    expect(
      portalPublishedIndividualStatementWhere({
        organizationId: ORG_ID,
        donorId: DONOR_ID,
        statementId: STATEMENT_ID,
      }),
    ).toEqual({
      id: STATEMENT_ID,
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      householdId: null,
      statementType: "INDIVIDUAL",
      status: "PUBLISHED",
    });
  });

  it("omits the household branch when no household is authorized", async () => {
    const where = portalPublishedStatementAccessWhere({
      organizationId: ORG_ID,
      donorId: DONOR_ID,
      authorizedHouseholdIds: [],
      statementId: STATEMENT_ID,
    });
    expect(where.OR).toHaveLength(1);
    expect(where.OR[0]).toMatchObject({
      statementType: "INDIVIDUAL",
      donorId: DONOR_ID,
      householdId: null,
    });
    expect(JSON.stringify(where)).not.toContain('"in":[]');
  });

  it("lets the preferred recipient with active membership access a household statement", async () => {
    mocks.householdFindMany.mockResolvedValue([
      { id: HOUSEHOLD_ID, displayName: "Smith Household" },
    ]);
    mocks.statementFindFirst.mockResolvedValue(authorizedPdf(HOUSEHOLD_STMT));

    const result = await authorizePortalStatementPdf(HOUSEHOLD_STMT, "view");
    expect(result.status).toBe("AUTHORIZED");
    expect(mocks.householdFindMany).toHaveBeenCalledWith({
      where: authorizedHouseholdRecipientWhere({
        organizationId: ORG_ID,
        donorId: DONOR_ID,
      }),
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    });
    expect(authorizedHouseholdRecipientWhere({
      organizationId: ORG_ID,
      donorId: DONOR_ID,
    })).toEqual({
      organizationId: ORG_ID,
      active: true,
      preferredStatementRecipientId: DONOR_ID,
      memberships: {
        some: {
          organizationId: ORG_ID,
          donorId: DONOR_ID,
          endDate: null,
        },
      },
    });
    expect(mocks.statementFindFirst.mock.calls[0]?.[0].where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statementType: "HOUSEHOLD",
          donorId: null,
          householdId: { in: [HOUSEHOLD_ID] },
          status: "PUBLISHED",
        }),
      ]),
    );
  });

  it("does not use primaryDonorId in the household authorization query", () => {
    const where = authorizedHouseholdRecipientWhere({
      organizationId: ORG_ID,
      donorId: DONOR_ID,
    });
    expect(where).not.toHaveProperty("primaryDonorId");
    expect(JSON.stringify(where)).not.toContain("primaryDonorId");
  });

  it("denies a household member who is not the preferred recipient", async () => {
    mocks.householdFindMany.mockResolvedValue([]);
    mocks.statementFindFirst.mockResolvedValue(null);
    await expect(
      authorizePortalStatementPdf(HOUSEHOLD_STMT, "view"),
    ).resolves.toEqual({ status: "NOT_AVAILABLE" });
    expect(mocks.accessCreate).not.toHaveBeenCalled();
  });

  it("denies missing membership, ended membership, inactive household, and other org via empty authorized households", async () => {
    mocks.householdFindMany.mockResolvedValue([]);
    mocks.statementFindFirst.mockResolvedValue(null);
    await expect(
      authorizePortalStatementPdf(HOUSEHOLD_STMT, "download"),
    ).resolves.toEqual({ status: "NOT_AVAILABLE" });
    expect(mocks.householdFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_ID,
          active: true,
          preferredStatementRecipientId: DONOR_ID,
        }),
      }),
    );
    expect(OTHER_ORG).not.toBe(ORG_ID);
  });

  it("treats UUID tampering as the same generic not-found result", async () => {
    mocks.statementFindFirst.mockResolvedValue(null);
    await expect(
      authorizePortalStatementPdf("00000000-0000-4000-8000-00000000ffff", "view"),
    ).resolves.toEqual({ status: "NOT_AVAILABLE" });
    expect(mocks.accessCreate).not.toHaveBeenCalled();
  });

  it("records VIEWED and DOWNLOADED with authorized IDs only", async () => {
    mocks.accessCreate.mockResolvedValue({ id: "evt" });
    await recordPortalStatementAccess({
      organizationId: ORG_ID,
      statementId: HOUSEHOLD_STMT,
      userAccountId: USER_ID,
      mode: "view",
    });
    await recordPortalStatementAccess({
      organizationId: ORG_ID,
      statementId: HOUSEHOLD_STMT,
      userAccountId: USER_ID,
      mode: "download",
    });
    expect(mocks.accessCreate.mock.calls[0]?.[0]).toEqual({
      data: {
        organizationId: ORG_ID,
        statementId: HOUSEHOLD_STMT,
        userAccountId: USER_ID,
        action: "VIEWED",
      },
    });
    expect(mocks.accessCreate.mock.calls[1]?.[0]).toEqual({
      data: {
        organizationId: ORG_ID,
        statementId: HOUSEHOLD_STMT,
        userAccountId: USER_ID,
        action: "DOWNLOADED",
      },
    });
  });
});
