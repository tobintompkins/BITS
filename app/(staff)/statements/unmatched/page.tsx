import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { UnmatchedGiftMatchDialog } from "@/components/giving/unmatched-gift-match-dialog";
import { parseUnmatchedGiftQueueQuery } from "@/lib/validation/unmatched-online-gift";
import {
  UnmatchedGiftError,
  getUnmatchedOnlineGiftQueue,
} from "@/server/services/unmatched-online-gift.service";

function formatMoney(value: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

function buildHref(
  query: Record<string, string | number | undefined>,
  page: number,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === "" || value === "all") continue;
    if (key === "page" && Number(value) === 1) continue;
    params.set(key, String(value));
  }
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `/statements/unmatched?${text}` : "/statements/unmatched";
}

async function UnmatchedGiftQueue({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const parsed = parseUnmatchedGiftQueueQuery(searchParams);
  if (!parsed.success) {
    return (
      <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">
        Check the search filters and try again.
      </p>
    );
  }

  let queue;
  try {
    queue = await getUnmatchedOnlineGiftQueue(parsed.data);
  } catch (error) {
    if (error instanceof UnmatchedGiftError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    throw error;
  }

  const filterValues = {
    q: parsed.data.q,
    name: parsed.data.name,
    email: parsed.data.email,
    date: parsed.data.date,
    amount: parsed.data.amount,
    fund: parsed.data.fund,
    environment: parsed.data.environment,
    sort: parsed.data.sort,
    order: parsed.data.order,
    pageSize: parsed.data.pageSize,
  };

  return (
    <>
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" action="/statements/unmatched">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Search</span>
            <input
              name="q"
              defaultValue={parsed.data.q ?? ""}
              placeholder="Name, email, or fund"
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Donor name</span>
            <input
              name="name"
              defaultValue={parsed.data.name ?? ""}
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Donor email</span>
            <input
              name="email"
              defaultValue={parsed.data.email ?? ""}
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Gift date</span>
            <input
              type="date"
              name="date"
              defaultValue={parsed.data.date ?? ""}
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Amount</span>
            <input
              name="amount"
              defaultValue={parsed.data.amount ?? ""}
              placeholder="25.00"
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Giving fund</span>
            <input
              name="fund"
              defaultValue={parsed.data.fund ?? ""}
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Environment</span>
            <select
              name="environment"
              defaultValue={parsed.data.environment}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              <option value="all">All</option>
              <option value="test">Stripe test</option>
              <option value="live">Live</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Sort</span>
            <select
              name="sort"
              defaultValue={parsed.data.sort}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              <option value="offeringDate">Gift date</option>
              <option value="totalAmount">Amount</option>
            </select>
          </label>
          <input type="hidden" name="order" value={parsed.data.order} />
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
              Unmatched Stripe gifts
            </h2>
            <p className="mt-1 text-xs text-[var(--bits-muted)]">
              {queue.total} gift{queue.total === 1 ? "" : "s"} need review for{" "}
              {queue.organizationName}. Matching is one-way.
            </p>
          </div>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
            TEST MODE ACTIVE
          </span>
        </div>

        {queue.gifts.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Unmatched online gifts</caption>
              <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2">Date</th>
                  <th scope="col" className="px-3 py-2">Amount</th>
                  <th scope="col" className="px-3 py-2">Fund</th>
                  <th scope="col" className="px-3 py-2">Environment</th>
                  <th scope="col" className="px-3 py-2">Stripe reference</th>
                  <th scope="col" className="px-3 py-2">Stripe donor</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Review</th>
                </tr>
              </thead>
              <tbody>
                {queue.gifts.map((gift) => (
                  <tr key={gift.id} className="border-b border-[var(--bits-border)] last:border-0">
                    <td className="px-3 py-3">{formatDate(gift.offeringDate)}</td>
                    <td className="px-3 py-3 font-semibold">
                      {formatMoney(gift.totalAmount)}
                    </td>
                    <td className="px-3 py-3">{gift.fund}</td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          gift.isTest
                            ? "rounded-full bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800"
                            : "rounded-full bg-zinc-100 px-2 py-1 text-xs font-bold text-zinc-800"
                        }
                      >
                        {gift.environmentLabel}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {gift.stripeSessionRef}
                    </td>
                    <td className="px-3 py-3">
                      <span className="block font-medium">
                        {gift.suppliedDonorName ?? "Name not provided"}
                      </span>
                      <span className="text-xs text-[var(--bits-muted)]">
                        {gift.suppliedDonorEmail ?? "Email not provided"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-amber-800">{gift.matchStatus}</td>
                    <td className="px-3 py-3">
                      {queue.canMatch ? (
                        <UnmatchedGiftMatchDialog
                          gift={{
                            id: gift.id,
                            offeringDateLabel: formatDate(gift.offeringDate),
                            totalAmountLabel: formatMoney(gift.totalAmount),
                            fund: gift.fund,
                            environmentLabel: gift.environmentLabel,
                            isTest: gift.isTest,
                          }}
                        />
                      ) : (
                        <span className="text-xs text-[var(--bits-muted)]">
                          View only
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            There are no unmatched Stripe gifts for the current filters.
          </p>
        )}

        {queue.pageCount > 1 ? (
          <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Unmatched gifts pages">
            <p className="text-[var(--bits-muted)]">
              Page {queue.page} of {queue.pageCount}
            </p>
            <div className="flex gap-2">
              {queue.page > 1 ? (
                <Link
                  href={buildHref(filterValues, queue.page - 1)}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Previous
                </Link>
              ) : null}
              {queue.page < queue.pageCount ? (
                <Link
                  href={buildHref(filterValues, queue.page + 1)}
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

export default async function UnmatchedOnlineGiftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Giving
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            Unmatched Online Gifts
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            Review Stripe gifts recorded without a donor and connect each one to
            an existing church donor. Exact email suggestions still require
            confirmation. Stripe remains in test mode.
          </p>
        </div>
        <Link
          href="/statements"
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Back to Statements &amp; Online Giving
        </Link>
      </header>

      <Suspense
        fallback={
          <p className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 text-sm text-[var(--bits-muted)]">
            Loading unmatched gifts…
          </p>
        }
      >
        <UnmatchedGiftQueue searchParams={params} />
      </Suspense>
    </div>
  );
}
