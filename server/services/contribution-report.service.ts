import { auth } from "@clerk/nextjs/server";
import Decimal from "decimal.js";
import { PaymentMethod, RoleCode } from "@/app/generated/prisma/client";
import {
  canExportContributionReports,
  canViewContributionReports,
} from "@/lib/auth/contribution-report-permissions";
import { buildContributionCsv } from "@/lib/csv/contribution-csv";
import { prisma } from "@/lib/db/prisma";
import { sumMoneyAmounts } from "@/lib/money/decimal";
import {
  attributeGiftToHousehold,
  type HouseholdAttribution,
} from "@/lib/reports/household-attribution";
import {
  CONTRIBUTION_REPORT_MAX_RANGE_DAYS,
  CONTRIBUTION_REPORT_MAX_ROWS,
  CONTRIBUTION_REPORT_PAYMENT_LABELS,
  CONTRIBUTION_REPORT_SEARCH_MAX,
  contributionReportFilename,
  daysInclusive,
  defaultContributionReportPeriod,
  exclusiveEndDate,
  parseContributionReportPage,
  parseContributionReportPageSize,
  parseContributionReportView,
  parseUuidParam,
  type ContributionReportFilters,
  type ContributionReportView,
} from "@/lib/validation/contribution-report";
import { parseDateOnly } from "@/lib/validation/giving-household";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  countContributionDonations,
  findContributionFilterTargets,
  groupContributionAllocations,
  listContributionDonations,
  listContributionReportPickers,
  listHouseholdDonorIdsInRange,
  listHouseholdMembershipsForDonors,
  sumContributionDonations,
  sumMatchingFundAllocations,
  type ContributionReportQuery,
} from "@/server/repositories/contribution-report.repository";

export class ContributionReportError extends Error {}

function moneyText(value: { toString(): string } | string | number | null | undefined) {
  if (value == null || value === "") return "0.00";
  return new Decimal(value.toString()).toFixed(2);
}

export async function requireContributionReportAccess(
  expectedOrganizationId?: string,
) {
  const { userId, orgId } = await auth();
  if (!userId) {
    throw new ContributionReportError("Sign in to view contribution reports.");
  }
  const actor = await prisma.userAccount.findUnique({
    where: { clerkUserId: userId },
  });
  if (!actor?.active) {
    throw new ContributionReportError("An active staff account is required.");
  }
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userAccountId: actor.id,
      active: true,
      organization: {
        active: true,
        ...(orgId ? { clerkOrganizationId: orgId } : {}),
      },
    },
    include: { roleType: true, organization: true },
    take: 2,
  });
  if (memberships.length !== 1) {
    throw new ContributionReportError(
      "Select a church organization with an active staff membership.",
    );
  }
  const membership = memberships[0];
  const roleCode = membership.roleType.code as RoleCode;
  if (!canViewContributionReports(roleCode) || !canExportContributionReports(roleCode)) {
    throw new ContributionReportError(
      "You do not have permission to view church-wide contribution reports.",
    );
  }
  if (
    expectedOrganizationId &&
    expectedOrganizationId !== membership.organizationId
  ) {
    throw new ContributionReportError(
      "Your church selection changed. Reload this page before exporting.",
    );
  }
  return {
    actor,
    organization: membership.organization,
    roleCode,
    canViewStatements:
      roleCode === RoleCode.ORG_ADMIN ||
      roleCode === RoleCode.TREASURER ||
      roleCode === RoleCode.REPORT_VIEWER,
    canViewBatches:
      roleCode === RoleCode.ORG_ADMIN ||
      roleCode === RoleCode.TREASURER ||
      roleCode === RoleCode.REPORT_VIEWER,
    canViewStatementAccessReport:
      roleCode === RoleCode.ORG_ADMIN || roleCode === RoleCode.TREASURER,
  };
}

function boundQuery(value: string | undefined) {
  return String(value ?? "").trim().slice(0, CONTRIBUTION_REPORT_SEARCH_MAX);
}

