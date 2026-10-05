import { z } from "zod";

import { PaymentMethod } from "@/app/generated/prisma/client";
import {
  addUtcDays,
  calendarDateInTimeZone,
  formatDateOnly,
  parseDateOnly,
} from "@/lib/validation/giving-household";

export const CONTRIBUTION_REPORT_VIEWS = [
  "detail",
  "donor",
  "household",
  "offering-type",
] as const;

export type ContributionReportView = (typeof CONTRIBUTION_REPORT_VIEWS)[number];

export const CONTRIBUTION_REPORT_PAGE_SIZES = [25, 50] as const;
export const CONTRIBUTION_REPORT_DEFAULT_PAGE_SIZE = 25;
export const CONTRIBUTION_REPORT_MAX_RANGE_DAYS = 366;
export const CONTRIBUTION_REPORT_MAX_ROWS = 5000;
export const CONTRIBUTION_REPORT_SEARCH_MAX = 100;
export const CONTRIBUTION_REPORT_PICKER_SIZE = 25;

export const CONTRIBUTION_REPORT_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.CHECK,
  PaymentMethod.CARD,
  PaymentMethod.ACH,
  PaymentMethod.STOCK_OR_NONCASH,
  PaymentMethod.OTHER,
] as const;

export const CONTRIBUTION_REPORT_PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CHECK: "Check",
  CARD: "Card",
  ACH: "ACH",
  STOCK_OR_NONCASH: "Stock or noncash",
  OTHER: "Other",
};

export const CONTRIBUTION_REPORT_COPY =
  "These operational reports list recorded gifts by offering date. They may differ from published statements. They are not tax-compliance reports.";

export const CONTRIBUTION_REPORT_FUND_FILTER_COPY =
  "When a fund is selected, gift totals stay whole-gift amounts. The matching-fund allocation column is only the money designated to that fund.";

export const CONTRIBUTION_REPORT_TEST_COPY =
  "Test gifts are excluded unless Test gifts only is selected. Test and real gifts are never mixed.";

export function parseContributionReportView(value: string | undefined) {
  return CONTRIBUTION_REPORT_VIEWS.includes(value as ContributionReportView)
    ? (value as ContributionReportView)
    : "detail";
}

export function parseContributionReportPageSize(value: string | undefined) {
  const parsed = Number(value);
  return CONTRIBUTION_REPORT_PAGE_SIZES.includes(
    parsed as (typeof CONTRIBUTION_REPORT_PAGE_SIZES)[number],
  )
    ? parsed
    : CONTRIBUTION_REPORT_DEFAULT_PAGE_SIZE;
}

export function parseContributionReportPage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(1, Math.min(100000, parsed)) : 1;
}

export function exclusiveEndDate(inclusiveEnd: Date) {
  return addUtcDays(inclusiveEnd, 1);
}

export function daysInclusive(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function defaultContributionReportPeriod(
  timeZone: string | null | undefined,
  now = new Date(),
) {
  const today = parseDateOnly(
    calendarDateInTimeZone(now, timeZone || "America/New_York"),
  );
  if (!today) {
    throw new Error("Unable to determine the church calendar date.");
  }
  const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  return { startDate: formatDateOnly(start), endDate: formatDateOnly(today) };
}

export function parseUuidParam(value: string | undefined | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (!z.string().uuid().safeParse(trimmed).success) {
    throw new Error("That filter is not valid.");
  }
  return trimmed;
}

export function contributionReportFilename(input: {
  view: ContributionReportView;
  startDate: string;
  endDate: string;
  includeTest: boolean;
}) {
  const view = input.view.replaceAll(/[^a-z-]/g, "");
  const start = input.startDate.replaceAll(/[^0-9-]/g, "");
  const end = input.endDate.replaceAll(/[^0-9-]/g, "");
  return `contribution-${view}-${start}-to-${end}${input.includeTest ? "-TEST" : ""}.csv`;
}

export type ContributionReportFilters = {
  view: ContributionReportView;
  startDate: string;
  endDate: string;
  start: Date;
  endInclusive: Date;
  endExclusive: Date;
  donorId: string | null;
  householdId: string | null;
  offeringTypeId: string | null;
  batchId: string | null;
  paymentMethod: PaymentMethod | null;
  organizationId: string | null;
  includeTest: boolean;
  page: number;
  pageSize: number;
  donorQuery: string;
  householdQuery: string;
  offeringTypeQuery: string;
  batchQuery: string;
};
