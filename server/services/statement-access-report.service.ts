import {
  canExportStatementAccessReports,
  canViewStatementAccessReports,
} from "@/lib/auth/report-catalog-permissions";
import { buildContributionCsv } from "@/lib/csv/contribution-csv";
import { prisma } from "@/lib/db/prisma";
import { formatInTimeZone } from "@/lib/reports/church-timezone-range";
import {
  STATEMENT_ACCESS_ACTION_LABELS,
  STATEMENT_ACCESS_COPY,
  STATEMENT_ACCESS_MAX_EVENTS,
  STATEMENT_ACCESS_PRIVACY_COPY,
  parseStatementAccessFilters,
  statementAccessFilename,
} from "@/lib/validation/statement-access-report";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  countStatementAccessEvents,
  findStatementAccessFilterTargets,
  listStatementAccessEvents,
  listStatementAccessPickers,
} from "@/server/repositories/statement-access-report.repository";
import {
  ReportCatalogError,
  requireReportCatalogAccess,
} from "@/server/services/report-catalog-access";

export class StatementAccessReportError extends ReportCatalogError {}

export async function requireStatementAccessReportAccess(
  expectedOrganizationId?: string,
) {
  try {
    return await requireReportCatalogAccess({
      expectedOrganizationId,
      allowed: (role) =>
        canViewStatementAccessReports(role) &&
        canExportStatementAccessReports(role),
      signInMessage: "Sign in to view the statement access report.",
      permissionMessage:
        "You do not have permission to view the statement access report.",
    });
  } catch (error) {
    if (error instanceof ReportCatalogError) {
      throw new StatementAccessReportError(error.message);
    }
    throw error;
  }
}

function wrap(error: unknown): never {
  if (error instanceof StatementAccessReportError) throw error;
  throw new StatementAccessReportError(
    error instanceof Error ? error.message : "That filter is not valid.",
  );
}

function actorLabel(actor: { displayName: string | null } | null) {
  const name = actor?.displayName?.trim();
  return name || "Staff member";
}

function recipientLabel(statement: {
  statementType: string;
  donor: {
    firstName: string;
    lastName: string;
    organizationId: string;
  } | null;
  household: {
    displayName: string;
    organizationId: string;
  } | null;
  organizationId?: string;
} | null) {
  if (!statement) return "Unavailable recipient";
  if (statement.donor) {
    return `${statement.donor.firstName} ${statement.donor.lastName}`.trim();
  }
  if (statement.household?.displayName.trim()) {
    return statement.household.displayName.trim();
  }
  return "Unavailable recipient";
}

