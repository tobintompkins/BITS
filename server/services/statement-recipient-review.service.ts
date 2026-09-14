import {
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";

import { requireStatementViewAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { parseStatementRecipientReviewQuery } from "@/lib/validation/statement-recipient-review";
import { statementYearDateRange } from "@/lib/validation/statement-readiness";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class StatementRecipientReviewError extends Error {
  constructor(
    public readonly code: "SIGNED_OUT" | "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "StatementRecipientReviewError";
  }
}

function present(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasUsableAddress(row: {
  mailingAddressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}) {
  return (
    present(row.mailingAddressLine1) &&
    present(row.city) &&
    present(row.state) &&
    present(row.postalCode)
  );
}

function matchesSearch(
  donor: { firstName: string; lastName: string; email: string | null },
  query?: string,
) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const name = `${donor.firstName} ${donor.lastName}`.trim().toLowerCase();
  return name.includes(needle) || (donor.email ?? "").toLowerCase().includes(needle);
}

function pickIndividualStatement(
  rows: Array<{ status: StatementStatus }>,
) {
  const rank: Record<StatementStatus, number> = {
    [StatementStatus.PUBLISHED]: 0,
    [StatementStatus.GENERATED]: 1,
    [StatementStatus.VOIDED]: 2,
  };
  return [...rows].sort((left, right) => rank[left.status] - rank[right.status])[0] ?? null;
}

async function requireReviewContext() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new StatementRecipientReviewError("SIGNED_OUT", "You must be signed in.");
  }
  if (!organization) {
    throw new StatementRecipientReviewError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  try {
    await requireStatementViewAccess(organization.id);
  } catch {
    throw new StatementRecipientReviewError(
      "FORBIDDEN",
      "You do not have permission to view contribution statements.",
    );
  }
  return organization;
}

export async function getStatementRecipientReview(
  rawQuery: Record<string, string | string[] | undefined> = {},
  now = new Date(),
) {
  const organization = await requireReviewContext();
  const query = parseStatementRecipientReviewQuery(rawQuery, now);
  const { start, end } = statementYearDateRange(query.year);
  const officialWhere = {
    organizationId: organization.id,
    isTest: false,
    donorId: { not: null },
    offeringDate: { gte: start, lt: end },
  };

  const grouped = await prisma.donation.groupBy({
    by: ["donorId"],
    where: officialWhere,
    _count: { _all: true },
    _sum: { totalAmount: true },
  });
  const totalsByDonor = new Map(
    grouped
      .filter((row) => row.donorId)
      .map((row) => [
        row.donorId as string,
        {
          giftCount: row._count._all,
          officialTotal: row._sum.totalAmount?.toString() ?? "0.00",
        },
      ]),
  );
  const donorIds = [...totalsByDonor.keys()];

  const donors = donorIds.length
    ? await prisma.donor.findMany({
        where: { id: { in: donorIds }, organizationId: organization.id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          mailingAddressLine1: true,
          city: true,
          state: true,
          postalCode: true,
        },
      })
    : [];

  const searched = donors
    .filter((donor) => matchesSearch(donor, query.q))
    .map((donor) => {
      const totals = totalsByDonor.get(donor.id) ?? {
        giftCount: 0,
        officialTotal: "0.00",
      };
      return {
        id: donor.id,
        displayName: `${donor.firstName} ${donor.lastName}`.trim(),
        email: donor.email,
        mailingAddressComplete: hasUsableAddress(donor),
        officialTotal: totals.officialTotal,
        giftCount: totals.giftCount,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const missingAddressCount = searched.filter(
    (donor) => !donor.mailingAddressComplete,
  ).length;
  const filtered = searched.filter((donor) => {
    if (query.address === "complete") return donor.mailingAddressComplete;
    if (query.address === "missing") return !donor.mailingAddressComplete;
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const pageRows = filtered.slice(
    (page - 1) * query.pageSize,
    page * query.pageSize,
  );

  const statements = pageRows.length
    ? await prisma.contributionStatement.findMany({
        where: {
          organizationId: organization.id,
          statementType: StatementType.INDIVIDUAL,
          donorId: { in: pageRows.map((row) => row.id) },
          OR: [
            { taxYear: query.year },
            { taxYear: null, periodStart: { gte: start, lt: end } },
          ],
        },
        select: { donorId: true, status: true },
      })
    : [];

  const statementsByDonor = new Map<string, Array<{ status: StatementStatus }>>();
  for (const row of statements) {
    if (!row.donorId) continue;
    const list = statementsByDonor.get(row.donorId) ?? [];
    list.push({ status: row.status });
    statementsByDonor.set(row.donorId, list);
  }

  return {
    year: query.year,
    q: query.q ?? "",
    address: query.address,
    page,
    pageSize: query.pageSize,
    pageCount,
    organizationName: organization.displayName?.trim() || organization.name,
    recipientCount: searched.length,
    missingAddressCount,
    total: filtered.length,
    recipients: pageRows.map((row) => {
      const statement = pickIndividualStatement(
        statementsByDonor.get(row.id) ?? [],
      );
      return {
        id: row.id,
        displayName: row.displayName,
        email: row.email,
        mailingAddressComplete: row.mailingAddressComplete,
        officialTotal: row.officialTotal,
        giftCount: row.giftCount,
        statement: statement
          ? { exists: true, status: statement.status }
          : { exists: false, status: null },
      };
    }),
  };
}
