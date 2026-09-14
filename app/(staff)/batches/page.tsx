import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import {
  batchStatusClassName,
  batchStatusLabel,
  formatBatchDate,
  formatBatchMoney,
} from "@/lib/batches/display";
import { parseOfferingBatchDirectoryQuery } from "@/lib/validation/offering-batch";
import {
  OfferingBatchError,
  getOfferingBatchDirectory,
} from "@/server/services/offering-batch.service";

function DirectoryHeader({ canManage }: { canManage: boolean }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Offering Batches
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Create draft offering batches, record deposits on reconciled batches,
          and review locked batches.
        </p>
      </div>
      {canManage ? (
        <Link
          href="/batches/new"
          className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Add Batch
        </Link>
      ) : null}
    </header>
  );
}

function buildHref(
  query: Record<string, string | number | undefined>,
  page: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || value === "all") continue;
    if (key === "page" && Number(value) === 1) continue;
    if (key === "pageSize" && Number(value) === 20) continue;
    if (key === "sort" && value === "offeringDate") continue;
    if (key === "order" && value === "desc") continue;
    params.set(key, String(value));
  }
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `/batches?${text}` : "/batches";
}

async function OfferingBatchDirectory({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const parsed = parseOfferingBatchDirectoryQuery(searchParams);
  if (!parsed.success) {
    return (
      <>
        <DirectoryHeader canManage={false} />
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800"
        >
          Check the search filters and try again.
        </p>
      </>
    );
  }

  let directory;
  try {
    directory = await getOfferingBatchDirectory(parsed.data);
  } catch (error) {
    if (error instanceof OfferingBatchError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    if (error instanceof OfferingBatchError && error.code === "SIGNED_OUT") {
      redirect("/sign-in");
    }
    return (
      <>
        <DirectoryHeader canManage={false} />
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800"
        >
          Offering batches could not be loaded. Try again.
        </p>
      </>
    );
  }

  const filterValues = {
    q: parsed.data.q,
    status: parsed.data.status,
    dateFrom: parsed.data.dateFrom,
    dateTo: parsed.data.dateTo,
    sort: parsed.data.sort,
    order: parsed.data.order,
    pageSize: parsed.data.pageSize,
  };

  return (
    <>
      <DirectoryHeader canManage={directory.canManage} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Draft batches", String(directory.summary.draft)],
          ["Entered batches", String(directory.summary.entered)],
          ["Reconciled batches", String(directory.summary.reconciled)],
          ["Locked batches", String(directory.summary.locked)],
          [
            "Total recorded this month",
            formatBatchMoney(directory.summary.recordedThisMonth),
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-[var(--bits-muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
              {value}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-6" action="/batches">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Search</span>
            <input
              name="q"
              defaultValue={parsed.data.q ?? ""}
              placeholder="Batch name or service"
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Status</span>
            <select
              name="status"
              defaultValue={parsed.data.status}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              <option value="all">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ENTERED">Entered</option>
              <option value="RECONCILED">Reconciled</option>
              <option value="LOCKED">Locked</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">
              Offering date from
            </span>
            <input
              type="date"
              name="dateFrom"
              defaultValue={parsed.data.dateFrom ?? ""}
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">
              Offering date to
            </span>
            <input
              type="date"
              name="dateTo"
              defaultValue={parsed.data.dateTo ?? ""}
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Sort</span>
            <select
              name="sort"
              defaultValue={parsed.data.sort}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              <option value="offeringDate">Offering date</option>
              <option value="createdAt">Created date</option>
              <option value="name">Name</option>
              <option value="expectedTotal">Expected total</option>
              <option value="recordedTotal">Recorded total</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Order</span>
            <select
              name="order"
              defaultValue={parsed.data.order}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Apply filters
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
              Batch directory
            </h2>
            <p className="mt-1 text-xs text-[var(--bits-muted)]">
              {directory.total} batch{directory.total === 1 ? "" : "es"} for{" "}
              {directory.organizationName}.
            </p>
          </div>
        </div>

        {directory.batches.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Offering batches</caption>
              <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2">Batch name</th>
                  <th scope="col" className="px-3 py-2">Offering date</th>
                  <th scope="col" className="px-3 py-2">Service description</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Expected total</th>
                  <th scope="col" className="px-3 py-2">Recorded total</th>
                  <th scope="col" className="px-3 py-2">Difference</th>
                  <th scope="col" className="px-3 py-2">Deposit date</th>
                  <th scope="col" className="px-3 py-2">Deposit reference</th>
                  <th scope="col" className="px-3 py-2">Created date</th>
                  <th scope="col" className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {directory.batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="border-b border-[var(--bits-border)] last:border-0"
                  >
                    <td className="px-3 py-3 font-medium text-[var(--bits-navy)]">
                      {batch.name}
                    </td>
                    <td className="px-3 py-3">{formatBatchDate(batch.offeringDate)}</td>
                    <td className="px-3 py-3">
                      {batch.serviceDescription ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${batchStatusClassName(batch.status)}`}
                      >
                        {batchStatusLabel(batch.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {formatBatchMoney(batch.expectedTotal)}
                    </td>
                    <td className="px-3 py-3">
                      {formatBatchMoney(batch.recordedTotal)}
                    </td>
                    <td className="px-3 py-3">
                      {formatBatchMoney(batch.difference)}
                    </td>
                    <td className="px-3 py-3">{formatBatchDate(batch.depositDate)}</td>
                    <td className="px-3 py-3">{batch.depositReference ?? "—"}</td>
                    <td className="px-3 py-3">{formatBatchDate(batch.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/batches/${batch.id}`}
                          className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                        >
                          View
                        </Link>
                        {batch.canEdit ? (
                          <Link
                            href={`/batches/${batch.id}/edit`}
                            className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                          >
                            Edit
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No offering batches match the current filters.
          </p>
        )}

        {directory.pageCount > 1 ? (
          <nav
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
            aria-label="Offering batch pages"
          >
            <p className="text-[var(--bits-muted)]">
              Page {directory.page} of {directory.pageCount}
            </p>
            <div className="flex gap-2">
              {directory.page > 1 ? (
                <Link
                  href={buildHref(filterValues, directory.page - 1)}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Previous
                </Link>
              ) : null}
              {directory.page < directory.pageCount ? (
                <Link
                  href={buildHref(filterValues, directory.page + 1)}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>
    </>
  );
}

export default async function OfferingBatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <Suspense
        fallback={
          <div className="space-y-6">
            <header>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
                Giving
              </p>
              <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
                Offering Batches
              </h1>
            </header>
            <p className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 text-sm text-[var(--bits-muted)]">
              Loading offering batches…
            </p>
          </div>
        }
      >
        <OfferingBatchDirectory searchParams={params} />
      </Suspense>
    </div>
  );
}
