import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ManualDonationForm } from "@/components/batches/manual-donation-form";
import {
  ManualBatchDonationError,
  getActiveOfferingFundsForBatchEntry,
} from "@/server/services/manual-batch-donation.service";
import {
  OfferingBatchError,
  getOfferingBatchDetail,
} from "@/server/services/offering-batch.service";

export default async function NewBatchDonationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  try {
    detail = await getOfferingBatchDetail(id);
  } catch (error) {
    if (error instanceof OfferingBatchError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    if (error instanceof OfferingBatchError && error.code === "SIGNED_OUT") {
      redirect("/sign-in");
    }
    if (error instanceof OfferingBatchError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  if (!detail.canAddDonations) {
    redirect(`/batches/${detail.batch.id}`);
  }

  let funds;
  try {
    funds = await getActiveOfferingFundsForBatchEntry();
  } catch (error) {
    if (error instanceof ManualBatchDonationError && error.code === "FORBIDDEN") {
      redirect(`/batches/${detail.batch.id}`);
    }
    throw error;
  }

  const offeringDate = detail.batch.offeringDate.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/batches/${detail.batch.id}`}
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          ← Back to {detail.batch.name}
        </Link>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Add Donation
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Record a manual gift in this draft batch. Card and ACH gifts continue
          to come from Stripe and cannot be entered here.
        </p>
      </header>

      {funds.length ? (
        <ManualDonationForm
          batchId={detail.batch.id}
          batchName={detail.batch.name}
          batchOfferingDate={offeringDate}
          funds={funds}
        />
      ) : (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          This church has no active giving funds yet. Add a fund before recording
          a donation.
        </p>
      )}
    </div>
  );
}
