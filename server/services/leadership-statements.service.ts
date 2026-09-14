import { prisma } from "@/lib/db/prisma";
import { requireStatementViewAccess } from "@/lib/auth/giving-permissions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export async function getLeadershipStatementsDashboard() {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new Error("Church organization not found.");
  const access = await requireStatementViewAccess(organization.id);

  const [allGiving, testGiving, unmatchedOnline, unmatchedTest, unmatchedLive, onlineGifts, statements] =
    await Promise.all([
      prisma.donation.aggregate({
        where: { organizationId: organization.id, isTest: false },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.donation.aggregate({
        where: { organizationId: organization.id, isTest: true },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.donation.count({
        where: {
          organizationId: organization.id,
          stripeCheckoutSessionId: { not: null },
          donorId: null,
        },
      }),
      prisma.donation.count({
        where: {
          organizationId: organization.id,
          stripeCheckoutSessionId: { not: null },
          donorId: null,
          isTest: true,
        },
      }),
      prisma.donation.count({
        where: {
          organizationId: organization.id,
          stripeCheckoutSessionId: { not: null },
          donorId: null,
          isTest: false,
        },
      }),
      prisma.donation.findMany({
        where: {
          organizationId: organization.id,
          stripeCheckoutSessionId: { not: null },
        },
        orderBy: [{ offeringDate: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          offeringDate: true,
          totalAmount: true,
          paymentMethod: true,
          isTest: true,
          stripePaymentIntentId: true,
          note: true,
          donor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          allocations: {
            select: {
              amount: true,
              offeringType: { select: { name: true } },
            },
          },
        },
      }),
      prisma.contributionStatement.findMany({
        where: { organizationId: organization.id },
        orderBy: [{ periodEnd: "desc" }, { id: "desc" }],
        take: 100,
        select: {
          id: true,
          statementIdentifier: true,
          statementType: true,
          periodStart: true,
          periodEnd: true,
          deductibleTotal: true,
          status: true,
          generatedAt: true,
          donor: { select: { firstName: true, lastName: true, email: true } },
          household: { select: { id: true, displayName: true } },
        },
      }),
    ]);

  return {
    organizationName: organization.displayName ?? organization.name,
    access,
    totals: {
      recordedGiftCount: allGiving._count._all,
      recordedAmount: allGiving._sum.totalAmount?.toString() ?? "0",
      testGiftCount: testGiving._count._all,
      testAmount: testGiving._sum.totalAmount?.toString() ?? "0",
      unmatchedOnline,
      unmatchedTest,
      unmatchedLive,
      statementCount: statements.length,
    },
    onlineGifts: onlineGifts.map((gift) => ({
      ...gift,
      totalAmount: gift.totalAmount.toString(),
      allocations: gift.allocations.map((allocation) => ({
        amount: allocation.amount.toString(),
        fund: allocation.offeringType.name,
      })),
    })),
    statements: statements.map((statement) => ({
      ...statement,
      deductibleTotal: statement.deductibleTotal.toString(),
    })),
  };
}
