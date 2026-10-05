import Link from "next/link";

import {
  STATEMENT_ACCESS_ACTIONS,
  STATEMENT_ACCESS_ACTION_LABELS,
  STATEMENT_ACCESS_COPY,
  STATEMENT_ACCESS_PAGE_SIZES,
  STATEMENT_ACCESS_PRIVACY_COPY,
  type StatementAccessFilters,
} from "@/lib/validation/statement-access-report";

const fieldClass =
  "mt-1 block w-full rounded-lg border bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function StatementAccessFiltersForm({
  organizationId,
  filters,
  queryString,
  pickers,
}: {
  organizationId: string;
  filters: StatementAccessFilters;
  queryString: string;
  pickers: {
    statements: Array<{
      id: string;
      statementIdentifier: string;
      statementType: string;
      status: string;
    }>;
    donors: Array<{ id: string; firstName: string; lastName: string; active: boolean }>;
    households: Array<{ id: string; displayName: string; active: boolean }>;
    actors: Array<{ id: string; displayName: string | null; active: boolean }>;
  };
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-[var(--bits-muted)]">
        {STATEMENT_ACCESS_COPY} {STATEMENT_ACCESS_PRIVACY_COPY}
      </p>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/reports">
          Contribution reports
        </Link>
        <Link className="underline" href="/statements/registry">
          Statement registry
        </Link>
      </nav>
      <form
        method="get"
        className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <input type="hidden" name="organizationId" value={organizationId} />
        <label className="text-sm font-medium">
          Access start date
          <input
            type="date"
            name="startDate"
            required
            defaultValue={filters.startDate}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Access end date
          <input
            type="date"
            name="endDate"
            required
            defaultValue={filters.endDate}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Action
          <select name="action" defaultValue={filters.action ?? ""} className={fieldClass}>
            <option value="">All stored actions</option>
            {STATEMENT_ACCESS_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {STATEMENT_ACCESS_ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search statements
          <input
            type="search"
            name="statementQ"
            defaultValue={filters.statementQuery}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Statement
          <select
            name="statementId"
            defaultValue={filters.statementId ?? ""}
            className={fieldClass}
          >
            <option value="">All statements</option>
            {pickers.statements.map((row) => (
              <option key={row.id} value={row.id}>
                {row.statementIdentifier}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search donors
          <input
            type="search"
            name="donorQ"
            defaultValue={filters.donorQuery}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Donor recipient
          <select name="donorId" defaultValue={filters.donorId ?? ""} className={fieldClass}>
            <option value="">Any donor</option>
            {pickers.donors.map((row) => (
              <option key={row.id} value={row.id}>
                {row.lastName}, {row.firstName}
                {row.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search giving households
          <input
            type="search"
            name="householdQ"
            defaultValue={filters.householdQuery}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Giving-household recipient
          <select
            name="householdId"
            defaultValue={filters.householdId ?? ""}
            className={fieldClass}
          >
            <option value="">Any giving household</option>
            {pickers.households.map((row) => (
              <option key={row.id} value={row.id}>
                {row.displayName}
                {row.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search actors
          <input
            type="search"
            name="actorQ"
            defaultValue={filters.actorQuery}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Actor
          <select
            name="actorUserAccountId"
            defaultValue={filters.actorUserAccountId ?? ""}
            className={fieldClass}
          >
            <option value="">Any actor</option>
            {pickers.actors.map((row) => (
              <option key={row.id} value={row.id}>
                {row.displayName?.trim() || "Staff member"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Page size
          <select
            name="pageSize"
            defaultValue={String(filters.pageSize)}
            className={fieldClass}
          >
            {STATEMENT_ACCESS_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <button className="rounded bg-[var(--bits-navy)] px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]">
            Apply filters
          </button>
          <Link href="/reports/statement-access" className="underline">
            Reset
          </Link>
        </div>
      </form>
      <p className="text-sm">
        Access dates {filters.startDate} through {filters.endDate} in{" "}
        {filters.timeZone}
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <a
          href={`/api/staff/reports/statement-access/csv?${queryString}`}
          className="underline"
        >
          Download CSV
        </a>
      </div>
    </div>
  );
}
