"use client";

import { useActionState } from "react";

import {
  retryStaffInvitationAction,
  revokeStaffInvitationAction,
} from "@/app/(staff)/administration/staff-access/actions";
import { STAFF_INVITATION_REAPPROVE_COPY } from "@/lib/validation/staff-invitation";
import type { StaffInvitationDirectoryRow } from "@/server/services/staff-invitation.service";

const buttonClass =
  "rounded-lg border border-[var(--bits-border)] px-3 py-1 text-sm font-medium text-[var(--bits-navy)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function InvitationRetryForm({ row }: { row: StaffInvitationDirectoryRow }) {
  const [state, action, pending] = useActionState(retryStaffInvitationAction, {
    message: "",
  });
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="invitationId" value={row.invitationId} />
      <input type="hidden" name="expectedVersion" value={String(row.version)} />
      {row.needsReapproval ? (
        <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
          <input type="checkbox" name="reapprove" value="on" className="mt-1" />
          <span>{STAFF_INVITATION_REAPPROVE_COPY}</span>
        </label>
      ) : null}
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="confirm" value="on" className="mt-1" />
        <span>Retry provider delivery for {row.email}.</span>
      </label>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Retrying…" : "Retry invitation"}
      </button>
      {state.message ? (
        <p role="alert" className="text-sm text-rose-800">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function InvitationRevokeForm({ row }: { row: StaffInvitationDirectoryRow }) {
  const [state, action, pending] = useActionState(revokeStaffInvitationAction, {
    message: "",
  });
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="invitationId" value={row.invitationId} />
      <input type="hidden" name="expectedVersion" value={String(row.version)} />
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="confirm" value="on" className="mt-1" />
        <span>Revoke this invitation immediately.</span>
      </label>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Revoking…" : "Revoke invitation"}
      </button>
      {state.message ? (
        <p role="alert" className="text-sm text-rose-800">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function StaffInvitationList({
  rows,
}: {
  rows: StaffInvitationDirectoryRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
        No invitations match this view.
      </p>
    );
  }

  return (
    <ul className="mt-4 grid gap-3">
      {rows.map((row) => (
        <li
          key={row.invitationId}
          className="rounded-xl border border-[var(--bits-border)] p-4"
        >
          <p className="font-semibold text-[var(--bits-navy)]">{row.email}</p>
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            {row.roleCode} · {row.statusLabel}
          </p>
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            Invited {row.createdOnLabel} · Expires {row.expiresOnLabel}
          </p>
          {row.lastProviderErrorRedacted ? (
            <p className="mt-1 text-sm text-rose-800">
              Provider: {row.lastProviderErrorRedacted}
            </p>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {row.canRetry ? <InvitationRetryForm row={row} /> : null}
            {row.canRevoke ? <InvitationRevokeForm row={row} /> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
