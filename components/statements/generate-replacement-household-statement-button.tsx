"use client";

import { useId, useRef, useState, useTransition } from "react";

import { generateHouseholdContributionStatementAction } from "@/app/(staff)/statements/households/[householdId]/actions";

export function GenerateReplacementHouseholdStatementButton({
  householdId,
  year,
  priorStatementIdentifier,
}: {
  householdId: string;
  year: number;
  priorStatementIdentifier: string;
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
      const result = await generateHouseholdContributionStatementAction({
        householdId,
        year: String(year),
        confirmed: true,
      });
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="print-hidden rounded-2xl border border-rose-200 border-t-4 border-t-rose-700 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
        Generate replacement household statement
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
        {priorStatementIdentifier} stays VOIDED. Its record and PDF are retained
        for audit. A replacement is generated from current official household
        records and stays private until another authorized person reviews and
        publishes it.
      </p>
      <button
        type="button"
        onClick={openDialog}
        className="mt-4 rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        Generate replacement household statement
      </button>
      <dialog
        ref={dialogRef}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-[var(--bits-border)] bg-white p-0 shadow-xl"
        aria-labelledby={titleId}
      >
        <div className="px-5 py-4">
          <h2
            id={titleId}
            className="text-lg font-semibold text-[var(--bits-navy)]"
          >
            Generate replacement household statement?
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            {priorStatementIdentifier} stays VOIDED and is retained for audit.
            The replacement is generated but not published, remains private, and
            a different authorized person must review and publish it before it
            is available in the member portal.
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
            {isPending
              ? "Generating…"
              : "Generate replacement household statement"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
