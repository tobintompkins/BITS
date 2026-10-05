import { OfferingBatchStatus } from "@/app/generated/prisma/client";

import {
  CONTRIBUTION_REPORT_DEFAULT_PAGE_SIZE,
  CONTRIBUTION_REPORT_MAX_RANGE_DAYS,
  CONTRIBUTION_REPORT_PAGE_SIZES,
  CONTRIBUTION_REPORT_SEARCH_MAX,
  daysInclusive,
  defaultContributionReportPeriod,
  exclusiveEndDate,
  parseContributionReportPage,
  parseContributionReportPageSize,
  parseUuidParam,
} from "@/lib/validation/contribution-report";
import { parseDateOnly } from "@/lib/validation/giving-household";

export const BATCH_RECONCILIATION_MAX_RANGE_DAYS =
  CONTRIBUTION_REPORT_MAX_RANGE_DAYS;
export const BATCH_RECONCILIATION_MAX_BATCHES = 500;
export const BATCH_RECONCILIATION_MAX_DONATIONS = 5000;
export const BATCH_RECONCILIATION_PAGE_SIZES = CONTRIBUTION_REPORT_PAGE_SIZES;
export const BATCH_RECONCILIATION_DEFAULT_PAGE_SIZE =
  CONTRIBUTION_REPORT_DEFAULT_PAGE_SIZE;
export const BATCH_RECONCILIATION_SEARCH_MAX = CONTRIBUTION_REPORT_SEARCH_MAX;
export const BATCH_RECONCILIATION_PICKER_SIZE = 25;

export const BATCH_RECONCILIATION_STATUSES = [
  OfferingBatchStatus.DRAFT,
  OfferingBatchStatus.ENTERED,
  OfferingBatchStatus.RECONCILED,
  OfferingBatchStatus.LOCKED,
] as const;

export const BATCH_RECONCILIATION_COPY =
  "This operational batch worksheet lists offering batches and independently calculated gift totals. It is not a bank or accounting reconciliation. Discrepancies are read-only and do not change batch status or stored totals.";

export const BATCH_RECONCILIATION_VARIANCE_COPY =
  "Variance is calculated gift total minus expected total. An unset expected total stays blank and is not treated as zero. Stored recorded minus calculated shows a denormalized-total mismatch. Mixed real/test batches are flagged and excluded from comparable aggregate variance.";

export function parseBatchReconciliationStatus(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (
    !BATCH_RECONCILIATION_STATUSES.includes(trimmed as OfferingBatchStatus)
  ) {
    throw new Error("That batch status is not valid.");
  }
  return trimmed as OfferingBatchStatus;
}

export function batchReconciliationFilename(input: {
  startDate: string;
  endDate: string;
}) {
  const start = input.startDate.replaceAll(/[^0-9-]/g, "");
  const end = input.endDate.replaceAll(/[^0-9-]/g, "");
  return `batch-reconciliation-${start}-to-${end}.csv`;
}

export type BatchReconciliationFilters = {
  startDate: string;
  endDate: string;
  start: Date;
  endInclusive: Date;
  endExclusive: Date;
  batchId: string | null;
  status: OfferingBatchStatus | null;
  organizationId: string | null;
  page: number;
  pageSize: number;
  batchQuery: string;
  print: boolean;
};

export function parseBatchReconciliationFilters(
  raw: Record<string, string | string[] | undefined>,
  timeZone: string | null | undefined,
): BatchReconciliationFilters {
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
    throw new Error("Enter a valid batch offering-date range.");
  }
  if (start.getTime() > endInclusive.getTime()) {
    throw new Error("The offering-date range must start on or before the end date.");
  }
  if (daysInclusive(start, endInclusive) > BATCH_RECONCILIATION_MAX_RANGE_DAYS) {
    throw new Error(
      `Narrow the offering-date range to ${BATCH_RECONCILIATION_MAX_RANGE_DAYS} days or fewer.`,
    );
  }
  return {
    startDate,
    endDate,
    start,
    endInclusive,
    endExclusive: exclusiveEndDate(endInclusive),
    batchId: parseUuidParam(value("batchId")),
    status: parseBatchReconciliationStatus(value("status")),
    organizationId: value("organizationId") || null,
    page: parseContributionReportPage(value("page")),
    pageSize: parseContributionReportPageSize(value("pageSize")),
    batchQuery: value("batchQ").trim().slice(0, BATCH_RECONCILIATION_SEARCH_MAX),
    print: value("print") === "1",
  };
}
