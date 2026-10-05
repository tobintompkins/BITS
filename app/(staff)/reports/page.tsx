import type { ReactNode } from "react";
import Link from "next/link";

import { ContributionReportFiltersForm } from "@/components/reports/contribution-report-filters";
import { formatMoney } from "@/lib/money/decimal";
import {
  ContributionReportError,
  getContributionReport,
} from "@/server/services/contribution-report.service";

function hrefFor(query: string, page: number) {
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  return `/reports?${params}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  let data;
  try {
    data = await getContributionReport(raw);
  } catch (error) {
    if (!(error instanceof ContributionReportError)) throw error;
    return <p role="alert">{error.message}</p>;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  query.set("view", data.filters.view);
  query.set("startDate", data.filters.startDate);
  query.set("endDate", data.filters.endDate);
  query.set("organizationId", data.organization.id);
  const queryString = query.toString();
  const pageCount =
    data.filters.view === "detail"
      ? data.detail.total
      : data.filters.view === "donor"
        ? data.donors.length
        : data.filters.view === "household"
          ? data.households.length
          : data.offeringTypes.length;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-[var(--bits-muted)]">
          {data.organization.displayName ?? data.organization.name} · Giving
        </p>
        <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">
          Contribution reports
        </h1>
      </header>
      <ContributionReportFiltersForm
        organizationId={data.organization.id}
        filters={data.filters}
        queryString={queryString}
        pickers={data.pickers}
        canViewStatements={data.canViewStatements}
        canViewBatches={data.canViewBatches}
        canViewStatementAccessReport={data.canViewStatementAccessReport}
      />
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">Totals</h2>
        <p className="mt-2 text-sm">
          {data.totals.giftCount} gifts · Gift total {formatMoney(data.totals.giftTotal)} ·
          Deductible {formatMoney(data.totals.deductibleAmount)}
          {data.totals.matchingFundAllocation
            ? ` · Matching fund allocation ${formatMoney(data.totals.matchingFundAllocation)}`
            : ""}
        </p>
        <p className="mt-2 text-xs text-[var(--bits-muted)]">
          Totals cover every matching gift, not only this page. Gift totals are
          whole gifts. Matching-fund allocation is only the selected fund.
        </p>
      </section>
      {data.filters.view === "detail" ? (
        <ReportTable
          caption={`${data.detail.total} gifts`}
          headers={[
            "Offering date",
            "Donor",
            "Payment",
            "Batch",
            "Gift total",
            "Deductible",
            ...(data.filters.offeringTypeId ? ["Matching fund"] : []),
            "Funds",
          ]}
          rows={data.detail.rows.map((row) => [
            row.offeringDate,
            row.donorLabel,
            row.paymentMethod,
            row.batchId ? (
              <Link className="underline" href={`/batches/${row.batchId}`}>
                {row.batchLabel}
              </Link>
            ) : (
              row.batchLabel
            ),
            formatMoney(row.giftTotal),
            formatMoney(row.deductibleAmount),
            ...(data.filters.offeringTypeId
              ? [formatMoney(row.matchingFundAllocation)]
              : []),
            row.categoryBreakdown || "—",
          ])}
        />
      ) : null}
      {data.filters.view === "donor" ? (
        <ReportTable
          caption="Giving by donor"
          headers={[
            "Donor group",
            "Gifts",
            "Gift total",
            "Deductible",
            ...(data.filters.offeringTypeId ? ["Matching fund"] : []),
          ]}
          rows={data.donors.map((row) => [
            row.label,
            String(row.giftCount),
            formatMoney(row.giftTotal),
            formatMoney(row.deductibleAmount),
            ...(data.filters.offeringTypeId
              ? [formatMoney(row.matchingFundAllocation)]
              : []),
          ])}
        />
      ) : null}
      {data.filters.view === "household" ? (
        <ReportTable
          caption="Giving by giving household"
          headers={[
            "Giving household",
            "Gifts",
            "Gift total",
            "Deductible",
            ...(data.filters.offeringTypeId ? ["Matching fund"] : []),
            "Review",
          ]}
          rows={data.households.map((row) => [
            row.label,
            String(row.giftCount),
            formatMoney(row.giftTotal),
            formatMoney(row.deductibleAmount),
            ...(data.filters.offeringTypeId
              ? [formatMoney(row.matchingFundAllocation)]
              : []),
            row.review ? "Needs review" : "",
          ])}
        />
      ) : null}
      {data.filters.view === "offering-type" ? (
        <ReportTable
          caption="Giving by offering type"
          headers={["Offering type", "Status", "Allocation total", "Allocations"]}
          rows={data.offeringTypes.map((row) => [
            row.name,
            row.active ? "Active" : "Inactive",
            formatMoney(row.allocationTotal),
            String(row.allocationCount),
          ])}
        />
      ) : null}
      {data.filters.view === "detail" ? (
        <nav aria-label="Report pages" className="flex gap-4">
          {data.filters.page > 1 ? (
            <Link className="underline" href={hrefFor(queryString, data.filters.page - 1)}>
              Previous
            </Link>
          ) : null}
          <span>Page {data.filters.page}</span>
          {data.filters.page * data.filters.pageSize < pageCount ? (
            <Link className="underline" href={hrefFor(queryString, data.filters.page + 1)}>
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function ReportTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-left">
        <caption className="p-3 text-left">{caption}</caption>
        <thead>
          <tr>
            {headers.map((heading) => (
              <th scope="col" className="p-3" key={heading}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t">
              {row.map((cell, cellIndex) => (
                <td className="p-3" key={cellIndex}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={headers.length} className="p-5">
                No gifts match these offering-date filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