export async function getStatementAccessReport(
  raw: Record<string, string | string[] | undefined>,
) {
  const requestedOrganizationId =
    typeof raw.organizationId === "string" ? raw.organizationId : undefined;
  const access = await requireStatementAccessReportAccess(
    requestedOrganizationId || undefined,
  );
  let filters;
  try {
    filters = parseStatementAccessFilters(raw, access.organization.timeZone);
  } catch (error) {
    wrap(error);
  }
  const targets = await findStatementAccessFilterTargets({
    organizationId: access.organization.id,
    statementId: filters.statementId,
    donorId: filters.donorId,
    householdId: filters.householdId,
    actorUserAccountId: filters.actorUserAccountId,
  });
  if (!targets.statement || !targets.donor || !targets.household || !targets.actor) {
    throw new StatementAccessReportError(
      "That filter is not part of this church. The report was not broadened.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const query = {
      organizationId: access.organization.id,
      startUtc: filters.startUtc,
      endExclusiveUtc: filters.endExclusiveUtc,
      statementId: filters.statementId,
      donorId: filters.donorId,
      householdId: filters.householdId,
      actorUserAccountId: filters.actorUserAccountId,
      action: filters.action,
    };
    const count = await countStatementAccessEvents(query, tx);
    if (count > STATEMENT_ACCESS_MAX_EVENTS) {
      throw new StatementAccessReportError(
        `This filter matches more than ${STATEMENT_ACCESS_MAX_EVENTS} access events. Narrow the date range or other filters. The export was not truncated.`,
      );
    }
    const [events, pickers] = await Promise.all([
      listStatementAccessEvents(query, STATEMENT_ACCESS_MAX_EVENTS, tx),
      listStatementAccessPickers(
        {
          organizationId: access.organization.id,
          statementQuery: filters.statementQuery,
          donorQuery: filters.donorQuery,
          householdQuery: filters.householdQuery,
          actorQuery: filters.actorQuery,
        },
        tx,
      ),
    ]);

    const allRows = events.map((event) => ({
      id: event.id,
      occurredAtUtc: event.occurredAt.toISOString(),
      occurredAtLocal: formatInTimeZone(event.occurredAt, filters.timeZone),
      timeZone: filters.timeZone,
      statementIdentifier: event.statement?.statementIdentifier ?? "Unavailable statement",
      statementType: event.statement?.statementType ?? "",
      statementTypeLabel:
        event.statement?.statementType === "HOUSEHOLD"
          ? "Household"
          : event.statement?.statementType === "INDIVIDUAL"
            ? "Individual"
            : "Unavailable",
      statementStatus: event.statement?.status ?? "",
      statementStatusLabel: event.statement?.status ?? "Unavailable",
      recipientLabel: recipientLabel(event.statement),
      action: event.action,
      actionLabel: STATEMENT_ACCESS_ACTION_LABELS[event.action] ?? event.action,
      actorLabel: actorLabel(event.userAccount),
    }));

    return {
      ...access,
      copy: STATEMENT_ACCESS_COPY,
      privacyCopy: STATEMENT_ACCESS_PRIVACY_COPY,
      generatedAt: new Date(),
      filters,
      pickers,
      rows: allRows.slice(
        (filters.page - 1) * filters.pageSize,
        filters.page * filters.pageSize,
      ),
      allRows,
      totals: {
        eventCount: allRows.length,
      },
    };
  });
}

function csvRows(
  report: Awaited<ReturnType<typeof getStatementAccessReport>>,
) {
  return [
    ["Report", "Statement access"],
    [
      "Church",
      report.organization.displayName?.trim() || report.organization.name,
    ],
    ["Access dates", `${report.filters.startDate} through ${report.filters.endDate}`],
    ["Church time zone", report.filters.timeZone],
    ["Generated at (UTC)", report.generatedAt.toISOString()],
    ["Note", `${STATEMENT_ACCESS_COPY} ${STATEMENT_ACCESS_PRIVACY_COPY}`],
    [],
    [
      "Occurred at (UTC)",
      "Occurred at (church)",
      "Church time zone",
      "Statement identifier",
      "Statement type",
      "Statement status",
      "Recipient",
      "Action",
      "Actor",
    ],
    ...report.allRows.map((row) => [
      row.occurredAtUtc,
      row.occurredAtLocal,
      row.timeZone,
      row.statementIdentifier,
      row.statementTypeLabel,
      row.statementStatusLabel,
      row.recipientLabel,
      row.actionLabel,
      row.actorLabel,
    ]),
  ];
}

export async function exportStatementAccessReportCsv(
  raw: Record<string, string | string[] | undefined>,
) {
  const report = await getStatementAccessReport(raw);
  const csv = buildContributionCsv(csvRows(report));
  const filename = statementAccessFilename(report.filters);
  try {
    await createAuditEvent({
      organizationId: report.organization.id,
      actorUserAccountId: report.actor.id,
      action: "STATEMENT_ACCESS_REPORT_EXPORTED",
      entityType: "StatementAccessReport",
      entityId: report.organization.id,
      changes: [
        { field: "startDate", oldValue: null, newValue: report.filters.startDate },
        { field: "endDate", oldValue: null, newValue: report.filters.endDate },
        {
          field: "action",
          oldValue: null,
          newValue: report.filters.action ?? "all",
        },
        { field: "rowCount", oldValue: null, newValue: String(report.allRows.length) },
        { field: "timeZone", oldValue: null, newValue: report.filters.timeZone },
      ],
    });
  } catch {
    throw new StatementAccessReportError(
      "The export could not be audited, so it was not released.",
    );
  }
  return { csv, filename, report };
}
