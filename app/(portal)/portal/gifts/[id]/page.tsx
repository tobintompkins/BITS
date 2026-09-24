import Link from "next/link";
import { redirect } from "next/navigation";

import { PrintPageButton } from "@/components/portal/print-page-button";
import { formatMoney } from "@/lib/money/decimal";
import {
  memberGivingHistoryHref,
  parseMemberGivingHistoryQuery,
} from "@/lib/validation/member-giving-history";
import { getMemberGiftReceipt } from "@/server/services/member-gift-receipt.service";

function formatUtcDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

function formatAddress(row: {
  mailingAddressLine1: string | null;
  mailingAddressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country?: string | null;
}) {
  const cityLine = [row.city, row.state]
    .filter((part) => part?.trim())
    .join(", ");
  const lines = [
    row.mailingAddressLine1,
    row.mailingAddressLine2,
    `${cityLine}${row.postalCode?.trim() ? ` ${row.postalCode}` : ""}`,
    row.country,
  ]
    .map((line) => line?.trim())
    .filter(Boolean);
  return lines.join("\n");
}

function GiftReceiptUnavailable() {
  return (
    <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
        Gift Receipt
      </h1>
      <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
        This gift receipt is not available.
      </p>
      <p className="mt-4">
        <Link
          href="/portal/gifts"
          className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Back to My Giving History
        </Link>
      </p>
    </section>
  );
}

export default async function MemberGiftReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const receipt = await getMemberGiftReceipt(id);
  if (receipt.status === "SIGNED_OUT") redirect("/sign-in");

  if (receipt.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  if (receipt.status === "CONNECTION_PENDING") {
    return (
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
          Gift Receipt
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({receipt.accountEmail}) must be connected to your donor
          record before personal giving information can appear.
        </p>
      </section>
    );
  }

  if (receipt.status === "NOT_FOUND") {
    return <GiftReceiptUnavailable />;
  }

  const filters = parseMemberGivingHistoryQuery(query);
  const historyHref = memberGivingHistoryHref({
    year: filters.year,
    fund: filters.fund,
    page: filters.page,
  });
  const organizationLabel =
    receipt.organization.displayName === receipt.organization.name
      ? receipt.organization.name
      : `${receipt.organization.displayName}`;
  const organizationLegalName =
    receipt.organization.displayName === receipt.organization.name
      ? null
      : receipt.organization.name;

  return (
    <div className="statement-preview gift-receipt space-y-6">
      <header className="print-hidden flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={historyHref}
            className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            ← Back to My Giving History
          </Link>
          <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            Gift Receipt
          </h1>
        </div>
      </header>

      <PrintPageButton
        label="Print or Save Receipt"
        ariaLabel="Open the browser print dialog to print or save this gift receipt"
        note="This prints a personal gift receipt. It is not an official annual contribution statement."
      />

      <article className="print-keep rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:p-8">
        <header className="print-letterhead">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
                Gift Receipt
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
                {organizationLabel}
              </h2>
              {organizationLegalName ? (
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {organizationLegalName}
                </p>
              ) : null}
              <address className="mt-3 whitespace-pre-line text-sm not-italic leading-6 text-[var(--bits-muted)]">
                {formatAddress(receipt.organization)}
              </address>
            </div>
            {receipt.gift.isTest ? (
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-800">
                Stripe test / sandbox
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-800">
                Official
              </span>
            )}
          </div>
        </header>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Received from
            </dt>
            <dd className="mt-1 font-medium text-[var(--bits-navy)]">
              {receipt.member.displayName}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Gift date
            </dt>
            <dd className="mt-1 font-medium text-[var(--bits-navy)]">
              {formatUtcDate(receipt.gift.offeringDate)}
            </dd>
          </div>
        </dl>

        {receipt.gift.isTest ? (
          <p
            role="note"
            className="mt-6 rounded-xl bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-950"
          >
            This is a Stripe sandbox/test record and is not an official tax
            record.
          </p>
        ) : null}

        <h3 className="mt-6 text-lg font-semibold text-[var(--bits-navy)]">
          Fund allocations
        </h3>
        {receipt.gift.allocations.length ? (
          <table className="mt-3 min-w-full text-left text-sm">
            <caption className="sr-only">Gift allocations</caption>
            <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
              <tr>
                <th scope="col" className="py-2 pr-3">
                  Fund
                </th>
                <th scope="col" className="py-2 text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {receipt.gift.allocations.map((allocation) => (
                <tr
                  key={`${allocation.fund}-${allocation.amount}`}
                  className="border-b border-[var(--bits-border)] last:border-0"
                >
                  <td className="py-3 pr-3">{allocation.fund}</td>
                  <td className="py-3 text-right font-medium">
                    {formatMoney(allocation.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-[var(--bits-muted)]">
            No fund detail is recorded for this gift.
          </p>
        )}

        <dl className="mt-6 grid gap-3 border-t border-[var(--bits-border)] pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Gift total
            </dt>
            <dd className="mt-1 text-xl font-semibold text-[var(--bits-navy)]">
              {formatMoney(receipt.gift.totalAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Deductible amount
            </dt>
            <dd className="mt-1 text-xl font-semibold text-[var(--bits-navy)]">
              {formatMoney(receipt.gift.deductibleAmount)}
            </dd>
          </div>
        </dl>

        {receipt.organization.statementFooterText ? (
          <p className="mt-6 text-sm leading-6 text-[var(--bits-muted)]">
            {receipt.organization.statementFooterText}
          </p>
        ) : null}

        <p
          role="note"
          className="mt-6 text-sm leading-6 text-[var(--bits-navy)]"
        >
          This receipt is for your personal records. Your official annual
          contribution statement is available in My Statements when published by
          the church.
        </p>
      </article>
    </div>
  );
}
