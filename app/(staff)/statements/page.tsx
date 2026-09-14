import Link from "next/link";

import { getLeadershipStatementsDashboard } from "@/server/services/leadership-statements.service";

function formatMoney(value: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

export default async function StatementsPage() {
  const data = await getLeadershipStatementsDashboard();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Statements &amp; Online Giving
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Read-only financial overview for {data.organizationName}. Stripe
          sandbox gifts remain separate from official giving totals.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Official gifts", String(data.totals.recordedGiftCount)],
          ["Official total", formatMoney(data.totals.recordedAmount)],
          ["Stripe test gifts", String(data.totals.testGiftCount)],
          ["Stripe test total", formatMoney(data.totals.testAmount)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-[var(--bits-muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">{value}</p>
          </div>
        ))}
        <Link
          href="/statements/unmatched"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <p className="text-xs font-medium text-[var(--bits-muted)]">
            Unmatched gifts
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {data.totals.unmatchedOnline}
          </p>
          <p className="mt-2 text-xs text-[var(--bits-muted)]">
            {data.totals.unmatchedTest} Stripe test · {data.totals.unmatchedLive} live
          </p>
        </Link>
      </section>

      <p>
        <Link
          href="/statements/unmatched"
          className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Review unmatched online gifts
        </Link>
      </p>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
              Online Giving Activity
            </h2>
            <p className="mt-1 text-xs text-[var(--bits-muted)]">
              Most recent 100 Stripe-recorded gifts
            </p>
          </div>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
            TEST MODE ACTIVE
          </span>
        </div>
        {data.onlineGifts.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Stripe online giving activity</caption>
              <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2">Date</th>
                  <th scope="col" className="px-3 py-2">Donor</th>
                  <th scope="col" className="px-3 py-2">Fund</th>
                  <th scope="col" className="px-3 py-2">Amount</th>
                  <th scope="col" className="px-3 py-2">Match</th>
                  <th scope="col" className="px-3 py-2">Environment</th>
                </tr>
              </thead>
              <tbody>
                {data.onlineGifts.map((gift) => (
                  <tr key={gift.id} className="border-b border-[var(--bits-border)] last:border-0">
                    <td className="px-3 py-3">{formatDate(gift.offeringDate)}</td>
                    <td className="px-3 py-3">
                      {gift.donor ? (
                        <>
                          <span className="block font-medium">
                            {gift.donor.firstName} {gift.donor.lastName}
                          </span>
                          <span className="text-xs text-[var(--bits-muted)]">
                            {gift.donor.email ?? "No email"}
                          </span>
                        </>
                      ) : (
                        <span className="text-amber-700">Unmatched donor</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {gift.allocations.map((allocation) => allocation.fund).join(", ") ||
                        "General Giving"}
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      {formatMoney(gift.totalAmount)}
                    </td>
                    <td className="px-3 py-3">
                      {gift.donor ? "Matched" : "Needs review"}
                    </td>
                    <td className="px-3 py-3">
                      <span className={gift.isTest ? "rounded-full bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800" : ""}>
                        {gift.isTest ? "STRIPE TEST" : "LIVE"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No Stripe gifts have been recorded in BITS yet. Complete a new test
            checkout or refresh its BITS success page.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Contribution Statements
        </h2>
        <p className="mt-1 text-xs text-[var(--bits-muted)]">
          Statement creation and publishing controls will be added in the next
          financial milestone.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <Link
            href="/statements/readiness"
            className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Review statement readiness
          </Link>
          <Link
            href="/statements/recipients"
            className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Review statement recipients
          </Link>
          <Link
            href="/households"
            className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Preview household statements
          </Link>
        </p>
        {data.statements.length ? (
          <ul className="mt-4 divide-y divide-[var(--bits-border)] text-sm">
            {data.statements.map((statement) => (
              <li key={statement.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div>
                  <p className="font-semibold">{statement.statementIdentifier}</p>
                  <p className="mt-1 text-[var(--bits-muted)]">
                    {statement.donor
                      ? `${statement.donor.firstName} ${statement.donor.lastName}`
                      : statement.household?.displayName ?? "Unknown recipient"}
                    {" · "}
                    {formatDate(statement.periodStart)}–{formatDate(statement.periodEnd)}
                  </p>
                  {statement.household?.id ? (
                    <p className="mt-2">
                      <Link
                        href={`/statements/households/${statement.household.id}?year=${statement.periodStart.getUTCFullYear()}`}
                        className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                      >
                        Preview household statement
                      </Link>
                    </p>
                  ) : null}
                </div>
                <p className="font-semibold text-[var(--bits-navy)]">
                  {formatMoney(statement.deductibleTotal)}
                </p>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-center text-xs font-semibold">
                  {statement.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No contribution statements have been generated yet.
          </p>
        )}
      </section>
    </div>
  );
}
