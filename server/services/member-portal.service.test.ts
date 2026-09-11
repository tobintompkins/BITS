import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  donorFindFirst: vi.fn(),
  membershipFindFirst: vi.fn(),
  donationAggregate: vi.fn(),
  donationFindMany: vi.fn(),
  statementFindMany: vi.fn(),
  householdFindMany: vi.fn(),
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
    organizationMembership: { findFirst: mocks.membershipFindFirst },
    household: { findMany: mocks.householdFindMany },
    donation: {
      aggregate: mocks.donationAggregate,
      findMany: mocks.donationFindMany,
    },
    contributionStatement: { findMany: mocks.statementFindMany },
  },
}));

import {
  getMemberPortalDashboard,
  getMemberPortalStatements,
} from "./member-portal.service";

describe("member portal ownership foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: "org-1",
      name: "First UPC of Saco",
      displayName: null,
    });
    mocks.membershipFindFirst.mockResolvedValue(null);
    mocks.householdFindMany.mockResolvedValue([]);
  });

  it("returns signed out without querying church records", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);

    await expect(getMemberPortalDashboard()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(mocks.donorFindFirst).not.toHaveBeenCalled();
  });

  it("shows a safe pending state when no donor is linked", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "user-1",
      primaryEmail: "member@example.com",
      displayName: "Member One",
    });
    mocks.donorFindFirst.mockResolvedValue(null);

    const result = await getMemberPortalDashboard();

    expect(result.status).toBe("CONNECTION_PENDING");
    expect(mocks.donorFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org-1",
          userAccountId: "user-1",
          active: true,
        },
      }),
    );
    expect(mocks.donationFindMany).not.toHaveBeenCalled();
    expect(mocks.statementFindMany).not.toHaveBeenCalled();
  });

  it("scopes giving and published statements to the linked donor", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "user-1",
      primaryEmail: "member@example.com",
      displayName: "Member One",
    });
    mocks.donorFindFirst.mockResolvedValue({
      id: "donor-1",
      firstName: "Member",
      lastName: "One",
      email: "member@example.com",
      phone: null,
      preferredCommunicationMethod: "EMAIL",
    });
    mocks.donationAggregate.mockResolvedValue({
      _sum: { totalAmount: 125, deductibleAmount: 125 },
      _count: { _all: 2 },
    });
    mocks.donationFindMany.mockResolvedValue([]);
    mocks.statementFindMany.mockResolvedValue([]);

    const result = await getMemberPortalDashboard();

    expect(result.status).toBe("READY");
    expect(mocks.donationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", donorId: "donor-1" },
      }),
    );
    expect(mocks.statementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org-1",
          donorId: "donor-1",
          status: "PUBLISHED",
        },
      }),
    );
  });

  it("loads only the signed-in donor's published statements and receipts", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "user-1",
      primaryEmail: "member@example.com",
      displayName: "Member One",
    });
    mocks.donorFindFirst.mockResolvedValue({
      id: "donor-1",
      firstName: "Member",
      lastName: "One",
    });
    mocks.statementFindMany.mockResolvedValue([]);
    mocks.donationFindMany.mockResolvedValue([]);

    const result = await getMemberPortalStatements();

    expect(result.status).toBe("READY");
    expect(mocks.statementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: "org-1",
          OR: [
            {
              statementType: "INDIVIDUAL",
              donorId: "donor-1",
              householdId: null,
              status: "PUBLISHED",
            },
          ],
        },
      }),
    );
    expect(mocks.donationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", donorId: "donor-1" },
      }),
    );
  });

  it("lists a published household statement only for the preferred recipient", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: "user-1",
      primaryEmail: "member@example.com",
      displayName: "Member One",
    });
    mocks.donorFindFirst.mockResolvedValue({
      id: "donor-1",
      firstName: "Member",
      lastName: "One",
    });
    mocks.householdFindMany.mockResolvedValue([
      { id: "hh-1", displayName: "Smith Household" },
    ]);
    mocks.statementFindMany.mockResolvedValue([
      {
        id: "stmt-hh",
        statementIdentifier: "HH-2025",
        statementType: "HOUSEHOLD",
        householdId: "hh-1",
        periodStart: new Date("2025-01-01"),
        periodEnd: new Date("2025-12-31"),
        taxYear: 2025,
        deductibleTotal: 10,
        generatedAt: new Date("2026-01-02"),
        pdfStorageKey: "private/statements/org-1/stmt-hh/file.pdf",
      },
    ]);
    mocks.donationFindMany.mockResolvedValue([]);

    const result = await getMemberPortalStatements();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.statements).toEqual([
      expect.objectContaining({
        id: "stmt-hh",
        kindLabel: "Household statement",
        householdName: "Smith Household",
        hasPdf: true,
      }),
    ]);
    expect(JSON.stringify(result.statements[0])).not.toContain("pdfStorageKey");
    expect(mocks.statementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              statementType: "HOUSEHOLD",
              donorId: null,
              householdId: { in: ["hh-1"] },
            }),
          ]),
        }),
      }),
    );
  });
});
