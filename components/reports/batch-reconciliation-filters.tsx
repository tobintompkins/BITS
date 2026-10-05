import Link from "next/link";

import { batchStatusLabel } from "@/lib/batches/display";
import {
  BATCH_RECONCILIATION_COPY,
  BATCH_RECONCILIATION_PAGE_SIZES,
  BATCH_RECONCILIATION_STATUSES,
  BATCH_RECONCILIATION_VARIANCE_COPY,
  type BatchReconciliationFilters,
} from "@/lib/validation/batch-reconciliation-report";

const fieldClass =
  "mt-1 block w-full rounded-lg border bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function BatchReconciliationFiltersForm({
  organizationId,
  filters,
  queryString,
  pickers,
}: {
  organizationId: string;
  filters: BatchReconciliationFilters;
  queryString: string;
  pickers: Array<{
    id: string;
    name: string;
    status: string;
    offeringDate: Date;
  }>;
}) {
  return (
    <div className="report-controls space-y-4">
      <p className="text-sm leading-6 text-[var(--bits-muted)]">
        {BATCH_RECONCILIATION_COPY} {BATCH_RECONCILIATION_VARIANCE_COPY}
      </p>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/reports">
          Contribution reports
        </Link>
        <Link className="underline" href="/batches">
          Batches
        </Link>
      </nav>
      <form
        method="get"
        className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
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
          Batch status
          <select name="status" defaultValue={filters.status ?? ""} className={fieldClass}>
            <option value="">All statuses</option>
            {BATCH_RECONCILIATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {batchStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search batches
          <input
            type="search"
            name="batchQ"
            defaultValue={filters.batchQuery}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium">
          Batch
          <select name="batchId" defaultValue={filters.batchId ?? ""} className={fieldClass}>
            <option value="">All matching batches</option>
            {pickers.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name} · {batchStatusLabel(batch.status)}
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
            {BATCH_RECONCILIATION_PAGE_SIZES.map((size) => (
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
          <Link href="/reports/batch-reconciliation" className="underline">
            Reset
          </Link>
        </div>
      </form>
      <p className="text-sm">
        Batch offering dates {filters.startDate} through {filters.endDate}
        {filters.status ? ` · ${batchStatusLabel(filters.status)}` : ""}
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <a
          href={`/api/staff/reports/batches/csv?${queryString}`}
          className="underline"
        >
          Download CSV
        </a>
        <Link
          href={`/reports/batch-reconciliation?${queryString}${queryString ? "&" : ""}print=1`}
          className="underline"
        >
          Print all matching rows
        </Link>
      </div>
    </div>
  );
}
