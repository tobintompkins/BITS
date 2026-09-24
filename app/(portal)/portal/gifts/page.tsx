import Link from "next/link";
import { redirect } from "next/navigation";

import { formatMoney } from "@/lib/money/decimal";
import { memberGivingHistoryHref } from "@/lib/validation/member-giving-history";
import { memberGiftReceiptHref } from "@/lib/validation/member-gift-receipt";
import { getMemberGivingHistory } from "@/server/services/member-giving-history.service";

function formatUtcDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export default async function MemberGivingHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const portal = await getMemberGivingHistory(query);
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  if (portal.status === "CONNECTION_PENDING") {
    return (
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
          My Giving History
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your donor
          record before personal giving information can appear.
        </p>
      </section>
    );
  }

  const filters = { year: portal.year, fund: portal.fund, page: portal.page };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            My Giving History
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            Only gifts connected to your signed-in account are shown. Official
            contribution statements are in My Statements.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
          <Link
            href="/portal"
            className="text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Member Portal Home
          </Link>
          <Link
            href="/portal/statements"
            className="text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            My Statements
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <form
          className="flex flex-wrap items-end gap-3"
          action="/portal/gifts"
        >
          <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
            Year
            <select
              name="year"
              defaultValue={portal.year}
              className="min-w-36 rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2"
            >
              {portal.availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
            Fund
            <select
              name="fund"
              defaultValue={portal.fund}
              className="min-w-44 rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2"
            >
              <option value="all">All funds</option>
              {portal.funds.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fund.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Apply filters
          </button>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
          <p className="text-sm text-[var(--bits-muted)]">Official giving</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {formatMoney(portal.official.totalAmount)}
          </p>
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            {portal.official.giftCount} official{" "}
            {portal.official.giftCount === 1 ? "gift" : "gifts"} in {portal.year}
          </p>
        </div>
        {portal.test ? (
          <div className="rounded-2xl border border-sky-200 border-t-4 border-t-sky-500 bg-sky-50 p-5 shadow-sm">
            <p className="text-sm font-semibold text-sky-900">
              Stripe test / sandbox gifts
            </p>
            <p className="mt-2 text-2xl font-semibold text-sky-950">
              {formatMoney(portal.test.totalAmount)}
            </p>
            <p className="mt-1 text-sm text-sky-900">
              {portal.test.giftCount} test{" "}
              {portal.test.giftCount === 1 ? "gift" : "gifts"} — not official
              giving
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
            <p className="text-sm text-[var(--bits-muted)]">Selected year</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
              {portal.year}
            </p>
            <p className="mt-1 text-sm text-[var(--bits-muted)]">
              Official totals exclude test gifts.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Recorded gifts
        </h2>
        {portal.gifts.length ? (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {portal.gifts.map((gift) => (
                <li
                  key={gift.id}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[var(--bits-navy)]">
                      {formatUtcDate(gift.offeringDate)}
                    </p>
                    {gift.isTest ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
                        TEST
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-[var(--bits-muted)]">
                    {gift.allocations.length
                      ? gift.allocations
                          .map(
                            (allocation) =>
                              `${allocation.fund} ${formatMoney(allocation.amount)}`,
                          )
                          .join(" · ")
                      : "No fund detail"}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[var(--bits-navy)]">
                    {formatMoney(gift.totalAmount)}
                  </p>
                  <p className="text-sm text-[var(--bits-muted)]">
                    Deductible {formatMoney(gift.deductibleAmount)}
                  </p>
                  <p className="mt-3">
                    <Link
                      href={memberGiftReceiptHref(gift.id, filters)}
                      className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                    >
                      View receipt
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Giving history for {portal.year}
                </caption>
                <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Fund allocations
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Gift total
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Deductible
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Receipt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {portal.gifts.map((gift) => (
                    <tr
                      key={gift.id}
                      className="border-b border-[var(--bits-border)] last:border-0"
                    >
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{formatUtcDate(gift.offeringDate)}</span>
                          {gift.isTest ? (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
                              TEST
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {gift.allocations.length
                          ? gift.allocations
                              .map(
                                (allocation) =>
                                  `${allocation.fund} ${formatMoney(allocation.amount)}`,
                              )
                              .join(", ")
                          : "No fund detail"}
                      </td>
                      <td className="px-3 py-3 font-semibold text-[var(--bits-navy)]">
                        {formatMoney(gift.totalAmount)}
                      </td>
                      <td className="px-3 py-3">
                        {formatMoney(gift.deductibleAmount)}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={memberGiftReceiptHref(gift.id, filters)}
                          className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                        >
                          View receipt
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No recorded gifts match the selected year and filters.
          </p>
        )}

        {portal.pageCount > 1 ? (
          <nav
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
            aria-label="Giving history pages"
          >
            <p className="text-[var(--bits-muted)]">
              Page {portal.page} of {portal.pageCount}
            </p>
            <div className="flex gap-2">
              {portal.page > 1 ? (
                <Link
                  href={memberGivingHistoryHref({
                    ...filters,
                    page: portal.page - 1,
                  })}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Previous
                </Link>
              ) : null}
              {portal.page < portal.pageCount ? (
                <Link
                  href={memberGivingHistoryHref({
                    ...filters,
                    page: portal.page + 1,
                  })}
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
        Official contribution statements are in{" "}
        <Link
          href="/portal/statements"
          className="font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          My Statements
        </Link>
        . This page is a giving history view and is not a tax statement.
      </p>
    </div>
  );
}
