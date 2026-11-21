"use client";

import { useActionState, useMemo, useState } from "react";

import { updateStaffMembershipAction } from "@/app/(staff)/administration/staff-access/actions";
import {
  STAFF_ACCESS_DIRECTORY_ROLE_LABELS,
  type StaffAccessDirectoryRow,
} from "@/lib/validation/staff-access-directory";
import {
  STAFF_MEMBERSHIP_ADMIN_GRANT_COPY,
  STAFF_MEMBERSHIP_ADMIN_ROLE_CODES,
  STAFF_MEMBERSHIP_BASIC_CONFIRM_COPY,
  STAFF_MEMBERSHIP_DEACTIVATE_CONFIRM_COPY,
  STAFF_MEMBERSHIP_REACTIVATE_CONFIRM_COPY,
  STAFF_MEMBERSHIP_REMOVE_CONFIRM_COPY,
  STAFF_MEMBERSHIP_ROLE_CONFIRM_COPY,
  type StaffMembershipIntent,
} from "@/lib/validation/staff-membership-admin";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const buttonClass =
  "rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

const ACCESS_LABELS = {
  ...STAFF_ACCESS_DIRECTORY_ROLE_LABELS,
  DONOR: "Basic user",
} as const;

export function StaffMembershipEditForm({
  row,
}: {
  row: StaffAccessDirectoryRow;
}) {
  const [state, action, pending] = useActionState(updateStaffMembershipAction, {
    message: "",
  });
  const [intent, setIntent] = useState<StaffMembershipIntent>("change-access");
  const [roleCode, setRoleCode] = useState(
    row.roleCode === "DONOR" ? "DONOR" : row.roleCode,
  );
  const removed = row.membershipStatusLabel === "Removed";
  const suspended = row.membershipStatusLabel === "Suspended";
  const summary = useMemo(() => {
    if (intent === "suspend") {
      return `${row.displayName} keeps the ${ACCESS_LABELS[roleCode as keyof typeof ACCESS_LABELS] ?? row.roleName} record, but this church stays closed until you restore access.`;
    }
    if (intent === "restore") {
      return `Restore ${row.displayName} to ${row.roleName} for this church.`;
    }
    if (intent === "remove") {
      return `Remove ${row.displayName} from this church. Their sign-in, gifts, statements, and audit history stay.`;
    }
    if (roleCode === "DONOR") {
      return `${row.displayName} becomes a basic user. They can sign in and use personal features, with no staff access.`;
    }
    return `Change ${row.displayName} to ${ACCESS_LABELS[roleCode as keyof typeof ACCESS_LABELS] ?? roleCode}.`;
  }, [intent, roleCode, row.displayName, row.roleName]);
  const confirmCopy =
    intent === "remove"
      ? STAFF_MEMBERSHIP_REMOVE_CONFIRM_COPY
      : intent === "suspend"
        ? STAFF_MEMBERSHIP_DEACTIVATE_CONFIRM_COPY
        : intent === "restore"
          ? STAFF_MEMBERSHIP_REACTIVATE_CONFIRM_COPY
          : roleCode === "DONOR" && row.roleCode !== "DONOR"
            ? STAFF_MEMBERSHIP_BASIC_CONFIRM_COPY
            : STAFF_MEMBERSHIP_ROLE_CONFIRM_COPY;

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="membershipId" value={row.membershipId} />
      <input type="hidden" name="expectedVersion" value={String(row.version)} />
      <input type="hidden" name="expectedUpdatedAt" value={row.updatedAt} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="active" value={intent === "suspend" || intent === "remove" ? "false" : "true"} />
      <p className="text-sm text-[var(--bits-navy)]">
        Current: {row.roleName} · {row.membershipStatusLabel}
      </p>
      <label className="block text-sm font-medium text-[var(--bits-navy)]">
        Action for {row.displayName}
        <select
          value={intent}
          onChange={(event) => setIntent(event.target.value as StaffMembershipIntent)}
          className={fieldClass}
          disabled={pending}
        >
          <option value="change-access">Change access</option>
          {suspended ? <option value="restore">Restore church access</option> : null}
          {removed ? null : <option value="suspend">Suspend church access</option>}
          {removed ? null : <option value="remove">Remove from this church</option>}
        </select>
      </label>
      {intent === "change-access" ? (
        <label className="block text-sm font-medium text-[var(--bits-navy)]">
          Access for {row.displayName}
          <select
            name="roleCode"
            value={roleCode}
            onChange={(event) => setRoleCode(event.target.value)}
            className={fieldClass}
            disabled={pending}
          >
            {STAFF_MEMBERSHIP_ADMIN_ROLE_CODES.map((code) => (
              <option key={code} value={code}>
                {ACCESS_LABELS[code]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="roleCode" value={row.roleCode} />
      )}
      <p className="text-sm text-[var(--bits-muted)]">{summary}</p>
      {intent === "change-access" && roleCode === "ORG_ADMIN" && row.roleCode !== "ORG_ADMIN" ? (
        <p className="text-sm text-[var(--bits-navy)]">{STAFF_MEMBERSHIP_ADMIN_GRANT_COPY}</p>
      ) : null}
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="confirm" value="on" className="mt-1" disabled={pending} />
        <span>{confirmCopy}</span>
      </label>
      <button type="submit" className={buttonClass} disabled={pending || (removed && intent !== "change-access")}>
        {pending ? "Saving…" : `Save access for ${row.displayName}`}
      </button>
      {state.message ? (
        <p role="alert" className={state.ok ? "text-sm text-[var(--bits-navy)]" : "text-sm text-rose-800"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
