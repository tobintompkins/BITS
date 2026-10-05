import Link from "next/link";

import { StatementAccessFiltersForm } from "@/components/reports/statement-access-filters";
import {
  StatementAccessReportError,
  getStatementAccessReport,
} from "@/server/services/statement-access-report.service";

function hrefFor(query: string, page: number) {
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  return `/reports/statement-access?${params}`;
}

export default async function StatementAccessReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  let data;
  try {
    data = await getStatementAccessReport(raw);
  } catch (error) {
    if (!(error instanceof StatementAccessReportError)) throw error;
    return <p role="alert">{error.message}</p>;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  query.set("startDate", data.filters.startDate);
  query.set("endDate", data.filters.endDate);
  query.set("organizationId", data.organization.id);
  const queryString = query.toString();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-[var(--bits-muted)]">
          {data.organization.displayName ?? data.organization.name} · Giving
        </p>
        <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">
          Statement access report
        </h1>
      </header>
      <StatementAccessFiltersForm
        organizationId={data.organization.id}
        filters={data.filters}
        queryString={queryString}
        pickers={data.pickers}
      />
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">Totals</h2>
        <p className="mt-2 text-sm">
          {data.totals.eventCount} stored access events. Repeated downloads are
          kept as separate rows. Times are shown in {data.filters.timeZone}.
        </p>
      </section>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left">
          <caption className="p-3 text-left">
            {data.totals.eventCount} matching access events
          </caption>
          <thead>
            <tr>
              {[
                "Event time",
                "Statement",
                "Type",
                "Status",
                "Recipient",
                "Action",
                "Actor",
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
                <td className="p-3">
                  <span className="block">{row.occurredAtLocal}</span>
                  <span className="block text-xs text-[var(--bits-muted)]">
                    {row.occurredAtUtc}
                  </span>
                </td>
                <td className="p-3">{row.statementIdentifier}</td>
                <td className="p-3">{row.statementTypeLabel}</td>
                <td className="p-3">{row.statementStatusLabel}</td>
                <td className="p-3">{row.recipientLabel}</td>
                <td className="p-3">{row.actionLabel}</td>
                <td className="p-3">{row.actorLabel}</td>
              </tr>
            ))}
            {!data.rows.length ? (
              <tr>
                <td colSpan={7} className="p-5">
                  No stored access events match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <nav aria-label="Report pages" className="flex gap-4">
        {data.filters.page > 1 ? (
          <Link className="underline" href={hrefFor(queryString, data.filters.page - 1)}>
            Previous
          </Link>
        ) : null}
        <span>Page {data.filters.page}</span>
        {data.filters.page * data.filters.pageSize < data.totals.eventCount ? (
          <Link className="underline" href={hrefFor(queryString, data.filters.page + 1)}>
            Next
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
