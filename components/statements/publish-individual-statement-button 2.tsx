"use client";

import { useId, useRef, useState, useTransition } from "react";

import { publishIndividualContributionStatementAction } from "@/app/(staff)/statements/recipients/[donorId]/actions";

export function PublishIndividualStatementButton({
  statementId,
  statementIdentifier,
}: {
  statementId: string;
  statementIdentifier: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function confirm() {
    startTransition(async () => {
      const result = await publishIndividualContributionStatementAction({
        statementId,
        confirmed: true,
      });
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="print-hidden rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={openDialog}
        className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        Approve and publish to member portal
      </button>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
        Publishing {statementIdentifier} makes it visible only to the connected
        donor in their secure portal. It does not email the donor.
      </p>
      <dialog
        ref={dialogRef}
        className="w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-[var(--bits-border)] bg-white p-0 shadow-xl"
        aria-labelledby={titleId}
      >
        <div className="px-5 py-4">
          <h2
            id={titleId}
            className="text-lg font-semibold text-[var(--bits-navy)]"
          >
            Approve and publish to member portal?
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            This makes the statement visible only to the connected donor or
            member in their secure portal. It does not email the donor. This
            action is recorded. You must have opened and checked the generated
            PDF first.
          </p>
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
            {isPending ? "Publishing…" : "Approve and publish to member portal"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
