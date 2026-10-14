"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteManualBatchDonationAction } from "@/app/(staff)/batches/actions";

export function DeleteDraftDonationForm({
  batchId,
  donationId,
}: {
  batchId: string;
  donationId: string;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="rounded-2xl border border-rose-200 bg-rose-50 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await deleteManualBatchDonationAction(
            batchId,
            donationId,
          );
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/batches/${batchId}?donation=deleted`);
          router.refresh();
        });
      }}
    >
      <h2 className="text-lg font-semibold text-rose-900">Delete draft gift</h2>
      <p className="mt-1 text-sm text-rose-800">
        This removes the gift and its allocations from the draft batch and
        updates the recorded total. Locked history is not rewritten.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm font-medium text-rose-900">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={isPending}
        />
        Delete this draft gift
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!confirmed || isPending}
        className="mt-4 rounded-xl bg-rose-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? "Deleting..." : "Delete donation"}
      </button>
    </form>
  );
}