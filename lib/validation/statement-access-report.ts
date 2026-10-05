import { StatementAccessAction } from "@/app/generated/prisma/client";

import {
  exclusiveZonedDayEndUtc,
  resolveChurchTimeZone,
  zonedDayStartUtc,
} from "@/lib/reports/church-timezone-range";
import {
  CONTRIBUTION_REPORT_DEFAULT_PAGE_SIZE,
  CONTRIBUTION_REPORT_MAX_RANGE_DAYS,
  CONTRIBUTION_REPORT_PAGE_SIZES,
  CONTRIBUTION_REPORT_SEARCH_MAX,
  daysInclusive,
  defaultContributionReportPeriod,
  parseContributionReportPage,
  parseContributionReportPageSize,
  parseUuidParam,
} from "@/lib/validation/contribution-report";
import { parseDateOnly } from "@/lib/validation/giving-household";

export const STATEMENT_ACCESS_MAX_RANGE_DAYS = CONTRIBUTION_REPORT_MAX_RANGE_DAYS;
export const STATEMENT_ACCESS_MAX_EVENTS = 5000;
export const STATEMENT_ACCESS_PAGE_SIZES = CONTRIBUTION_REPORT_PAGE_SIZES;
export const STATEMENT_ACCESS_DEFAULT_PAGE_SIZE =
  CONTRIBUTION_REPORT_DEFAULT_PAGE_SIZE;
export const STATEMENT_ACCESS_SEARCH_MAX = CONTRIBUTION_REPORT_SEARCH_MAX;
export const STATEMENT_ACCESS_PICKER_SIZE = 25;

export const STATEMENT_ACCESS_ACTIONS = [
  StatementAccessAction.GENERATED,
  StatementAccessAction.VIEWED,
  StatementAccessAction.DOWNLOADED,
  StatementAccessAction.EMAILED,
  StatementAccessAction.VOIDED,
] as const;

export const STATEMENT_ACCESS_ACTION_LABELS: Record<string, string> = {
  GENERATED: "Generated",
  VIEWED: "Viewed",
  DOWNLOADED: "Downloaded",
  EMAILED: "Emailed",
  VOIDED: "Voided",
};

export const STATEMENT_ACCESS_COPY =
  "This report lists stored statement access events only. It does not infer that a person read a file, synthesize missing rows from other audit history, or replace the statement lifecycle timeline.";

export const STATEMENT_ACCESS_PRIVACY_COPY =
  "Report viewers can open statements but cannot export this staff and recipient access history. PDF storage keys, checksums, download tokens, addresses, notes and void reasons are omitted.";

export function parseStatementAccessAction(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (!STATEMENT_ACCESS_ACTIONS.includes(trimmed as StatementAccessAction)) {
    throw new Error("That access action is not valid.");
  }
  return trimmed as StatementAccessAction;
}

export function statementAccessFilename(input: {
  startDate: string;
  endDate: string;
}) {
  const start = input.startDate.replaceAll(/[^0-9-]/g, "");
  const end = input.endDate.replaceAll(/[^0-9-]/g, "");
  return `statement-access-${start}-to-${end}.csv`;
}

export type StatementAccessFilters = {
  startDate: string;
  endDate: string;
  startUtc: Date;
  endExclusiveUtc: Date;
  timeZone: string;
  statementId: string | null;
  donorId: string | null;
  householdId: string | null;
  actorUserAccountId: string | null;
  action: StatementAccessAction | null;
  organizationId: string | null;
  page: number;
  pageSize: number;
  statementQuery: string;
  donorQuery: string;
  householdQuery: string;
  actorQuery: string;
};

export function parseStatementAccessFilters(
  raw: Record<string, string | string[] | undefined>,
  timeZone: string | null | undefined,
): StatementAccessFilters {
  const value = (key: string) => {
    const item = raw[key];
    return typeof item === "string" ? item : "";
  };
  const zone = resolveChurchTimeZone(timeZone);
  const defaults = defaultContributionReportPeriod(zone);
  const startDate = value("startDate") || defaults.startDate;
  const endDate = value("endDate") || defaults.endDate;
  const start = parseDateOnly(startDate);
  const endInclusive = parseDateOnly(endDate);
  if (!start || !endInclusive) {
    throw new Error("Enter a valid access-date range.");
  }
  if (start.getTime() > endInclusive.getTime()) {
    throw new Error("The access-date range must start on or before the end date.");
  }
  if (daysInclusive(start, endInclusive) > STATEMENT_ACCESS_MAX_RANGE_DAYS) {
    throw new Error(
      `Narrow the access-date range to ${STATEMENT_ACCESS_MAX_RANGE_DAYS} days or fewer.`,
    );
  }
  return {
    startDate,
    endDate,
    startUtc: zonedDayStartUtc(startDate, zone),
    endExclusiveUtc: exclusiveZonedDayEndUtc(endDate, zone),
    timeZone: zone,
    statementId: parseUuidParam(value("statementId")),
    donorId: parseUuidParam(value("donorId")),
    householdId: parseUuidParam(value("householdId")),
    actorUserAccountId: parseUuidParam(value("actorUserAccountId")),
    action: parseStatementAccessAction(value("action")),
    organizationId: value("organizationId") || null,
    page: parseContributionReportPage(value("page")),
    pageSize: parseContributionReportPageSize(value("pageSize")),
    statementQuery: value("statementQ").trim().slice(0, STATEMENT_ACCESS_SEARCH_MAX),
    donorQuery: value("donorQ").trim().slice(0, STATEMENT_ACCESS_SEARCH_MAX),
    householdQuery: value("householdQ").trim().slice(0, STATEMENT_ACCESS_SEARCH_MAX),
    actorQuery: value("actorQ").trim().slice(0, STATEMENT_ACCESS_SEARCH_MAX),
  };
}
