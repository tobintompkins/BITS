"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  endGivingHouseholdMembershipAction,
  linkGivingHouseholdDonorAction,
  moveGivingHouseholdDonorAction,
  searchGivingHouseholdMoveTargetsAction,
  searchUnassignedGivingDonorsAction,
} from "@/app/(staff)/giving-households/actions";
import { GivingHouseholdSearchPicker } from "@/components/giving-households/giving-household-search-picker";
import {
  formatDateOnly,
  GIVING_HOUSEHOLD_BACKDATE_COPY,
  GIVING_HOUSEHOLD_CORRECTION_COPY,
  GIVING_HOUSEHOLD_END_DATE_COPY,
  type GivingHouseholdPickerState,
} from "@/lib/validation/giving-household";

const fieldClass =
  "mt-1 block w-full rounded-lg border border-[var(--bits-border)] bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const buttonClass =
  "mt-3 rounded-lg bg-[var(--bits-navy)] px-4 py-2 text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

type MembershipRow = {
  id: string;
  donorId: string;
  startDate: Date | string;
  endDate: Date | string | null;
  relationshipLabel: string | null;
  updatedAt: Date | string;
  donor: {
    id: string;
    firstName: string;
    lastName: string;
    active: boolean;
    userAccountId: string | null;
  };
};

function asDateOnly(value: Date | string) {
  return typeof value === "string" ? value.slice(0, 10) : formatDateOnly(value);
}

function asIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export function GivingHouseholdMembershipPanel({
  organizationId,
  householdId,
  canEdit,
  canBackdate,
  churchToday,
  memberships,
  unassignedDonors,
  moveTargets,
}: {
  organizationId: string;
  householdId: string;
  canEdit: boolean;
  canBackdate: boolean;
  churchToday: string;
  memberships: MembershipRow[];
  unassignedDonors: GivingHouseholdPickerState;
  moveTargets: GivingHouseholdPickerState;
}) {
  const [linkState, linkAction, linkPending] = useActionState(
    linkGivingHouseholdDonorAction.bind(null, organizationId, householdId),
    { message: "" },
  );
  const [moveState, moveAction, movePending] = useActionState(
    moveGivingHouseholdDonorAction.bind(null, organizationId),
    { message: "" },
  );
  const [endState, endAction, endPending] = useActionState(
    endGivingHouseholdMembershipAction.bind(null, organizationId),
    { message: "" },
  );

  const openMemberships = memberships.filter((row) => !row.endDate);
  const historical = memberships.filter((row) => row.endDate);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Current members
        </h2>
        <p className="mt-2 text-sm text-[var(--bits-muted)]">
          Open memberships have no end date. Dates are inclusive. Church today
          is {churchToday}.
        </p>
        {openMemberships.length ? (
          <ul className="mt-4 space-y-3">
            {openMemberships.map((row) => (
              <li key={row.id} className="rounded-lg border p-3">
                <Link
                  href={`/donors/${row.donor.id}`}
                  className="font-medium underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  {row.donor.lastName}, {row.donor.firstName}
                </Link>
                <p className="text-sm text-[var(--bits-muted)]">
                  Started {asDateOnly(row.startDate)}
                  {row.relationshipLabel ? ` · ${row.relationshipLabel}` : ""}
                  {row.donor.userAccountId ? "" : " · No portal account"}
                  {row.donor.active ? "" : " · Inactive donor"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm">No current members.</p>
        )}
      </section>

      {canEdit ? (
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6">
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Link a donor
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <GivingHouseholdSearchPicker
              name="donorId"
              label="Donor without a current giving household"
              emptyLabel="Select a donor"
              selectionFormId="link-giving-household-donor"
              searchAction={searchUnassignedGivingDonorsAction.bind(
                null,
                organizationId,
              )}
              initial={unassignedDonors}
            />
          <form
            id="link-giving-household-donor"
            action={linkAction}
            className="contents"
          >
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Start date
              <input
                type="date"
                name="startDate"
                required
                defaultValue={churchToday}
                max={churchToday}
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Relationship label
              <input name="relationshipLabel" maxLength={40} className={fieldClass} />
            </label>
            {canBackdate ? (
              <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
                <input type="checkbox" name="confirmBackdate" className="mr-2" />
                {GIVING_HOUSEHOLD_BACKDATE_COPY}
              </label>
            ) : (
              <p className="text-sm text-[var(--bits-muted)] sm:col-span-2">
                Data-entry staff can only use today&apos;s church date.
              </p>
            )}
            <p role="status" aria-live="polite" className="text-sm sm:col-span-2">
              {linkState.message}
            </p>
            <button
              disabled={linkPending || (!unassignedDonors.rows.length && !unassignedDonors.total)}
              className={buttonClass}
            >
              {linkPending ? "Saving…" : "Link donor"}
            </button>
          </form>
          </div>
        </section>
      ) : null}

      {canEdit && openMemberships.length ? (
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6">
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Move a donor
          </h2>
          <p className="mt-2 text-sm text-[var(--bits-muted)]">
            {GIVING_HOUSEHOLD_CORRECTION_COPY}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <GivingHouseholdSearchPicker
              name="toHouseholdId"
              label="Destination household"
              emptyLabel="Select a household"
              selectionFormId="move-giving-household-donor"
              searchAction={searchGivingHouseholdMoveTargetsAction.bind(
                null,
                organizationId,
                householdId,
              )}
              initial={moveTargets}
            />
          <form
            id="move-giving-household-donor"
            action={moveAction}
            className="contents"
          >
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Current member
              <select name="currentMembershipId" required className={fieldClass}>
                {openMemberships.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.donor.lastName}, {row.donor.firstName}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="fromHouseholdId" value={householdId} />
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Effective date
              <input
                type="date"
                name="effectiveDate"
                required
                defaultValue={churchToday}
                max={churchToday}
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Relationship label
              <input name="relationshipLabel" maxLength={40} className={fieldClass} />
            </label>
            {canBackdate ? (
              <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
                <input type="checkbox" name="confirmBackdate" className="mr-2" />
                {GIVING_HOUSEHOLD_BACKDATE_COPY}
              </label>
            ) : null}
            <p role="status" aria-live="polite" className="text-sm sm:col-span-2">
              {moveState.message}
            </p>
            <button
              disabled={movePending || (!moveTargets.rows.length && !moveTargets.total)}
              className={buttonClass}
            >
              {movePending ? "Saving…" : "Move donor"}
            </button>
          </form>
          </div>
        </section>
      ) : null}

      {canEdit && openMemberships.length ? (
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6">
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            End a membership
          </h2>
          <p className="mt-2 text-sm text-[var(--bits-muted)]">
            {GIVING_HOUSEHOLD_END_DATE_COPY}
          </p>
          <form action={endAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Current member
              <select name="membershipToken" required className={fieldClass}>
                {openMemberships.map((row) => (
                  <option
                    key={row.id}
                    value={`${row.id}::${asIso(row.updatedAt)}`}
                  >
                    {row.donor.lastName}, {row.donor.firstName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Last included day
              <input
                type="date"
                name="endDate"
                required
                defaultValue={churchToday}
                max={churchToday}
                className={fieldClass}
              />
            </label>
            {canBackdate ? (
              <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
                <input type="checkbox" name="confirmBackdate" className="mr-2" />
                {GIVING_HOUSEHOLD_BACKDATE_COPY}
              </label>
            ) : null}
            <p role="status" aria-live="polite" className="text-sm sm:col-span-2">
              {endState.message}
            </p>
            <button disabled={endPending} className={buttonClass}>
              {endPending ? "Saving…" : "End membership"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Membership history
        </h2>
        {historical.length ? (
          <ul className="mt-4 space-y-2">
            {historical.map((row) => (
              <li key={row.id} className="text-sm">
                <Link className="underline" href={`/donors/${row.donor.id}`}>
                  {row.donor.lastName}, {row.donor.firstName}
                </Link>
                {` · ${asDateOnly(row.startDate)} through ${asDateOnly(row.endDate!)}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm">No ended memberships yet.</p>
        )}
      </section>
    </div>
  );
}