export function parseContributionReportFilters(
  raw: Record<string, string | string[] | undefined>,
  timeZone: string | null | undefined,
): ContributionReportFilters {
  const value = (key: string) => {
    const item = raw[key];
    return typeof item === "string" ? item : "";
  };
  const defaults = defaultContributionReportPeriod(timeZone);
  const startDate = value("startDate") || defaults.startDate;
  const endDate = value("endDate") || defaults.endDate;
  const start = parseDateOnly(startDate);
  const endInclusive = parseDateOnly(endDate);
  if (!start || !endInclusive) {
    throw new ContributionReportError("Enter a valid offering-date range.");
  }
  if (start.getTime() > endInclusive.getTime()) {
    throw new ContributionReportError(
      "The offering-date range must start on or before the end date.",
    );
  }
  if (daysInclusive(start, endInclusive) > CONTRIBUTION_REPORT_MAX_RANGE_DAYS) {
    throw new ContributionReportError(
      `Narrow the offering-date range to ${CONTRIBUTION_REPORT_MAX_RANGE_DAYS} days or fewer.`,
    );
  }
  const paymentRaw = value("paymentMethod");
  let paymentMethod: PaymentMethod | null = null;
  if (paymentRaw) {
    if (!Object.values(PaymentMethod).includes(paymentRaw as PaymentMethod)) {
      throw new ContributionReportError("That payment method is not valid.");
    }
    paymentMethod = paymentRaw as PaymentMethod;
  }
  try {
    return {
      view: parseContributionReportView(value("view")),
      organizationId: value("organizationId") || null,
      startDate,
      endDate,
      start,
      endInclusive,
      endExclusive: exclusiveEndDate(endInclusive),
      donorId: parseUuidParam(value("donorId")),
      householdId: parseUuidParam(value("householdId")),
      offeringTypeId: parseUuidParam(value("offeringTypeId")),
      batchId: parseUuidParam(value("batchId")),
      paymentMethod,
      includeTest: value("includeTest") === "1",
      page: parseContributionReportPage(value("page")),
      pageSize: parseContributionReportPageSize(value("pageSize")),
      donorQuery: boundQuery(value("donorQ")),
      householdQuery: boundQuery(value("householdQ")),
      offeringTypeQuery: boundQuery(value("offeringTypeQ")),
      batchQuery: boundQuery(value("batchQ")),
    };
  } catch (error) {
    if (error instanceof ContributionReportError) throw error;
    throw new ContributionReportError(
      error instanceof Error ? error.message : "That filter is not valid.",
    );
  }
}

function donorLabel(row: {
  anonymous: boolean;
  donorId: string | null;
  donor: { firstName: string; lastName: string; active: boolean } | null;
}) {
  if (row.anonymous) return "Anonymous";
  if (!row.donorId || !row.donor) return "Unmatched";
  return `${row.donor.lastName}, ${row.donor.firstName}${row.donor.active ? "" : " (inactive)"}`;
}

function categoryBreakdown(
  allocations: Array<{
    amount: { toString(): string };
    offeringType: { name: string };
  }>,
) {
  return allocations
    .map((row) => `${row.offeringType.name} ${moneyText(row.amount)}`)
    .join("; ");
}

function matchingFundAmount(
  allocations: Array<{ offeringTypeId: string; amount: { toString(): string } }>,
  offeringTypeId: string | null,
) {
  if (!offeringTypeId) return null;
  return sumMoneyAmounts(
    allocations
      .filter((row) => row.offeringTypeId === offeringTypeId)
      .map((row) => row.amount.toString()),
  );
}

function membershipsByDonor(
  rows: Array<{
    donorId: string;
    householdId: string;
    startDate: Date;
    endDate: Date | null;
    household: { id: string; displayName: string; active: boolean };
  }>,
) {
  const map = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = map.get(row.donorId) ?? [];
    list.push(row);
    map.set(row.donorId, list);
  }
  return map;
}

function householdLabelFor(
  attribution: HouseholdAttribution,
  byDonor: Map<
    string,
    Array<{
      householdId: string;
      household: { displayName: string };
    }>
  >,
  donorId: string | null,
) {
  if (attribution.bucket === "household") {
    return (
      byDonor
        .get(donorId ?? "")
        ?.find((membership) => membership.householdId === attribution.householdId)
        ?.household.displayName ?? attribution.householdId
    );
  }
  if (attribution.bucket === "ambiguous") return "Needs household review";
  if (attribution.bucket === "anonymous") return "Anonymous";
  if (attribution.bucket === "unmatched") return "Unmatched";
  return "Unassigned";
}

function householdKey(attribution: HouseholdAttribution) {
  if (attribution.bucket === "household") return `household:${attribution.householdId}`;
  if (attribution.bucket === "ambiguous") return "ambiguous";
  return attribution.bucket;
}

