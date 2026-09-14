import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatMoney } from "@/lib/money/decimal";
import { statementYearBounds } from "@/lib/validation/statement-readiness";
import {
  StatementReadinessError,
  getStatementReadiness,
} from "@/server/services/statement-readiness.service";

function CheckCard({
  title,
  ready,
  readyLabel,
  attentionLabel,
}: {
  title: string;
  ready: boolean;
  readyLabel: string;
  attentionLabel: string;
}) {
  return (
    <article
      className={`rounded-2xl border border-[var(--bits-border)] border-t-4 bg-white p-4 shadow-sm ${
        ready ? "border-t-emerald-600" : "border-t-amber-400"
      }`}
    >
      <h3 className="text-sm font-semibold text-[var(--bits-navy)]">{title}</h3>
      <p
        className={`mt-2 text-sm ${ready ? "text-emerald-800" : "text-amber-900"}`}
      >
        {ready ? readyLabel : attentionLabel}
      </p>
    </article>
  );
}

export default async function StatementReadinessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let readiness;
  try {
    readiness = await getStatementReadiness(query.year);
  } catch (error) {
    if (error instanceof StatementReadinessError && error.code === "SIGNED_OUT") {
      redirect("/sign-in");
    }
    if (error instanceof StatementReadinessError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    if (error instanceof StatementReadinessError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const { min, max } = statementYearBounds();
  const years = [];
  for (let year = max; year >= min; year -= 1) {
    years.push(year);
  }

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
          Statement Readiness
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Check whether {readiness.organizationName} has the basic church and
          giving information needed before annual contribution statements are
          generated. This page does not create or publish statements.
        </p>
      </header>

      <form
        action="/statements/readiness"
        className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm"
      >
        <label className="grid max-w-xs gap-1 text-sm">
          <span className="font-medium text-[var(--bits-navy)]">Tax year</span>
          <select
            name="year"
            defaultValue={String(readiness.year)}
            className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="mt-4 rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Review year
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2">
        <CheckCard
          title="Church name"
          ready={readiness.checks.organizationName}
          readyLabel="A legal or display name is on file."
          attentionLabel="Add a legal or display name in organization settings."
        />
        <CheckCard
          title="Church mailing address"
          ready={readiness.checks.organizationAddress}
          readyLabel="Line 1, city, state, and postal code are on file."
          attentionLabel="Complete the church mailing address before generating statements."
        />
        <CheckCard
          title="EIN"
          ready={readiness.checks.ein}
          readyLabel="An EIN is on file."
          attentionLabel="No EIN is on file yet. Add it if the church will print it on statements."
        />
        <CheckCard
          title="Statement wording"
          ready={readiness.checks.statementFooter}
          readyLabel="Statement footer or acknowledgment text is on file."
          attentionLabel="Add approved statement footer or acknowledgment text before publishing."
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Official donations", String(readiness.giving.donationCount)],
          ["Official total", formatMoney(readiness.giving.donationTotal)],
          ["Giving donors", String(readiness.giving.donorCount)],
          [
            "Donors missing a mailing address",
            String(readiness.giving.donorsMissingAddress),
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
      <p className="text-sm text-[var(--bits-muted)]">
        Official giving excludes Stripe test gifts and uses offering dates from
        January 1 through December 31 of {readiness.year}. A usable donor mailing
        address needs line 1, city, state, and postal code. Donor names are not
        listed on this page.
      </p>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Existing statements for {readiness.year}
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Generated
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
              {readiness.statements.generated}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Published
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
              {readiness.statements.published}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Voided
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
              {readiness.statements.voided}
            </dd>
          </div>
        </dl>
      </section>

      <p
        role="note"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
      >
        BITS does not provide tax or legal advice. Have the church’s approved
        statement wording and records reviewed before publishing.
      </p>
    </div>
  );
}
