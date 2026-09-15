"use client";

import { useId, useRef, useState, useTransition } from "react";

import { generateHouseholdContributionStatementAction } from "@/app/(staff)/statements/households/[householdId]/actions";

export function GenerateHouseholdStatementButton({
  householdId,
  year,
}: {
  householdId: string;
  year: number;
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
    <div className="print-hidden rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
      <button
        type="button"
        onClick={openDialog}
        className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        Generate official household statement
      </button>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
        This creates an official household PDF and a generated record. It is{" "}
        <strong className="font-semibold text-[var(--bits-navy)]">
          generated but not published
        </strong>
        , stays private, and cannot yet be viewed by household members.
      </p>
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
            Generate official household statement?
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            This saves an official household contribution statement for {year}.
            It is generated but not published, remains private, and cannot yet
            be viewed by household members. A later separate approval step is
            required before the authorized preferred recipient can see it.
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
            {isPending ? "Generating…" : "Generate official household statement"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
