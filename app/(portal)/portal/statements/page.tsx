import Link from "next/link";
import { redirect } from "next/navigation";

import { getMemberPortalStatements } from "@/server/services/member-portal.service";

function formatMoney(value: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

export default async function MyStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedYear = Number(Array.isArray(query.year) ? query.year[0] : query.year);
  const portal = await getMemberPortalStatements(requestedYear);
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
          My Statements &amp; Receipts
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your donor
          record before personal giving information can appear.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            My Statements &amp; Receipts
          </h1>
          <p className="mt-2 text-sm text-[var(--bits-muted)]">
            Only the giving record connected to your signed-in account is shown.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/portal" className="text-sm font-medium text-[var(--bits-navy)] underline">
            Member Portal Home
          </Link>
          <Link
            href="/portal/gifts"
            className="text-sm font-medium text-[var(--bits-navy)] underline"
          >
            My Giving History
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <form className="flex flex-wrap items-end gap-3" action="/portal/statements">
          <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
            Statement year
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
          <button
            type="submit"
            className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white"
          >
            View year
          </button>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Total Giving", formatMoney(portal.annualGiving.totalAmount)],
          ["Tax-Deductible Giving", formatMoney(portal.annualGiving.deductibleAmount)],
          ["Gifts Recorded", String(portal.annualGiving.giftCount)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-[var(--bits-muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">{value}</p>
            <p className="mt-1 text-xs text-[var(--bits-muted)]">{portal.year}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          {portal.year} Giving by Fund
        </h2>
        {portal.annualGiving.funds.length ? (
          <dl className="mt-4 divide-y divide-[var(--bits-border)]">
            {portal.annualGiving.funds.map((fund) => (
              <div key={fund.fund} className="flex justify-between gap-4 py-3 text-sm">
                <dt>{fund.fund}</dt>
                <dd className="font-semibold text-[var(--bits-navy)]">
                  {formatMoney(fund.amount)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No official giving was recorded for {portal.year}.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Published Contribution Statements
        </h2>
        <p className="mt-2 text-xs leading-5 text-[var(--bits-muted)]">
          Household statements appear only when the church has selected you as
          the statement recipient. If a PDF does not open, the file may be
          unavailable — contact the church office.
        </p>
        {portal.statements.length ? (
          <ul className="mt-4 divide-y divide-[var(--bits-border)]">
            {portal.statements.map((statement) => (
              <li key={statement.id} className="grid gap-2 py-4 text-sm sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{statement.statementIdentifier}</p>
                    <span className="rounded-full bg-[var(--bits-page)] px-2 py-0.5 text-xs font-semibold text-[var(--bits-navy)]">
                      {statement.kindLabel}
                    </span>
                  </div>
                  {statement.householdName ? (
                    <p className="mt-1 text-[var(--bits-muted)]">
                      {statement.householdName}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[var(--bits-muted)]">
                    {formatDate(statement.periodStart)}–{formatDate(statement.periodEnd)}
                    {statement.taxYear ? ` · Tax year ${statement.taxYear}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <p className="font-semibold text-[var(--bits-navy)]">
                    {formatMoney(statement.deductibleTotal)}
                  </p>
                  {statement.hasPdf ? (
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/portal/statements/${statement.id}/pdf?mode=view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md border border-[var(--bits-navy)] px-3 py-1.5 text-xs font-semibold text-[var(--bits-navy)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                      >
                        View PDF
                      </a>
                      <a
                        href={`/api/portal/statements/${statement.id}/pdf?mode=download`}
                        className="rounded-md bg-[var(--bits-navy)] px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                      >
                        Download PDF
                      </a>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--bits-muted)]">
                      A PDF is not available for this statement yet.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No published contribution statements are available yet.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          {portal.year} Giving Receipts
        </h2>
        <p className="mt-1 text-xs leading-5 text-[var(--bits-muted)]">
          Sandbox gifts are clearly marked and are not official tax records.
        </p>
        {portal.gifts.length ? (
          <ul className="mt-4 divide-y divide-[var(--bits-border)]">
            {portal.gifts.map((gift) => (
              <li key={gift.id} className="grid gap-3 py-4 text-sm sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{formatDate(gift.offeringDate)}</p>
                    {gift.isTest ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">
                        STRIPE TEST
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[var(--bits-muted)]">
                    {gift.allocations.map((allocation) => allocation.fund).join(", ") ||
                      "General Giving"}
                    {" · "}
                    {gift.paymentMethod.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--bits-muted)]">
                    Receipt {gift.id}
                  </p>
                </div>
                <p className="font-semibold text-[var(--bits-navy)]">
                  {formatMoney(gift.totalAmount)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No giving receipts are connected to this account yet.
          </p>
        )}
      </section>
    </div>
  );
}
