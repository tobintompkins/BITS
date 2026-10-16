import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeleteDraftDonationForm } from "@/components/batches/delete-draft-donation-form";
import { ManualDonationForm } from "@/components/batches/manual-donation-form";
import {
  ManualBatchDonationError,
  getActiveOfferingFundsForBatchEntry,
  getManualBatchDonationForEdit,
} from "@/server/services/manual-batch-donation.service";

export default async function EditBatchDonationPage({
  params,
}: {
  params: Promise<{ id: string; donationId: string }>;
}) {
  const { id, donationId } = await params;

  let detail;
  try {
    detail = await getManualBatchDonationForEdit(id, donationId);
  } catch (error) {
    if (error instanceof ManualBatchDonationError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    if (error instanceof ManualBatchDonationError && error.code === "SIGNED_OUT") {
      redirect("/sign-in");
    }
    if (error instanceof ManualBatchDonationError && error.code === "NOT_FOUND") {
      notFound();
    }
    if (error instanceof ManualBatchDonationError && error.code === "NOT_EDITABLE") {
      redirect(`/batches/${id}`);
    }
    throw error;
  }

  let funds;
  try {
    funds = await getActiveOfferingFundsForBatchEntry();
  } catch (error) {
    if (error instanceof ManualBatchDonationError && error.code === "FORBIDDEN") {
      redirect(`/batches/${id}`);
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
          Edit Draft Donation
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Correct this draft gift before entry is completed. The batch recorded
          total is recalculated from the new allocation sum. Stripe gifts stay
          unchanged.
        </p>
      </header>

      {funds.length ? (
        <ManualDonationForm
          batchId={detail.batch.id}
          batchName={detail.batch.name}
          batchOfferingDate={offeringDate}
          funds={funds}
          donationId={donationId}
          initialValues={detail.formValues}
          selectedDonor={detail.selectedDonor}
          expectedReviewVersion={detail.reviewVersion}
        />
      ) : (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          This church has no active giving funds yet.
        </p>
      )}

      <DeleteDraftDonationForm
        batchId={detail.batch.id}
        donationId={donationId}
        expectedReviewVersion={detail.reviewVersion}
      />
    </div>
  );
}