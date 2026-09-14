"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import {
  completeOfferingBatchEntryAction,
  lockOfferingBatchAction,
  reconcileOfferingBatchAction,
} from "@/app/(staff)/batches/actions";

type TransitionKind = "complete" | "reconcile" | "lock";

const COPY: Record<
  TransitionKind,
  { title: string; body: string; confirm: string; href: string }
> = {
  complete: {
    title: "Complete batch entry?",
    body: "This marks the batch as Entered. Donation entry and draft batch editing will stop. Totals will not be changed automatically.",
    confirm: "Complete Entry",
    href: "entered",
  },
  reconcile: {
    title: "Reconcile this batch?",
    body: "Reconciliation certifies that the expected total and recorded total match. This does not lock the batch or create a deposit.",
    confirm: "Reconcile Batch",
    href: "reconciled",
  },
  lock: {
    title: "Lock this batch?",
    body: "Locking is permanent in the current workflow. Donations cannot be added or edited afterward. Deposit information cannot be changed afterward. Corrections require a future restricted correction workflow.",
    confirm: "Lock Batch",
    href: "locked",
  },
};

export function BatchTransitionDialog({
  batchId,
  kind,
  disabled,
}: {
  batchId: string;
  kind: TransitionKind;
  disabled?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const copy = COPY[kind];

  function openDialog() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function confirm() {
    startTransition(async () => {
      const result =
        kind === "complete"
          ? await completeOfferingBatchEntryAction(batchId)
          : kind === "reconcile"
            ? await reconcileOfferingBatchAction(batchId)
            : await lockOfferingBatchAction(batchId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeDialog();
      router.push(`/batches/${batchId}?transition=${copy.href}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        {copy.confirm}
      </button>
      <dialog
        ref={dialogRef}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-[var(--bits-border)] bg-white p-0 shadow-xl"
        aria-labelledby={titleId}
      >
        <div className="px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-[var(--bits-navy)]">
            {copy.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">{copy.body}</p>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-[var(--bits-border)] px-5 py-4">
          <button
            type="button"
            onClick={closeDialog}
            disabled={isPending}
            className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isPending}
            className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? "Saving..." : copy.confirm}
          </button>
        </div>
      </dialog>
    </>
  );
}
