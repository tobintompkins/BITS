import Link from "next/link";

import { isStripeTestModeConfigured } from "@/lib/stripe/test-mode";
import { stripeDonationFundOptions } from "@/lib/validation/stripe-donation";

export default async function GivePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    setup?: string;
    cancelled?: string;
  }>;
}) {
  const params = await searchParams;
  const configured = isStripeTestModeConfigured();
  const message =
    params.error ??
    params.setup ??
    (params.cancelled ? "Test checkout was cancelled. No payment was made." : null);

  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
              First UPC of Saco
            </p>
            <h1 className="text-xl font-semibold">Give Online</h1>
          </div>
          <Link href="/" className="text-sm text-white/80 hover:text-white">
            Return Home
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm sm:p-8">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            <strong>Stripe sandbox test mode</strong>
            <p className="mt-1">
              This page is for testing only. No real donation will be charged
              or deposited.
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

          <form action="/api/stripe/checkout" method="post" className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">First name</span>
              <input name="firstName" required autoComplete="given-name" className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Last name</span>
              <input name="lastName" required autoComplete="family-name" className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Email</span>
              <input name="email" type="email" required autoComplete="email" className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Giving fund</span>
              <select name="fund" required className="w-full rounded-lg border border-[var(--bits-border)] px-3 py-2">
                {stripeDonationFundOptions.map((fund) => (
                  <option key={fund} value={fund}>{fund}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Test amount</span>
              <div className="flex rounded-lg border border-[var(--bits-border)] focus-within:ring-2 focus-within:ring-[var(--bits-gold)]">
                <span className="px-3 py-2 text-[var(--bits-muted)]">$</span>
                <input name="amount" inputMode="decimal" required placeholder="25.00" className="min-w-0 flex-1 rounded-r-lg px-2 py-2 outline-none" />
              </div>
            </label>
            <button
              type="submit"
              disabled={!configured}
              className="rounded-xl bg-[var(--bits-navy)] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-2"
            >
              Continue to Stripe Test Checkout
            </button>
          </form>

          <p className="mt-5 text-xs leading-5 text-[var(--bits-muted)]">
            Payment details are entered on Stripe’s hosted page. BITS does not
            collect or store card numbers, bank account numbers, or routing
            numbers.
          </p>
        </section>
      </div>
    </main>
  );
}
