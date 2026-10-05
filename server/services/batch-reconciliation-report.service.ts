import Decimal from "decimal.js";

import {
  canExportBatchReconciliationReports,
  canViewBatchReconciliationReports,
} from "@/lib/auth/report-catalog-permissions";
import { batchStatusLabel, formatBatchDate } from "@/lib/batches/display";
import { buildContributionCsv } from "@/lib/csv/contribution-csv";
import { prisma } from "@/lib/db/prisma";
import { sumMoneyAmounts } from "@/lib/money/decimal";
import {
  BATCH_RECONCILIATION_COPY,
  BATCH_RECONCILIATION_MAX_BATCHES,
  BATCH_RECONCILIATION_MAX_DONATIONS,
  BATCH_RECONCILIATION_VARIANCE_COPY,
  batchReconciliationFilename,
  parseBatchReconciliationFilters,
} from "@/lib/validation/batch-reconciliation-report";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  countReconciliationBatches,
  countReconciliationDonations,
  findReconciliationBatchTarget,
  listReconciliationBatchPicker,
  listReconciliationBatches,
  listReconciliationDonations,
} from "@/server/repositories/batch-reconciliation-report.repository";
import {
  ReportCatalogError,
  requireReportCatalogAccess,
} from "@/server/services/report-catalog-access";

export class BatchReconciliationReportError extends ReportCatalogError {}

function moneyText(value: { toString(): string } | string | number | null | undefined) {
  if (value == null || value === "") return "0.00";
  return new Decimal(value.toString()).toFixed(2);
}

function optionalMoney(value: { toString(): string } | string | number | null | undefined) {
  if (value == null || value === "") return null;
  return new Decimal(value.toString()).toFixed(2);
}

export async function requireBatchReconciliationReportAccess(
  expectedOrganizationId?: string,
) {
  try {
    return await requireReportCatalogAccess({
      expectedOrganizationId,
      allowed: (role) =>
        canViewBatchReconciliationReports(role) &&
        canExportBatchReconciliationReports(role),
      signInMessage: "Sign in to view the batch reconciliation report.",
      permissionMessage:
        "You do not have permission to view the batch reconciliation report.",
    });
  } catch (error) {
    if (error instanceof ReportCatalogError) {
      throw new BatchReconciliationReportError(error.message);
    }
    throw error;
  }
}

function wrap(error: unknown): never {
  if (error instanceof BatchReconciliationReportError) throw error;
  throw new BatchReconciliationReportError(
    error instanceof Error ? error.message : "That filter is not valid.",
  );
}

export async function getBatchReconciliationReport(
  raw: Record<string, string | string[] | undefined>,
) {
  const requestedOrganizationId =
    typeof raw.organizationId === "string" ? raw.organizationId : undefined;
  const access = await requireBatchReconciliationReportAccess(
    requestedOrganizationId || undefined,
  );
  let filters;
  try {
    filters = parseBatchReconciliationFilters(raw, access.organization.timeZone);
  } catch (error) {
    wrap(error);
  }
  const belongs = await findReconciliationBatchTarget(
    access.organization.id,
    filters.batchId,
  );
  if (!belongs) {
    throw new BatchReconciliationReportError(
      "That filter is not part of this church. The report was not broadened.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const query = {
      organizationId: access.organization.id,
      start: filters.start,
      endExclusive: filters.endExclusive,
      batchId: filters.batchId,
      status: filters.status,
    };
    const batchCount = await countReconciliationBatches(query, tx);
    if (batchCount > BATCH_RECONCILIATION_MAX_BATCHES) {
      throw new BatchReconciliationReportError(
        `This filter matches more than ${BATCH_RECONCILIATION_MAX_BATCHES} batches. Narrow the offering-date range or other filters. The export was not truncated.`,
      );
    }
    const batches = await listReconciliationBatches(
      query,
      BATCH_RECONCILIATION_MAX_BATCHES,
      tx,
    );
    const batchIds = batches.map((row) => row.id);
    const donationCount = await countReconciliationDonations(
      access.organization.id,
      batchIds,
      tx,
    );
    if (donationCount > BATCH_RECONCILIATION_MAX_DONATIONS) {
      throw new BatchReconciliationReportError(
        `This filter matches more than ${BATCH_RECONCILIATION_MAX_DONATIONS} gifts across the selected batches. Narrow the offering-date range or other filters. The export was not truncated.`,
      );
    }
    const [donations, pickers] = await Promise.all([
      listReconciliationDonations(
        access.organization.id,
        batchIds,
        BATCH_RECONCILIATION_MAX_DONATIONS,
        tx,
      ),
      listReconciliationBatchPicker(access.organization.id, filters.batchQuery, tx),
    ]);

    const byBatch = new Map<string, typeof donations>();
    for (const donation of donations) {
      if (!donation.batchId) continue;
      const current = byBatch.get(donation.batchId) ?? [];
      current.push(donation);
      byBatch.set(donation.batchId, current);
    }

    const rows = batches.map((batch) => {
      const giftRows = byBatch.get(batch.id) ?? [];
      const calculatedGiftTotal = sumMoneyAmounts(
        giftRows.map((row) => row.totalAmount),
      );
      const allocationTotal = sumMoneyAmounts(
        giftRows.flatMap((row) => row.allocations.map((item) => item.amount)),
      );
      const realRows = giftRows.filter((row) => !row.isTest);
      const testRows = giftRows.filter((row) => row.isTest);
      const realGiftTotal = sumMoneyAmounts(realRows.map((row) => row.totalAmount));
      const testGiftTotal = sumMoneyAmounts(testRows.map((row) => row.totalAmount));
      const mixed = realRows.length > 0 && testRows.length > 0;
      const expectedTotal = optionalMoney(batch.expectedTotal);
      const recordedTotal = moneyText(batch.recordedTotal);
      return {
        id: batch.id,
        name: batch.name,
        reference: batch.reference ?? "",
        offeringDate: batch.offeringDate.toISOString().slice(0, 10),
        offeringDateLabel: formatBatchDate(batch.offeringDate),
        status: batch.status,
        statusLabel: batchStatusLabel(batch.status),
        expectedTotal,
        recordedTotal,
        calculatedGiftTotal,
        allocationTotal,
        variance:
          expectedTotal == null
            ? null
            : new Decimal(calculatedGiftTotal).minus(expectedTotal).toFixed(2),
        recordedMinusCalculated: new Decimal(recordedTotal)
          .minus(calculatedGiftTotal)
          .toFixed(2),
        giftCount: giftRows.length,
        realGiftCount: realRows.length,
        testGiftCount: testRows.length,
        realGiftTotal,
        testGiftTotal,
        mixed,
        anonymousGiftCount: giftRows.filter((row) => row.anonymous).length,
        depositDate: batch.depositDate
          ? batch.depositDate.toISOString().slice(0, 10)
          : "",
        depositDateLabel: formatBatchDate(batch.depositDate),
        depositReference: batch.depositReference ?? "",
      };
    });

    const comparable = rows.filter((row) => !row.mixed && row.expectedTotal != null);
    const pageRows = filters.print
      ? rows
      : rows.slice(
          (filters.page - 1) * filters.pageSize,
          filters.page * filters.pageSize,
        );

    return {
      ...access,
      copy: BATCH_RECONCILIATION_COPY,
      varianceCopy: BATCH_RECONCILIATION_VARIANCE_COPY,
      generatedAt: new Date(),
      filters,
      pickers,
      rows: pageRows,
      allRows: rows,
      totals: {
        batchCount: rows.length,
        giftCount: rows.reduce((sum, row) => sum + row.giftCount, 0),
        calculatedGiftTotal: sumMoneyAmounts(
          rows.map((row) => row.calculatedGiftTotal),
        ),
        allocationTotal: sumMoneyAmounts(rows.map((row) => row.allocationTotal)),
        recordedTotal: sumMoneyAmounts(rows.map((row) => row.recordedTotal)),
        realGiftTotal: sumMoneyAmounts(rows.map((row) => row.realGiftTotal)),
        testGiftTotal: sumMoneyAmounts(rows.map((row) => row.testGiftTotal)),
        mixedBatchCount: rows.filter((row) => row.mixed).length,
        comparableVarianceTotal: comparable.length
          ? sumMoneyAmounts(comparable.map((row) => row.variance ?? "0.00"))
          : null,
        emptyBatchCount: rows.filter((row) => row.giftCount === 0).length,
      },
    };
  });
}

