"use client";

import { useState } from "react";

import { cancelMemberRegistrationAction } from "@/app/(portal)/portal/events/actions";

export function CancelMemberRegistrationForm({
  registrationId,
  view,
  status,
  page,
}: {
  registrationId: string;
  view: string;
  status: string;
  page: number;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-[var(--bits-border)] px-3 py-1.5 text-sm font-semibold text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        Cancel registration
      </button>
    );
  }

  return (
    <form
      action={cancelMemberRegistrationAction}
      className="grid max-w-sm gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
    >
      <input type="hidden" name="registrationId" value={registrationId} />
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="page" value={String(page)} />
      <p className="text-sm leading-6 text-amber-950">
        Cancellation depends on the event’s church-set deadline and cannot be
        undone from the portal.
      </p>
      <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
        Reason (optional)
        <textarea
          name="reason"
          maxLength={500}
          rows={3}
          className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm font-normal"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-xl bg-[var(--bits-navy)] px-3 py-1.5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Confirm cancellation
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Keep registration
        </button>
      </div>
    </form>
  );
}
