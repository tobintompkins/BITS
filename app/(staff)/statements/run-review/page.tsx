import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatMoney } from "@/lib/money/decimal";
import { statementYearBounds } from "@/lib/validation/statement-readiness";
import {
  StatementRunReviewError,
  getStatementRunReview,
} from "@/server/services/statement-run-review.service";

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

function StatusCounts({
  generated,
  published,
  voided,
}: {
  generated: number;
  published: number;
  voided: number;
}) {
  return (
    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
          Generated
        </dt>
        <dd className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
          {generated}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
          Published
        </dt>
        <dd className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
          {published}
        </dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
          Voided
        </dt>
        <dd className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
          {voided}
        </dd>
      </div>
    </dl>
  );
}

export default async function StatementRunReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let review;
  try {
    review = await getStatementRunReview(query.year);
  } catch (error) {
    if (error instanceof StatementRunReviewError && error.code === "SIGNED_OUT") {
      redirect("/sign-in");
    }
    if (error instanceof StatementRunReviewError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    if (error instanceof StatementRunReviewError && error.code === "NOT_FOUND") {
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
          Statement Run Review
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Review {review.year} contribution-statement preparation for{" "}
          {review.organizationName}. This page does not create or publish
          statements.
        </p>
      </header>

      <form
        action="/statements/run-review"
        className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm"
      >
        <label className="grid max-w-xs gap-1 text-sm">
          <span className="font-medium text-[var(--bits-navy)]">Tax year</span>
          <select
            name="year"
            defaultValue={String(review.year)}
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

      <p
        role="status"
        className="rounded-2xl border border-[var(--bits-border)] bg-zinc-100 px-5 py-4 text-sm font-semibold leading-6 text-zinc-600"
      >
        Official statement generation will be enabled in a later reviewed patch.
      </p>

      <section className="grid gap-4 sm:grid-cols-2">
        <CheckCard
          title="Church name"
          ready={review.checks.organizationName}
          readyLabel="A legal or display name is on file."
          attentionLabel="Add a legal or display name in organization settings."
        />
        <CheckCard
          title="Church mailing address"
          ready={review.checks.organizationAddress}
          readyLabel="Line 1, city, state, and postal code are on file."
          attentionLabel="Complete the church mailing address before generating statements."
        />
        <CheckCard
          title="EIN"
          ready={review.checks.ein}
          readyLabel="An EIN is on file."
          attentionLabel="No EIN is on file yet. Add it if the church will print it on statements."
        />
        <CheckCard
          title="Statement wording"
          ready={review.checks.statementFooter}
          readyLabel="Statement footer or acknowledgment text is on file."
          attentionLabel="Add approved statement footer or acknowledgment text before publishing."
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">
            Official gifts
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {review.giving.donationCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">
            Official total
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {formatMoney(review.giving.donationTotal)}
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Individual Statements
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                Recipients with official giving
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
                {review.individual.recipientCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                Missing a mailing address
              </dt>
              <dd
                className={`mt-1 text-2xl font-semibold ${
                  review.individual.missingAddressCount
                    ? "text-amber-800"
                    : "text-[var(--bits-navy)]"
                }`}
              >
                {review.individual.missingAddressCount}
              </dd>
            </div>
          </dl>
          <StatusCounts {...review.individual.statements} />
          <p className="mt-4">
            <Link
              href={`/statements/recipients?year=${review.year}`}
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Open statement recipient review
            </Link>
          </p>
        </article>

        <article className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Household Statements
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                Households with official giving
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
                {review.household.recipientCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                Missing a mailing address
              </dt>
              <dd
                className={`mt-1 text-2xl font-semibold ${
                  review.household.missingAddressCount
                    ? "text-amber-800"
                    : "text-[var(--bits-navy)]"
                }`}
              >
                {review.household.missingAddressCount}
              </dd>
            </div>
          </dl>
          <StatusCounts {...review.household.statements} />
          <p className="mt-4">
            <Link
              href="/households#giving-household-statements"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Open household statement previews
            </Link>
          </p>
        </article>
      </section>

      <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link
          href={`/statements/readiness?year=${review.year}`}
          className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Review statement readiness
        </Link>
        <Link
          href={`/statements/recipients?year=${review.year}`}
          className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Review statement recipients
        </Link>
        <Link
          href="/households#giving-household-statements"
          className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Household directory and previews
        </Link>
      </p>

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
