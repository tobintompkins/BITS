import Link from "next/link";

import { recordStripeTestCheckout } from "@/server/services/stripe-test-giving.service";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default async function TestGivingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  let receipt:
    | Awaited<ReturnType<typeof recordStripeTestCheckout>>
    | null = null;
  let error: string | null = null;

  try {
    if (!sessionId) throw new Error("Stripe checkout reference is missing.");
    receipt = await recordStripeTestCheckout(sessionId);
  } catch (caught) {
    error =
      caught instanceof Error
        ? caught.message
        : "Unable to verify this Stripe test checkout.";
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bits-page)] px-4 py-8">
      <section className="w-full max-w-lg rounded-2xl border border-[var(--bits-border)] bg-white p-8 shadow-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
          {error ? "!" : "✓"}
        </div>
        <p className="mt-4 text-center text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Stripe Sandbox · BITS Receipt
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-[var(--bits-navy)]">
          {error ? "Test receipt unavailable" : "Test gift recorded"}
        </h1>

        {error || !receipt ? (
          <p role="alert" className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </p>
        ) : (
          <>
            <dl className="mt-6 divide-y divide-[var(--bits-border)] rounded-xl border border-[var(--bits-border)] px-4 text-sm">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-[var(--bits-muted)]">Test amount</dt>
                <dd className="font-semibold">
                  {formatMoney(receipt.session.amount_total ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-[var(--bits-muted)]">Fund</dt>
                <dd className="font-medium">
                  {receipt.session.metadata.fund ?? "General Offering"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-[var(--bits-muted)]">Status</dt>
                <dd className="font-medium text-emerald-700">Test paid</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-[var(--bits-muted)]">BITS record</dt>
                <dd className="font-mono text-xs">{receipt.donation.id}</dd>
              </div>
            </dl>
            <p className="mt-4 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-900">
              This is sandbox test data. No real money moved, and this gift is
              excluded from official year-to-date and tax-statement totals.
            </p>
          </>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/give" className="rounded-xl border border-[var(--bits-border)] px-5 py-3 text-sm font-semibold">
            Run Another Test
          </Link>
          <Link href="/portal" className="rounded-xl bg-[var(--bits-navy)] px-5 py-3 text-sm font-semibold text-white">
            Member Portal
          </Link>
        </div>
      </section>
    </main>
  );
}
