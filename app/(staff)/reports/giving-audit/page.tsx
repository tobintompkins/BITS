import Link from "next/link";
import { redirect } from "next/navigation";

import {
  GIVING_AUDIT_FROM_LABEL,
  GIVING_AUDIT_THROUGH_LABEL,
  GIVING_AUDIT_TIMESTAMP_HEADING,
  GivingAuditUtcHelp,
} from "@/components/reports/giving-audit-utc";
import { getGivingAuditHistory } from "@/server/services/giving-audit-history.service";
import {
  GIVING_AUDIT_PAGE_SIZE,
  givingAuditActionOptions,
  givingAuditEntityOptions,
  type GivingAuditFilter,
} from "@/lib/validation/giving-audit-history";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

function pageHref(filter: GivingAuditFilter, cursor: string | null) {
  const params = new URLSearchParams();
  if (filter.entityType) params.set("entity", filter.entityType);
  if (filter.action) params.set("action", filter.action);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/reports/giving-audit?${query}` : "/reports/giving-audit";
}

export default async function GivingAuditHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    entity?: string | string[];
    action?: string | string[];
    from?: string | string[];
    to?: string | string[];
    cursor?: string | string[];
    category?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const history = await getGivingAuditHistory(query);
  if (history.status === "SIGNED_OUT") redirect("/sign-in");
  if (history.status === "NO_ORGANIZATION") redirect("/dashboard");
  if (history.status === "UNAUTHORIZED") redirect("/dashboard");

  const ready = history.status === "READY" ? history : null;
  const filter = ready?.filter;
  const rows = ready?.rows ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Reports
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Giving Audit
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Review recorded giving changes for this church. Each page lists{" "}
          {GIVING_AUDIT_PAGE_SIZE} actions. Older history stays available.
        </p>
      </header>

      <aside
        role="note"
        className="rounded-2xl border border-[var(--bits-gold)] bg-white p-4 shadow-sm"
      >
        <p className="text-sm leading-6 text-[var(--bits-navy)]">
          This page shows what changed, not private values. Statement view
          and download details stay on the statement access report. Statement
          files stay in the registry.
        </p>
      </aside>

      {history.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid giving audit filter.
        </p>
      ) : null}

      <form method="get" className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm md:grid-cols-2">
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Record type
          <select name="entity" defaultValue={filter?.entityType ?? ""} className={fieldClass}>
            <option value="">All giving records</option>
            {givingAuditEntityOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Action
          <select name="action" defaultValue={filter?.action ?? ""} className={fieldClass}>
            <option value="">All giving actions</option>
            {givingAuditActionOptions().map((option) => (
              <option key={`${option.value}-${option.label}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          {GIVING_AUDIT_FROM_LABEL}
          <input
            type="date"
            name="from"
            defaultValue={filter?.from ?? ""}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          {GIVING_AUDIT_THROUGH_LABEL}
          <input
            type="date"
            name="to"
            defaultValue={filter?.to ?? ""}
            className={fieldClass}
          />
        </label>
        <GivingAuditUtcHelp />
        <div className="md:col-span-2">
          <button
            type="submit"
            className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Apply filter
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Recorded giving actions
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            No recorded giving actions match this filter.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">
                Giving audit history for the current church
              </caption>
              <thead>
                <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                  <th scope="col" className="py-3 pr-4 font-medium">{GIVING_AUDIT_TIMESTAMP_HEADING}</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Record</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Action</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Performed By</th>
                  <th scope="col" className="py-3 font-medium">What changed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--bits-border)] align-top last:border-0">
                    <td className="py-3 pr-4 text-[var(--bits-navy)]">
                      <time dateTime={row.occurredAtIso}>{row.occurredAtLabel}</time>
                    </td>
                    <td className="py-3 pr-4 text-[var(--bits-navy)]">
                      {row.recordHref && row.recordLabel ? (
                        <Link href={row.recordHref} className={`font-semibold underline ${focusClass}`}>
                          {row.recordLabel}
                        </Link>
                      ) : (
                        row.entityLabel
                      )}
                    </td>
                    <th scope="row" className="py-3 pr-4 font-semibold text-[var(--bits-navy)]">
                      {row.actionLabel}
                    </th>
                    <td className="py-3 pr-4 text-[var(--bits-navy)]">{row.performedBy}</td>
                    <td className="py-3 text-[var(--bits-navy)]">{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ready ? (
          <nav aria-label="Giving audit pages" className="mt-4 flex flex-wrap gap-4">
            {ready.filter.cursor ? (
              <Link
                href={pageHref(ready.filter, null)}
                className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
              >
                Newest records
              </Link>
            ) : null}
            {ready.hasOlder && ready.olderCursor ? (
              <Link
                href={pageHref(ready.filter, ready.olderCursor)}
                className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
              >
                Older records
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      <nav aria-label="Related giving records" className="flex flex-wrap gap-3">
        <Link href="/statements/registry" className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}>
          Statement Registry
        </Link>
        <Link href="/reports/statement-access" className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}>
          Statement Access Report
        </Link>
        {ready?.canOpenOrganizationSettings ? (
          <Link href="/administration/security-activity" className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}>
            Security Activity
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