export async function getContributionReport(
  raw: Record<string, string | string[] | undefined>,
) {
  const requestedOrganizationId =
    typeof raw.organizationId === "string" ? raw.organizationId : undefined;
  const access = await requireContributionReportAccess(
    requestedOrganizationId || undefined,
  );
  const filters = parseContributionReportFilters(raw, access.organization.timeZone);
  const targets = await findContributionFilterTargets({
    organizationId: access.organization.id,
    donorId: filters.donorId,
    householdId: filters.householdId,
    offeringTypeId: filters.offeringTypeId,
    batchId: filters.batchId,
  });
  if (!targets.donor || !targets.household || !targets.offeringType || !targets.batch) {
    throw new ContributionReportError(
      "That filter is not part of this church. The report was not broadened.",
    );
  }

  const householdDonorIds = filters.householdId
    ? await listHouseholdDonorIdsInRange({
        organizationId: access.organization.id,
        householdId: filters.householdId,
        start: filters.start,
        endInclusive: filters.endInclusive,
      })
    : null;

  const query: ContributionReportQuery = {
    organizationId: access.organization.id,
    start: filters.start,
    endExclusive: filters.endExclusive,
    donorId: filters.donorId,
    offeringTypeId: filters.offeringTypeId,
    batchId: filters.batchId,
    paymentMethod: filters.paymentMethod,
    includeTest: filters.includeTest,
    householdDonorIds:
      householdDonorIds && filters.donorId
        ? householdDonorIds.includes(filters.donorId)
          ? [filters.donorId]
          : []
        : householdDonorIds,
  };

  return prisma.$transaction(async (tx) => {
    const count = await countContributionDonations(query, tx);
    if (count > CONTRIBUTION_REPORT_MAX_ROWS) {
      throw new ContributionReportError(
        `This filter matches more than ${CONTRIBUTION_REPORT_MAX_ROWS} gifts. Narrow the offering-date range or other filters. The export was not truncated.`,
      );
    }
    const [allRows, giftTotals, matchingFund, allocationGroups, pickers] =
      await Promise.all([
        listContributionDonations({ ...query, skip: 0, take: CONTRIBUTION_REPORT_MAX_ROWS }, tx),
        sumContributionDonations(query, tx),
        sumMatchingFundAllocations(query, tx),
        filters.view === "offering-type"
          ? groupContributionAllocations(query, tx)
          : Promise.resolve([]),
        listContributionReportPickers({
          organizationId: access.organization.id,
          donorQuery: filters.donorQuery,
          householdQuery: filters.householdQuery,
          offeringTypeQuery: filters.offeringTypeQuery,
          batchQuery: filters.batchQuery,
        }),
      ]);

    const donorIds = [
      ...new Set(
        allRows
          .map((row) => row.donorId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const memberships = await listHouseholdMembershipsForDonors(
      access.organization.id,
      donorIds,
      tx,
    );
    const byDonor = membershipsByDonor(memberships);
    const attributed = allRows.map((row) => ({
      row,
      attribution: attributeGiftToHousehold(row, byDonor.get(row.donorId ?? "") ?? []),
    }));
    const scoped = filters.householdId
      ? attributed.filter((item) => {
          if (item.attribution.bucket === "household") {
            return item.attribution.householdId === filters.householdId;
          }
          if (item.attribution.bucket === "ambiguous") {
            return item.attribution.householdIds.includes(filters.householdId!);
          }
          return false;
        })
      : attributed;

    const detailRows = scoped.map((item) => ({
      id: item.row.id,
      offeringDate: item.row.offeringDate.toISOString().slice(0, 10),
      donorLabel: donorLabel(item.row),
      donorId: item.row.anonymous ? null : item.row.donorId,
      paymentMethod: CONTRIBUTION_REPORT_PAYMENT_LABELS[item.row.paymentMethod],
      batchLabel: item.row.batch?.name ?? "No batch",
      batchStatus: item.row.batch?.status ?? "",
      batchId: item.row.batchId,
      giftTotal: moneyText(item.row.totalAmount),
      deductibleAmount: moneyText(item.row.deductibleAmount),
      matchingFundAllocation: matchingFundAmount(
        item.row.allocations,
        filters.offeringTypeId,
      ),
      categoryBreakdown: categoryBreakdown(item.row.allocations),
      householdLabel: householdLabelFor(item.attribution, byDonor, item.row.donorId),
      householdReview: item.attribution.bucket === "ambiguous",
    }));

    const pageRows = detailRows.slice(
      (filters.page - 1) * filters.pageSize,
      filters.page * filters.pageSize,
    );

    const donorGroups = new Map<
      string,
      { label: string; count: number; giftTotal: string[]; deductible: string[]; matching: string[] }
    >();
    for (const item of scoped) {
      const key = item.row.anonymous
        ? "anonymous"
        : item.row.donorId
          ? `donor:${item.row.donorId}`
          : "unmatched";
      const current = donorGroups.get(key) ?? {
        label:
          key === "anonymous"
            ? "Anonymous"
            : key === "unmatched"
              ? "Unmatched"
              : donorLabel(item.row),
        count: 0,
        giftTotal: [],
        deductible: [],
        matching: [],
      };
      current.count += 1;
      current.giftTotal.push(moneyText(item.row.totalAmount));
      current.deductible.push(moneyText(item.row.deductibleAmount));
      const match = matchingFundAmount(item.row.allocations, filters.offeringTypeId);
      if (match) current.matching.push(match);
      donorGroups.set(key, current);
    }

    const householdGroups = new Map<
      string,
      { label: string; count: number; giftTotal: string[]; deductible: string[]; matching: string[]; review: boolean }
    >();
    const householdNames = new Map(
      memberships.map((row) => [row.householdId, row.household.displayName]),
    );
    for (const item of scoped) {
      const key = householdKey(item.attribution);
      const current = householdGroups.get(key) ?? {
        label:
          item.attribution.bucket === "household"
            ? (householdNames.get(item.attribution.householdId) ??
              item.attribution.householdId)
            : item.attribution.bucket === "ambiguous"
              ? "Needs household review"
              : item.attribution.bucket === "anonymous"
                ? "Anonymous"
                : item.attribution.bucket === "unmatched"
                  ? "Unmatched"
                  : "Unassigned",
        count: 0,
        giftTotal: [],
        deductible: [],
        matching: [],
        review: item.attribution.bucket === "ambiguous",
      };
      current.count += 1;
      current.giftTotal.push(moneyText(item.row.totalAmount));
      current.deductible.push(moneyText(item.row.deductibleAmount));
      const match = matchingFundAmount(item.row.allocations, filters.offeringTypeId);
      if (match) current.matching.push(match);
      householdGroups.set(key, current);
    }

    const offeringTypes = await tx.offeringType.findMany({
      where: {
        organizationId: access.organization.id,
        id: { in: allocationGroups.map((row) => row.offeringTypeId) },
      },
      select: { id: true, name: true, active: true },
    });
    const offeringTypeNames = new Map(offeringTypes.map((row) => [row.id, row]));

    const scopedGiftTotal = sumMoneyAmounts(detailRows.map((row) => row.giftTotal));
    const scopedDeductible = sumMoneyAmounts(
      detailRows.map((row) => row.deductibleAmount),
    );
    const scopedMatching = filters.offeringTypeId
      ? sumMoneyAmounts(
          detailRows
            .map((row) => row.matchingFundAllocation)
            .filter((value): value is string => Boolean(value)),
        )
      : null;

    return {
      ...access,
      filters,
      pickers,
      overflowRejected: false,
      totals: {
        giftCount: detailRows.length,
        giftTotal: filters.householdId
          ? scopedGiftTotal
          : moneyText(giftTotals._sum.totalAmount),
        deductibleAmount: filters.householdId
          ? scopedDeductible
          : moneyText(giftTotals._sum.deductibleAmount),
        matchingFundAllocation: filters.householdId
          ? scopedMatching
          : matchingFund
            ? moneyText(matchingFund._sum.amount)
            : null,
        unfilteredCount: count,
      },
      detail: {
        rows: pageRows,
        total: detailRows.length,
      },
      donors: [...donorGroups.entries()]
        .map(([key, value]) => ({
          key,
          label: value.label,
          giftCount: value.count,
          giftTotal: sumMoneyAmounts(value.giftTotal),
          deductibleAmount: sumMoneyAmounts(value.deductible),
          matchingFundAllocation: filters.offeringTypeId
            ? sumMoneyAmounts(value.matching)
            : null,
        }))
        .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key)),
      households: [...householdGroups.entries()]
        .map(([key, value]) => ({
          key,
          label: value.label,
          giftCount: value.count,
          giftTotal: sumMoneyAmounts(value.giftTotal),
          deductibleAmount: sumMoneyAmounts(value.deductible),
          matchingFundAllocation: filters.offeringTypeId
            ? sumMoneyAmounts(value.matching)
            : null,
          review: value.review,
        }))
        .sort((left, right) => left.label.localeCompare(right.label) || left.key.localeCompare(right.key)),
      offeringTypes: allocationGroups
        .map((row) => ({
          id: row.offeringTypeId,
          name: offeringTypeNames.get(row.offeringTypeId)?.name ?? row.offeringTypeId,
          active: offeringTypeNames.get(row.offeringTypeId)?.active ?? false,
          allocationTotal: moneyText(row._sum.amount),
          allocationCount: row._count._all,
        }))
        .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
      allDetailRows: detailRows,
    };
  });
}

function csvRowsForView(
  view: ContributionReportView,
  report: Awaited<ReturnType<typeof getContributionReport>>,
) {
  const fund = Boolean(report.filters.offeringTypeId);
  if (view === "detail") {
    return [
      [
        "Offering date",
        "Donor",
        "Payment method",
        "Batch",
        "Batch status",
        "Gift total",
        "Deductible amount",
        ...(fund ? ["Matching fund allocation"] : []),
        "Fund breakdown",
      ],
      ...report.allDetailRows.map((row) => [
        row.offeringDate,
        row.donorLabel,
        row.paymentMethod,
        row.batchLabel,
        row.batchStatus,
        row.giftTotal,
        row.deductibleAmount,
        ...(fund ? [row.matchingFundAllocation ?? "0.00"] : []),
        row.categoryBreakdown,
      ]),
    ];
  }
  if (view === "donor") {
    return [
      [
        "Donor group",
        "Gift count",
        "Gift total",
        "Deductible amount",
        ...(fund ? ["Matching fund allocation"] : []),
      ],
      ...report.donors.map((row) => [
        row.label,
        String(row.giftCount),
        row.giftTotal,
        row.deductibleAmount,
        ...(fund ? [row.matchingFundAllocation ?? "0.00"] : []),
      ]),
    ];
  }
  if (view === "household") {
    return [
      [
        "Giving household",
        "Gift count",
        "Gift total",
        "Deductible amount",
        ...(fund ? ["Matching fund allocation"] : []),
        "Review needed",
      ],
      ...report.households.map((row) => [
        row.label,
        String(row.giftCount),
        row.giftTotal,
        row.deductibleAmount,
        ...(fund ? [row.matchingFundAllocation ?? "0.00"] : []),
        row.review ? "Yes" : "No",
      ]),
    ];
  }
  return [
    ["Offering type", "Status", "Allocation total", "Allocation count"],
    ...report.offeringTypes.map((row) => [
      row.name,
      row.active ? "Active" : "Inactive",
      row.allocationTotal,
      String(row.allocationCount),
    ]),
  ];
}

export async function exportContributionReportCsv(
  raw: Record<string, string | string[] | undefined>,
) {
  const report = await getContributionReport(raw);
  const csv = buildContributionCsv(csvRowsForView(report.filters.view, report));
  const filename = contributionReportFilename(report.filters);
  try {
    await createAuditEvent({
      organizationId: report.organization.id,
      actorUserAccountId: report.actor.id,
      action: "CONTRIBUTION_REPORT_EXPORTED",
      entityType: "ContributionReport",
      entityId: report.organization.id,
      changes: [
        { field: "view", oldValue: null, newValue: report.filters.view },
        { field: "startDate", oldValue: null, newValue: report.filters.startDate },
        { field: "endDate", oldValue: null, newValue: report.filters.endDate },
        {
          field: "includeTest",
          oldValue: null,
          newValue: report.filters.includeTest ? "test-only" : "real-only",
        },
        {
          field: "rowCount",
          oldValue: null,
          newValue: String(
            report.filters.view === "detail"
              ? report.allDetailRows.length
              : report.filters.view === "donor"
                ? report.donors.length
                : report.filters.view === "household"
                  ? report.households.length
                  : report.offeringTypes.length,
          ),
        },
      ],
    });
  } catch {
    throw new ContributionReportError(
      "The export could not be audited, so it was not released.",
    );
  }
  return { csv, filename, report };
}
