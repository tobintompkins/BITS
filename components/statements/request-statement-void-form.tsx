"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { requestStatementVoidAction } from "@/app/(staff)/statements/registry/[id]/actions";

export function RequestStatementVoidForm({
  statementIdentifier,
  statementId,
}: {
  statementIdentifier: string;
  statementId: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestStatementVoidAction({
        statementId,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setReason("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm"
    >
      <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
        Request statement void
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
        Use this only if {statementIdentifier} was generated or published in
        error.
      </p>
      <p className="mt-2 text-sm font-medium leading-6 text-[var(--bits-navy)]">
        This does not void the statement now. Another authorized person must
        review the request.
      </p>
      <label className="mt-4 grid gap-1 text-sm">
        <span className="font-medium text-[var(--bits-navy)]">
          Reason for the void request
        </span>
        <textarea
          name="reason"
          required
          minLength={10}
          maxLength={1000}
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="mt-4 rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        {isPending ? "Submitting…" : "Request statement void"}
      </button>
    </form>
  );
}
