"use client";

import { useActionState, useMemo, useState } from "react";

import { createStaffInvitationAction } from "@/app/(staff)/administration/staff-access/actions";
import {
  STAFF_INVITATION_ADMIN_CONFIRM_COPY,
  STAFF_INVITATION_CONFIRM_COPY,
  STAFF_INVITATION_ROLE_CODES,
  STAFF_INVITATION_ROLE_LABELS,
  intendedStaffInvitationSummary,
} from "@/lib/validation/staff-invitation";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const buttonClass =
  "rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function StaffInvitationForm({ churchName }: { churchName: string }) {
  const [state, action, pending] = useActionState(createStaffInvitationAction, {
    message: "",
  });
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState<(typeof STAFF_INVITATION_ROLE_CODES)[number]>(
    "TREASURER",
  );
  const summary = useMemo(
    () => intendedStaffInvitationSummary({ email, churchName, roleCode }),
    [email, churchName, roleCode],
  );

  return (
    <form action={action} className="mt-4 space-y-3">
      <label className="block text-sm font-medium text-[var(--bits-navy)]">
        Recipient email
        <input
          name="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
          maxLength={254}
          disabled={pending}
          required
        />
      </label>
      <label className="block text-sm font-medium text-[var(--bits-navy)]">
        Approved staff role
        <select
          name="roleCode"
          value={roleCode}
          onChange={(event) =>
            setRoleCode(
              event.target.value as (typeof STAFF_INVITATION_ROLE_CODES)[number],
            )
          }
          className={fieldClass}
          disabled={pending}
        >
          {STAFF_INVITATION_ROLE_CODES.map((code) => (
            <option key={code} value={code}>
              {STAFF_INVITATION_ROLE_LABELS[code]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-[var(--bits-muted)]">{summary}</p>
      {roleCode === "ORG_ADMIN" ? (
        <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
          <input
            type="checkbox"
            name="confirmAdmin"
            value="on"
            className="mt-1"
            disabled={pending}
          />
          <span>{STAFF_INVITATION_ADMIN_CONFIRM_COPY}</span>
        </label>
      ) : null}
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input
          type="checkbox"
          name="confirm"
          value="on"
          className="mt-1"
          disabled={pending}
        />
        <span>{STAFF_INVITATION_CONFIRM_COPY}</span>
      </label>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Authorizing…" : "Send staff invitation"}
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
