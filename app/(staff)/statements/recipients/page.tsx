import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatMoney } from "@/lib/money/decimal";
import { statementYearBounds } from "@/lib/validation/statement-readiness";
import {
  StatementRecipientReviewError,
  getStatementRecipientReview,
} from "@/server/services/statement-recipient-review.service";

function recipientQueryParams(
  query: { year: number; q: string; address: string },
  page: number,
) {
  const params = new URLSearchParams();
  params.set("year", String(query.year));
  if (query.q) params.set("q", query.q);
  if (query.address !== "all") params.set("address", query.address);
  if (page > 1) params.set("page", String(page));
  return params;
}

function buildHref(
  query: { year: number; q: string; address: string },
  page: number,
) {
  return `/statements/recipients?${recipientQueryParams(query, page).toString()}`;
}

function buildPreviewHref(
  donorId: string,
  query: { year: number; q: string; address: string },
  page: number,
) {
  return `/statements/recipients/${donorId}?${recipientQueryParams(query, page).toString()}`;
}

function statementStatusLabel(status: string | null) {
  switch (status) {
    case "GENERATED":
      return "Generated";
    case "PUBLISHED":
      return "Published";
    case "VOIDED":
      return "Voided";
    default:
      return "None";
  }
}

export default async function StatementRecipientReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let review;
  try {
    review = await getStatementRecipientReview(query);
  } catch (error) {
    if (
      error instanceof StatementRecipientReviewError &&
      error.code === "SIGNED_OUT"
    ) {
      redirect("/sign-in");
    }
    if (
      error instanceof StatementRecipientReviewError &&
      error.code === "FORBIDDEN"
    ) {
      redirect("/dashboard");
    }
    if (
      error instanceof StatementRecipientReviewError &&
      error.code === "NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  }

  const { min, max } = statementYearBounds();
  const years = [];
  for (let year = max; year >= min; year -= 1) {
    years.push(year);
  }
  const filters = {
    year: review.year,
    q: review.q,
    address: review.address,
  };

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
          Statement Recipient Review
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Review individual donors with official giving for {review.year} at{" "}
          {review.organizationName}. This list does not create or publish
          statements.
        </p>
      </header>

      <form
        action="/statements/recipients"
        className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
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
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">
              Search name or email
            </span>
            <input
              name="q"
              defaultValue={review.q}
              maxLength={100}
              className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--bits-navy)]">
              Mailing address
            </span>
            <select
              name="address"
              defaultValue={review.address}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              <option value="all">All recipients</option>
              <option value="complete">Complete address</option>
              <option value="missing">Missing address</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          className="mt-4 rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Apply filters
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">
            Recipients with official giving
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {review.recipientCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-amber-400 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">
            Recipients missing a mailing address
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {review.missingAddressCount}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Recipients
        </h2>
        {review.recipients.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">
                Official giving recipients for {review.year}
              </caption>
              <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Donor
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Contact
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Mailing status
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Official giving
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Gifts
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Statement status
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Preview
                  </th>
                </tr>
              </thead>
              <tbody>
                {review.recipients.map((recipient) => (
                  <tr
                    key={recipient.id}
                    className="border-b border-[var(--bits-border)] last:border-0"
                  >
                    <td className="px-3 py-3 font-medium text-[var(--bits-navy)]">
                      {recipient.displayName}
                    </td>
                    <td className="px-3 py-3">
                      {recipient.email?.trim() || "No email"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${
                          recipient.mailingAddressComplete
                            ? "bg-emerald-50 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {recipient.mailingAddressComplete
                          ? "Complete"
                          : "Missing"}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      {formatMoney(recipient.officialTotal)}
                    </td>
                    <td className="px-3 py-3">{recipient.giftCount}</td>
                    <td className="px-3 py-3">
                      {statementStatusLabel(recipient.statement.status)}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={buildPreviewHref(recipient.id, filters, review.page)}
                        aria-label={`Preview statement for ${recipient.displayName}`}
                        className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                      >
                        Preview statement
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No official donor gifts match the selected year and filters.
          </p>
        )}

        {review.pageCount > 1 ? (
          <nav
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
            aria-label="Recipient pages"
          >
            <p className="text-[var(--bits-muted)]">
              Page {review.page} of {review.pageCount}
            </p>
            <div className="flex gap-2">
              {review.page > 1 ? (
                <Link
                  href={buildHref(filters, review.page - 1)}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Previous
                </Link>
              ) : null}
              {review.page < review.pageCount ? (
                <Link
                  href={buildHref(filters, review.page + 1)}
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
        This review does not create or publish statements. BITS does not provide
        tax or legal advice.
      </p>
    </div>
  );
}
