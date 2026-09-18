import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatMoney } from "@/lib/money/decimal";
import {
  statementRegistryHref,
  statementRegistrySearchParams,
} from "@/lib/validation/statement-registry";
import { statementYearBounds } from "@/lib/validation/statement-readiness";
import {
  StatementRegistryError,
  getStatementRegistry,
} from "@/server/services/statement-registry.service";

function buildHref(
  query: { year: number; q: string; type: string; status: string },
  page: number,
) {
  return statementRegistryHref({ ...query, page });
}

function timelineHref(
  statementId: string,
  query: { year: number; q: string; type: string; status: string; page: number },
) {
  const text = statementRegistrySearchParams(query).toString();
  return text
    ? `/statements/registry/${statementId}?${text}`
    : `/statements/registry/${statementId}`;
}

function reviewHref(row: {
  statementType: string;
  recipientId: string;
  taxYear: number | null;
  periodStart: Date;
}) {
  const year = row.taxYear ?? row.periodStart.getUTCFullYear();
  const path =
    row.statementType === "HOUSEHOLD"
      ? `/statements/households/${row.recipientId}`
      : `/statements/recipients/${row.recipientId}`;
  return `${path}?year=${year}`;
}

function formatUtcDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

function typeLabel(type: string) {
  return type === "HOUSEHOLD" ? "Household" : "Individual";
}

function statusLabel(status: string) {
  switch (status) {
    case "GENERATED":
      return "Generated";
    case "PUBLISHED":
      return "Published";
    case "VOIDED":
      return "VOIDED";
    default:
      return status;
  }
}

function statusClassName(status: string) {
  switch (status) {
    case "VOIDED":
      return "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-rose-900";
    case "PUBLISHED":
      return "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800";
    case "GENERATED":
      return "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900";
    default:
      return "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold";
  }
}

export default async function StatementRegistryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let registry;
  try {
    registry = await getStatementRegistry(query);
  } catch (error) {
    if (error instanceof StatementRegistryError && error.code === "SIGNED_OUT") {
      redirect("/sign-in");
    }
    if (error instanceof StatementRegistryError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    if (error instanceof StatementRegistryError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const { min, max } = statementYearBounds();
  const years = [];
  for (let year = max; year >= min; year -= 1) {
    years.push(year);
  }
  const filters = {
    year: registry.year,
    q: registry.q,
    type: registry.type,
    status: registry.status,
  };

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/statements"
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          ← Back to Statements
        </Link>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Statement Registry
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Review {registry.year} contribution statement records for{" "}
          {registry.organizationName}. This page is read-only. It does not
          create, publish, void, or email statements.
        </p>
        {registry.canManageStatements ? (
          <p className="mt-3">
            <Link
              href="/statements/void-requests"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Statement Void Requests
            </Link>
          </p>
        ) : null}
      </header>

      <form
        action="/statements/registry"
        className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Tax year</span>
            <select
              name="year"
              defaultValue={String(registry.year)}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Type</span>
            <select
              name="type"
              defaultValue={registry.type}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              <option value="all">All types</option>
              <option value="individual">Individual</option>
              <option value="household">Household</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Status</span>
            <select
              name="status"
              defaultValue={registry.status}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              <option value="all">All statuses</option>
              <option value="generated">Generated</option>
              <option value="published">Published</option>
              <option value="voided">Voided</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">
              Search name or identifier
            </span>
            <input
              name="q"
              defaultValue={registry.q}
              maxLength={100}
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
        </div>
        <button
          type="submit"
          className="mt-4 rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Apply filters
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">Generated</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {registry.counts.generated}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-emerald-600 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">Published</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {registry.counts.published}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-zinc-400 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">Voided</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {registry.counts.voided}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Statement records
        </h2>
        {registry.statements.length ? (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {registry.statements.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <p className="font-semibold text-[var(--bits-navy)]">
                    {row.statementIdentifier}
                  </p>
                  <p className="mt-1 text-sm">{row.recipientLabel}</p>
                  <p className="mt-2 text-sm text-[var(--bits-muted)]">
                    {typeLabel(row.statementType)} ·{" "}
                    <span className={statusClassName(row.status)}>
                      {statusLabel(row.status)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm">
                    {formatUtcDate(row.periodStart)}–{formatUtcDate(row.periodEnd)}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatMoney(row.deductibleTotal)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    Generated {formatUtcDate(row.generatedAt)} by{" "}
                    {row.generatedByLabel}
                  </p>
                  {registry.canManageStatements && row.status === "GENERATED" ? (
                    <p className="mt-2">
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
                        Review required
                      </span>
                    </p>
                  ) : null}
                  <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    <Link
                      href={reviewHref(row)}
                      className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                    >
                      Open review
                    </Link>
                    <Link
                      href={timelineHref(row.id, {
                        ...filters,
                        page: registry.page,
                      })}
                      className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                    >
                      View timeline
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Contribution statement registry for {registry.year}
                </caption>
                <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Identifier
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Recipient
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Period
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Total
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Generated
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Review
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {registry.statements.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--bits-border)] last:border-0"
                    >
                      <td className="px-3 py-3 font-medium text-[var(--bits-navy)]">
                        {row.statementIdentifier}
                      </td>
                      <td className="px-3 py-3">{row.recipientLabel}</td>
                      <td className="px-3 py-3">{typeLabel(row.statementType)}</td>
                      <td className="px-3 py-3">
                        {formatUtcDate(row.periodStart)}–
                        {formatUtcDate(row.periodEnd)}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {formatMoney(row.deductibleTotal)}
                      </td>
                      <td className="px-3 py-3">
                        <span className={statusClassName(row.status)}>
                          {statusLabel(row.status)}
                        </span>
                        {registry.canManageStatements &&
                        row.status === "GENERATED" ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
                            Review required
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <span className="block">{formatUtcDate(row.generatedAt)}</span>
                        <span className="text-xs text-[var(--bits-muted)]">
                          {row.generatedByLabel}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <Link
                            href={reviewHref(row)}
                            className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                          >
                            Open review
                          </Link>
                          <Link
                            href={timelineHref(row.id, {
                              ...filters,
                              page: registry.page,
                            })}
                            className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                          >
                            View timeline
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No statement records match the selected year and filters.
          </p>
        )}

        {registry.pageCount > 1 ? (
          <nav
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
            aria-label="Registry pages"
          >
            <p className="text-[var(--bits-muted)]">
              Page {registry.page} of {registry.pageCount}
            </p>
            <div className="flex gap-2">
              {registry.page > 1 ? (
                <Link
                  href={buildHref(filters, registry.page - 1)}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Previous
                </Link>
              ) : null}
              {registry.page < registry.pageCount ? (
                <Link
                  href={buildHref(filters, registry.page + 1)}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>

      <p
        role="note"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
      >
        Publishing and voiding happen only through dedicated safeguarded
        workflows. This registry does not change statement records.
      </p>
    </div>
  );
}