function csvPreamble(
  report: Awaited<ReturnType<typeof getBatchReconciliationReport>>,
) {
  return [
    ["Report", "Batch reconciliation"],
    [
      "Church",
      report.organization.displayName?.trim() || report.organization.name,
    ],
    ["Offering dates", `${report.filters.startDate} through ${report.filters.endDate}`],
    ["Status filter", report.filters.status ?? "All"],
    ["Generated at (UTC)", report.generatedAt.toISOString()],
    ["Note", BATCH_RECONCILIATION_VARIANCE_COPY],
    [],
  ];
}

function csvBody(
  report: Awaited<ReturnType<typeof getBatchReconciliationReport>>,
) {
  return [
    [
      "Batch name",
      "Reference",
      "Offering date",
      "Status",
      "Expected total",
      "Stored recorded total",
      "Calculated gift total",
      "Allocation total",
      "Variance (calculated minus expected)",
      "Stored recorded minus calculated",
      "Gift count",
      "Real gift count",
      "Test gift count",
      "Real gift total",
      "Test gift total",
      "Mixed real/test",
      "Anonymous gift count",
      "Deposit date",
      "Deposit reference",
    ],
    ...report.allRows.map((row) => [
      row.name,
      row.reference,
      row.offeringDate,
      row.statusLabel,
      row.expectedTotal ?? "",
      row.recordedTotal,
      row.calculatedGiftTotal,
      row.allocationTotal,
      row.variance ?? "",
      row.recordedMinusCalculated,
      String(row.giftCount),
      String(row.realGiftCount),
      String(row.testGiftCount),
      row.realGiftTotal,
      row.testGiftTotal,
      row.mixed ? "Yes" : "No",
      String(row.anonymousGiftCount),
      row.depositDate,
      row.depositReference,
    ]),
  ];
}

export async function exportBatchReconciliationReportCsv(
  raw: Record<string, string | string[] | undefined>,
) {
  const report = await getBatchReconciliationReport({ ...raw, print: "1" });
  const csv = buildContributionCsv([...csvPreamble(report), ...csvBody(report)]);
  const filename = batchReconciliationFilename(report.filters);
  try {
    await createAuditEvent({
      organizationId: report.organization.id,
      actorUserAccountId: report.actor.id,
      action: "BATCH_RECONCILIATION_REPORT_EXPORTED",
      entityType: "BatchReconciliationReport",
      entityId: report.organization.id,
      changes: [
        { field: "startDate", oldValue: null, newValue: report.filters.startDate },
        { field: "endDate", oldValue: null, newValue: report.filters.endDate },
        {
          field: "status",
          oldValue: null,
          newValue: report.filters.status ?? "all",
        },
        { field: "rowCount", oldValue: null, newValue: String(report.allRows.length) },
      ],
    });
  } catch {
    throw new BatchReconciliationReportError(
      "The export could not be audited, so it was not released.",
    );
  }
  return { csv, filename, report };
}
