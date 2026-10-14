"use client";

import { useActionState, useMemo, useState } from "react";

import { updateStaffMembershipAction } from "@/app/(staff)/administration/staff-access/actions";
import {
  STAFF_ACCESS_DIRECTORY_ROLE_CODES,
  STAFF_ACCESS_DIRECTORY_ROLE_LABELS,
  type StaffAccessDirectoryRow,
} from "@/lib/validation/staff-access-directory";
import {
  STAFF_MEMBERSHIP_ADMIN_GRANT_COPY,
  STAFF_MEMBERSHIP_DEACTIVATE_CONFIRM_COPY,
  STAFF_MEMBERSHIP_REACTIVATE_CONFIRM_COPY,
  STAFF_MEMBERSHIP_ROLE_CONFIRM_COPY,
  intendedStaffMembershipSummary,
} from "@/lib/validation/staff-membership-admin";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const buttonClass =
  "rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function StaffMembershipEditForm({
  row,
}: {
  row: StaffAccessDirectoryRow;
}) {
  const [state, action, pending] = useActionState(updateStaffMembershipAction, {
    message: "",
  });
  const [roleCode, setRoleCode] = useState(row.roleCode);
  const [active, setActive] = useState(row.membershipActive ? "true" : "false");
  const nextActive = active === "true";
  const summary = useMemo(
    () =>
      intendedStaffMembershipSummary({
        currentRole: row.roleCode,
        currentActive: row.membershipActive,
        nextRole: roleCode,
        nextActive,
      }),
    [row.roleCode, row.membershipActive, roleCode, nextActive],
  );
  const confirmCopy = !nextActive
    ? STAFF_MEMBERSHIP_DEACTIVATE_CONFIRM_COPY
    : row.membershipActive !== nextActive
      ? STAFF_MEMBERSHIP_REACTIVATE_CONFIRM_COPY
      : STAFF_MEMBERSHIP_ROLE_CONFIRM_COPY;

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="membershipId" value={row.membershipId} />
      <input type="hidden" name="expectedVersion" value={String(row.version)} />
      <input type="hidden" name="expectedUpdatedAt" value={row.updatedAt} />
      <p className="text-sm text-[var(--bits-navy)]">
        Current: {row.roleName} · {row.membershipStatusLabel}
      </p>
      <label className="block text-sm font-medium text-[var(--bits-navy)]">
        Intended role
        <select
          name="roleCode"
          value={roleCode}
          onChange={(event) => setRoleCode(event.target.value)}
          className={fieldClass}
          disabled={pending}
        >
          {STAFF_ACCESS_DIRECTORY_ROLE_CODES.map((code) => (
            <option key={code} value={code}>
              {STAFF_ACCESS_DIRECTORY_ROLE_LABELS[code]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-[var(--bits-navy)]">
        Intended status
        <select
          name="active"
          value={active}
          onChange={(event) => setActive(event.target.value)}
          className={fieldClass}
          disabled={pending}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </label>
      <p className="text-sm text-[var(--bits-muted)]">{summary}</p>
      {roleCode === "ORG_ADMIN" && row.roleCode !== "ORG_ADMIN" ? (
        <p className="text-sm text-[var(--bits-navy)]">
          {STAFF_MEMBERSHIP_ADMIN_GRANT_COPY}
        </p>
      ) : null}
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input
          type="checkbox"
          name="confirm"
          value="on"
          className="mt-1"
          disabled={pending}
        />
        <span>{confirmCopy}</span>
      </label>
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : "Save membership"}
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
