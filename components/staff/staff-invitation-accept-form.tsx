"use client";

import { useActionState } from "react";

import { acceptStaffInvitationAction } from "@/app/staff-invitations/accept/actions";

const buttonClass =
  "rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function StaffInvitationAcceptForm({
  invitationId,
  summary,
}: {
  invitationId: string;
  summary: string;
}) {
  const [state, action, pending] = useActionState(acceptStaffInvitationAction, {
    message: "",
  });

  return (
    <form action={action} className="space-y-3 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
      <input type="hidden" name="invitationId" value={invitationId} />
      <p className="text-sm text-[var(--bits-navy)]">{summary}</p>
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="confirm" value="on" className="mt-1" />
        <span>I accept the approved staff role for this church.</span>
      </label>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Accepting…" : "Accept staff access"}
      </button>
      {state.message ? (
        <p
          role="alert"
          className={
            state.ok
              ? "text-sm text-[var(--bits-navy)]"
              : "text-sm text-rose-800"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
