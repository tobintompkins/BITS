import Link from "next/link";

import {
  CONTRIBUTION_REPORT_COPY,
  CONTRIBUTION_REPORT_FUND_FILTER_COPY,
  CONTRIBUTION_REPORT_PAGE_SIZES,
  CONTRIBUTION_REPORT_PAYMENT_LABELS,
  CONTRIBUTION_REPORT_PAYMENT_METHODS,
  CONTRIBUTION_REPORT_TEST_COPY,
  CONTRIBUTION_REPORT_VIEWS,
  type ContributionReportFilters,
} from "@/lib/validation/contribution-report";

const fieldClass =
  "mt-1 block w-full rounded-lg border bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

const viewLabels: Record<(typeof CONTRIBUTION_REPORT_VIEWS)[number], string> = {
  detail: "Contribution detail",
  donor: "Giving by donor",
  household: "Giving by household",
  "offering-type": "Giving by offering type",
};

export function ContributionReportFiltersForm({
  organizationId,
  filters,
  queryString,
  pickers,
  canViewStatements,
  canViewBatches,
  canViewStatementAccessReport,
}: {
  organizationId: string;
  filters: ContributionReportFilters;
  queryString: string;
  pickers: {
    donors: Array<{ id: string; firstName: string; lastName: string; active: boolean }>;
    households: Array<{ id: string; displayName: string; active: boolean }>;
    offeringTypes: Array<{ id: string; name: string; active: boolean }>;
    batches: Array<{ id: string; name: string; status: string }>;
  };
  canViewStatements: boolean;
  canViewBatches: boolean;
  canViewStatementAccessReport: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-[var(--bits-muted)]">
        {CONTRIBUTION_REPORT_COPY} {CONTRIBUTION_REPORT_FUND_FILTER_COPY}{" "}
        {CONTRIBUTION_REPORT_TEST_COPY}
      </p>
      <nav aria-label="Report views" className="flex flex-wrap gap-3">
        {CONTRIBUTION_REPORT_VIEWS.map((view) => {
          const params = new URLSearchParams(queryString);
          params.set("view", view);
          params.delete("page");
          return (
            <Link
              key={view}
              href={`/reports?${params}`}
              className={`underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)] ${
                filters.view === view ? "font-semibold text-[var(--bits-navy)]" : ""
              }`}
            >
              {viewLabels[view]}
            </Link>
          );
        })}
      </nav>
      <form method="get" className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="view" value={filters.view} />
        <input type="hidden" name="organizationId" value={organizationId} />
        <label className="text-sm font-medium">
          Offering start date
          <input
            type="date"
            name="startDate"
            required
            defaultValue={filters.startDate}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Offering end date
          <input
            type="date"
            name="endDate"
            required
            defaultValue={filters.endDate}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Payment method
          <select
            name="paymentMethod"
            defaultValue={filters.paymentMethod ?? ""}
            className={fieldClass}
          >
            <option value="">All methods</option>
            {CONTRIBUTION_REPORT_PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {CONTRIBUTION_REPORT_PAYMENT_LABELS[method]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search donors
          <input
            name="donorQ"
            defaultValue={filters.donorQuery}
            maxLength={100}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Donor
          <select name="donorId" defaultValue={filters.donorId ?? ""} className={fieldClass}>
            <option value="">All donors</option>
            {pickers.donors.map((donor) => (
              <option key={donor.id} value={donor.id}>
                {donor.lastName}, {donor.firstName}
                {donor.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search giving households
          <input
            name="householdQ"
            defaultValue={filters.householdQuery}
            maxLength={100}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Giving household
          <select
            name="householdId"
            defaultValue={filters.householdId ?? ""}
            className={fieldClass}
          >
            <option value="">All households</option>
            {pickers.households.map((household) => (
              <option key={household.id} value={household.id}>
                {household.displayName}
                {household.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search funds
          <input
            name="offeringTypeQ"
            defaultValue={filters.offeringTypeQuery}
            maxLength={100}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Offering type
          <select
            name="offeringTypeId"
            defaultValue={filters.offeringTypeId ?? ""}
            className={fieldClass}
          >
            <option value="">All funds</option>
            {pickers.offeringTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
                {type.active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search batches
          <input
            name="batchQ"
            defaultValue={filters.batchQuery}
            maxLength={100}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Batch
          <select name="batchId" defaultValue={filters.batchId ?? ""} className={fieldClass}>
            <option value="">All batches</option>
            {pickers.batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Rows per page
          <select
            name="pageSize"
            defaultValue={String(filters.pageSize)}
            className={fieldClass}
          >
            {CONTRIBUTION_REPORT_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          <input
            type="checkbox"
            name="includeTest"
            value="1"
            defaultChecked={filters.includeTest}
            className="mr-2"
          />
          Test gifts only
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <button className="rounded bg-[var(--bits-navy)] px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]">
            Apply filters
          </button>
          <Link
            href={`/reports?view=${filters.view}`}
            className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Reset
          </Link>
        </div>
      </form>
      <p className="text-sm">
        Offering dates {filters.startDate} through {filters.endDate}
        {filters.includeTest ? " · TEST GIFTS ONLY" : " · Real gifts only"}
        {filters.offeringTypeId ? " · Fund filter applied" : ""}
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <a
          href={`/api/staff/reports/contributions/csv?${queryString}`}
          className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Download CSV
        </a>
        {canViewBatches ? (
          <Link className="underline" href="/reports/batch-reconciliation">
            Batch reconciliation
          </Link>
        ) : null}
        {canViewBatches ? (
          <Link className="underline" href="/batches">
            Batches
          </Link>
        ) : null}
        {canViewStatements ? (
          <Link className="underline" href="/statements/registry">
            Statement registry
          </Link>
        ) : null}
        {canViewStatementAccessReport ? (
          <Link className="underline" href="/reports/statement-access">
            Statement access
          </Link>
        ) : null}
      </div>
    </div>
  );
}
