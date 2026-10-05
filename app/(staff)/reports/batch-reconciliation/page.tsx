import type { ReactNode } from "react";
import Link from "next/link";

import { BatchReconciliationFiltersForm } from "@/components/reports/batch-reconciliation-filters";
import {
  PrintOnLoad,
  PrintReportButton,
} from "@/components/reports/print-report-controls";
import { formatMoney } from "@/lib/money/decimal";
import {
  BatchReconciliationReportError,
  getBatchReconciliationReport,
} from "@/server/services/batch-reconciliation-report.service";

function hrefFor(query: string, page: number) {
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  params.delete("print");
  return `/reports/batch-reconciliation?${params}`;
}

export default async function BatchReconciliationReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  let data;
  try {
    data = await getBatchReconciliationReport(raw);
  } catch (error) {
    if (!(error instanceof BatchReconciliationReportError)) throw error;
    return <p role="alert">{error.message}</p>;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value && key !== "print") query.set(key, value);
  }
  query.set("startDate", data.filters.startDate);
  query.set("endDate", data.filters.endDate);
  query.set("organizationId", data.organization.id);
  const queryString = query.toString();
  const churchName =
    data.organization.displayName?.trim() || data.organization.name;

  return (
    <div className="batch-reconciliation-print space-y-6">
      <PrintOnLoad enabled={data.filters.print} />
      <header>
        <p className="text-sm text-[var(--bits-muted)]">
          {churchName} · Giving
        </p>
        <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">
          Batch reconciliation report
        </h1>
        <p className="print-only mt-2 hidden text-sm">
          Operational report generated {data.generatedAt.toISOString()} for{" "}
          {churchName}. Offering dates {data.filters.startDate} through{" "}
          {data.filters.endDate}. Variance is calculated gift total minus
          expected. Unset expected totals stay blank.
        </p>
      </header>
      <BatchReconciliationFiltersForm
        organizationId={data.organization.id}
        filters={data.filters}
        queryString={queryString}
        pickers={data.pickers}
      />
      <div className="report-controls text-sm">
        <PrintReportButton />
      </div>
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">Totals</h2>
        <p className="mt-2 text-sm">
          {data.totals.batchCount} batches · {data.totals.giftCount} gifts ·
          Calculated {formatMoney(data.totals.calculatedGiftTotal)} · Stored
          recorded {formatMoney(data.totals.recordedTotal)} · Allocations{" "}
          {formatMoney(data.totals.allocationTotal)}
          {data.totals.comparableVarianceTotal
            ? ` · Comparable variance ${formatMoney(data.totals.comparableVarianceTotal)}`
            : ""}
          {data.totals.mixedBatchCount
            ? ` · ${data.totals.mixedBatchCount} mixed real/test batches excluded from aggregate variance`
            : ""}
        </p>
        <p className="mt-2 text-xs text-[var(--bits-muted)]">
          Totals cover every matching batch, not only this page. Empty batches
          stay in the list. This is not a bank-reconciliation claim.
        </p>
      </section>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left">
          <caption className="p-3 text-left">
            {data.filters.print
              ? `${data.allRows.length} matching batches`
              : `${data.totals.batchCount} matching batches`}
          </caption>
          <thead>
            <tr>
              {[
                "Batch",
                "Offering date",
                "Status",
                "Expected",
                "Stored recorded",
                "Calculated gifts",
                "Allocations",
                "Variance",
                "Recorded minus calculated",
                "Gifts",
                "Real / test",
                "Deposit",
              ].map((heading) => (
                <th scope="col" className="p-3" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t">
                <Cell>
                  <Link className="underline" href={`/batches/${row.id}`}>
                    {row.name}
                  </Link>
                  {row.reference ? (
                    <span className="block text-xs text-[var(--bits-muted)]">
                      {row.reference}
                    </span>
                  ) : null}
                </Cell>
                <Cell>{row.offeringDateLabel}</Cell>
                <Cell>{row.statusLabel}</Cell>
                <Cell>{row.expectedTotal ? formatMoney(row.expectedTotal) : ""}</Cell>
                <Cell>{formatMoney(row.recordedTotal)}</Cell>
                <Cell>{formatMoney(row.calculatedGiftTotal)}</Cell>
                <Cell>{formatMoney(row.allocationTotal)}</Cell>
                <Cell>{row.variance ? formatMoney(row.variance) : ""}</Cell>
                <Cell>{formatMoney(row.recordedMinusCalculated)}</Cell>
                <Cell>{row.giftCount}</Cell>
                <Cell>
                  {row.realGiftCount}/{row.testGiftCount}
                  {row.mixed ? " · Mixed" : ""}
                </Cell>
                <Cell>
                  {row.depositDateLabel}
                  {row.depositReference ? ` · ${row.depositReference}` : ""}
                </Cell>
              </tr>
            ))}
            {!data.rows.length ? (
              <tr>
                <td colSpan={12} className="p-5">
                  No batches match these offering-date filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!data.filters.print ? (
        <nav aria-label="Report pages" className="report-controls flex gap-4">
          {data.filters.page > 1 ? (
            <Link className="underline" href={hrefFor(queryString, data.filters.page - 1)}>
              Previous
            </Link>
          ) : null}
          <span>Page {data.filters.page}</span>
          {data.filters.page * data.filters.pageSize < data.totals.batchCount ? (
            <Link className="underline" href={hrefFor(queryString, data.filters.page + 1)}>
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <td className="p-3">{children}</td>;
}
