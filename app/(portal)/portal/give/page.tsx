import Link from "next/link";
import { redirect } from "next/navigation";

import { isStripeTestModeConfigured } from "@/lib/stripe/test-mode";
import {
  MEMBER_STRIPE_GIVING_NOTICE,
  MEMBER_STRIPE_GIVING_SECURITY_COPY,
  memberStripeDonationFundOptions,
} from "@/lib/validation/member-stripe-giving";
import { getMemberStripeGiving } from "@/server/services/member-stripe-giving.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function MemberGivePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    setup?: string;
    cancelled?: string;
    pending?: string;
  }>;
}) {
  const params = await searchParams;
  const portal = await getMemberStripeGiving();
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  if (portal.status === "CONNECTION_PENDING" || params.pending) {
    return (
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
          Give Online
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Church staff must connect your account
          {portal.status === "CONNECTION_PENDING"
            ? ` (${portal.accountEmail})`
            : ""}{" "}
          to your giving record before member-attributed online giving can be
          used. Guests can still give without signing in.
        </p>
        <p className="mt-4">
          <Link
            href="/portal/help"
            className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Help &amp; Contact
          </Link>
        </p>
        <p className="mt-3">
          <Link
            href="/give"
            className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Public Give Online
          </Link>
        </p>
      </section>
    );
  }

  const configured = isStripeTestModeConfigured();
  const message =
    params.error ??
    params.setup ??
    (params.cancelled
      ? "Test checkout was cancelled. No payment was made."
      : null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            Give Online
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_STRIPE_GIVING_NOTICE}
          </p>
        </div>
        <Link
          href="/portal"
          className={`text-sm font-medium text-[var(--bits-navy)] underline ${focusClass}`}
        >
          Member Portal Home
        </Link>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:p-8">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <strong>Stripe sandbox test mode</strong>
          <p className="mt-1">
            This page is for testing only. No real donation will be charged or
            deposited.
          </p>
        </div>

        {message ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          >
            {message}
          </p>
        ) : null}

        {!configured ? (
          <div className="mt-6 rounded-xl border-l-4 border-[var(--bits-gold)] bg-[var(--bits-page)] p-4">
            <h2 className="font-semibold text-[var(--bits-navy)]">
              Checkout setup is paused
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
              The giving form is ready, but a complete Stripe sandbox secret
              key has not been saved. The rest of BITS continues to work
              normally.
            </p>
          </div>
        ) : null}

        <dl className="mt-6 grid gap-4 rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--bits-muted)]">Name on file</dt>
            <dd className="mt-1 font-semibold text-[var(--bits-navy)]">
              {portal.donor.firstName} {portal.donor.lastName}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--bits-muted)]">Email on file</dt>
            <dd className="mt-1 font-semibold text-[var(--bits-navy)]">
              {portal.donor.email ?? "Not provided"}
            </dd>
          </div>
        </dl>

        <form
          action="/api/portal/stripe/checkout"
          method="post"
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
            Giving fund
            <select
              name="fund"
              required
              className={`w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 ${focusClass}`}
            >
              {memberStripeDonationFundOptions.map((fund) => (
                <option key={fund} value={fund}>
                  {fund}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
            Amount
            <span className="flex rounded-xl border border-[var(--bits-border)] bg-white focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--bits-gold)]">
              <span className="px-3 py-2 text-[var(--bits-muted)]">$</span>
              <input
                name="amount"
                inputMode="decimal"
                required
                placeholder="25.00"
                aria-describedby="member-give-amount-help"
                className="min-w-0 flex-1 rounded-r-xl px-2 py-2 outline-none"
              />
            </span>
          </label>
          <p
            id="member-give-amount-help"
            className="text-xs text-[var(--bits-muted)] sm:col-span-2"
          >
            Enter a dollar amount of at least $1.00.
          </p>
          <button
            type="submit"
            disabled={!configured}
            className={`rounded-xl bg-[var(--bits-navy)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2 ${focusClass}`}
          >
            Continue to Stripe Test Checkout
          </button>
        </form>

        <p className="mt-5 text-sm leading-6 text-[var(--bits-muted)]">
          {MEMBER_STRIPE_GIVING_SECURITY_COPY}
        </p>
      </section>
    </div>
  );
}
