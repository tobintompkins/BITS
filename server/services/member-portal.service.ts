import { RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import {
  findAuthorizedHouseholdIdsForStatementRecipient,
  portalPublishedStatementAccessWhere,
} from "@/server/services/member-portal-statement-pdf.service";

const LEADERSHIP_ROLES: RoleCode[] = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.DATA_ENTRY,
  RoleCode.REPORT_VIEWER,
];

export async function getMemberPortalDashboard() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) {
    return { status: "SIGNED_OUT" as const };
  }

  const organization = await findPrimaryOrganization();
  if (!organization) {
    return { status: "NO_ORGANIZATION" as const };
  }

  const [donor, membership] = await Promise.all([
    prisma.donor.findFirst({
      where: {
        organizationId: organization.id,
        userAccountId: userAccount.id,
        active: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        preferredCommunicationMethod: true,
      },
    }),
    prisma.organizationMembership.findFirst({
      where: {
        organizationId: organization.id,
        userAccountId: userAccount.id,
        active: true,
      },
      include: { roleType: { select: { code: true } } },
    }),
  ]);

  const hasLeadershipAccess = Boolean(
    membership && LEADERSHIP_ROLES.includes(membership.roleType.code),
  );

  if (!donor) {
    return {
      status: "CONNECTION_PENDING" as const,
      organizationName: organization.displayName ?? organization.name,
      accountEmail: userAccount.primaryEmail,
      displayName: userAccount.displayName,
      hasLeadershipAccess,
    };
  }

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [yearGiving, recentGifts, statements] = await Promise.all([
    prisma.donation.aggregate({
      where: {
        organizationId: organization.id,
        donorId: donor.id,
        offeringDate: { gte: yearStart, lte: now },
        isTest: false,
      },
      _sum: { totalAmount: true, deductibleAmount: true },
      _count: { _all: true },
    }),
    prisma.donation.findMany({
      where: {
        organizationId: organization.id,
        donorId: donor.id,
      },
      orderBy: [{ offeringDate: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true,
        offeringDate: true,
        totalAmount: true,
        paymentMethod: true,
        isTest: true,
      },
    }),
    prisma.contributionStatement.findMany({
      where: {
        organizationId: organization.id,
        donorId: donor.id,
        status: "PUBLISHED",
      },
      orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true,
        statementIdentifier: true,
        periodStart: true,
        periodEnd: true,
        deductibleTotal: true,
      },
    }),
  ]);

  return {
    status: "READY" as const,
    organizationName: organization.displayName ?? organization.name,
    hasLeadershipAccess,
    donor,
    year: now.getFullYear(),
    yearGiving: {
      giftCount: yearGiving._count._all,
      totalAmount: yearGiving._sum.totalAmount?.toString() ?? "0",
      deductibleAmount: yearGiving._sum.deductibleAmount?.toString() ?? "0",
    },
    recentGifts: recentGifts.map((gift) => ({
      ...gift,
      totalAmount: gift.totalAmount.toString(),
    })),
    statements: statements.map((statement) => ({
      ...statement,
      deductibleTotal: statement.deductibleTotal.toString(),
    })),
  };
}

export async function getMemberPortalStatements(requestedYear?: number) {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const donor = await prisma.donor.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      active: true,
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!donor) {
    return {
      status: "CONNECTION_PENDING" as const,
      accountEmail: userAccount.primaryEmail,
    };
  }

  const currentYear = new Date().getFullYear();
  const year =
    Number.isInteger(requestedYear) &&
    requestedYear! >= 2000 &&
    requestedYear! <= currentYear
      ? requestedYear!
      : currentYear;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  const authorizedHouseholds =
    await findAuthorizedHouseholdIdsForStatementRecipient({
      organizationId: organization.id,
      donorId: donor.id,
    });
  const householdNames = new Map(
    authorizedHouseholds.map((row) => [row.id, row.displayName]),
  );

  const [statements, gifts] = await Promise.all([
    prisma.contributionStatement.findMany({
      where: portalPublishedStatementAccessWhere({
        organizationId: organization.id,
        donorId: donor.id,
        authorizedHouseholdIds: authorizedHouseholds.map((row) => row.id),
      }),
      orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
      select: {
        id: true,
        statementIdentifier: true,
        statementType: true,
        householdId: true,
        periodStart: true,
        periodEnd: true,
        taxYear: true,
        deductibleTotal: true,
        generatedAt: true,
        pdfStorageKey: true,
      },
    }),
    prisma.donation.findMany({
      where: {
        organizationId: organization.id,
        donorId: donor.id,
        offeringDate: { gte: yearStart, lt: yearEnd },
      },
      orderBy: [{ offeringDate: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        offeringDate: true,
        totalAmount: true,
        deductibleAmount: true,
        paymentMethod: true,
        isTest: true,
        stripeCheckoutSessionId: true,
        allocations: {
          select: {
            amount: true,
            offeringType: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const officialGifts = gifts.filter((gift) => !gift.isTest);
  const fundTotals = new Map<string, number>();
  for (const gift of officialGifts) {
    for (const allocation of gift.allocations) {
      const fund = allocation.offeringType.name;
      fundTotals.set(fund, (fundTotals.get(fund) ?? 0) + Number(allocation.amount));
    }
  }

  return {
    status: "READY" as const,
    donor,
    year,
    availableYears: Array.from({ length: 6 }, (_, index) => currentYear - index),
    annualGiving: {
      giftCount: officialGifts.length,
      totalAmount: officialGifts
        .reduce((total, gift) => total + Number(gift.totalAmount), 0)
        .toString(),
      deductibleAmount: officialGifts
        .reduce((total, gift) => total + Number(gift.deductibleAmount), 0)
        .toString(),
      funds: [...fundTotals.entries()]
        .map(([fund, amount]) => ({ fund, amount: amount.toString() }))
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
    },
    statements: statements.map((statement) => ({
      id: statement.id,
      statementIdentifier: statement.statementIdentifier,
      statementType: statement.statementType,
      kindLabel:
        statement.statementType === "HOUSEHOLD"
          ? "Household statement"
          : "Individual statement",
      householdName:
        statement.statementType === "HOUSEHOLD" && statement.householdId
          ? (householdNames.get(statement.householdId) ?? null)
          : null,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      taxYear: statement.taxYear,
      deductibleTotal: statement.deductibleTotal.toString(),
      generatedAt: statement.generatedAt,
      hasPdf: Boolean(statement.pdfStorageKey),
    })),
    gifts: gifts.map((gift) => ({
      ...gift,
      totalAmount: gift.totalAmount.toString(),
      deductibleAmount: gift.deductibleAmount.toString(),
      allocations: gift.allocations.map((allocation) => ({
        amount: allocation.amount.toString(),
        fund: allocation.offeringType.name,
      })),
    })),
  };
}
