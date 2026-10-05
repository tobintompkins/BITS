"use client";

import Link from "next/link";
import { useActionState } from "react";

import { saveGivingHouseholdAction } from "@/app/(staff)/giving-households/actions";
import {
  emptyGivingHousehold,
  formatGivingHouseholdDelivery,
  GIVING_HOUSEHOLD_ADDRESS_MAX,
  GIVING_HOUSEHOLD_DELIVERY_METHODS,
  GIVING_HOUSEHOLD_DELIVERY_LABELS,
  GIVING_HOUSEHOLD_DIRECTORY_COPY,
  GIVING_HOUSEHOLD_HISTORY_COPY,
  GIVING_HOUSEHOLD_NAME_MAX,
  type GivingHouseholdFormValues,
} from "@/lib/validation/giving-household";

const fieldClass =
  "mt-1 block w-full rounded-lg border border-[var(--bits-border)] bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const buttonClass =
  "rounded-lg bg-[var(--bits-navy)] px-4 py-2 text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function GivingHouseholdForm({
  organizationId,
  id = null,
  values = emptyGivingHousehold,
  expectedUpdatedAt = null,
  canAssignFinancial = false,
  canViewHouseholdStatements = false,
  eligibleDonors = [],
  needsRecipientReview = false,
}: {
  organizationId: string;
  id?: string | null;
  values?: GivingHouseholdFormValues;
  expectedUpdatedAt?: string | null;
  canAssignFinancial?: boolean;
  canViewHouseholdStatements?: boolean;
  eligibleDonors?: Array<{ id: string; firstName: string; lastName: string }>;
  needsRecipientReview?: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveGivingHouseholdAction.bind(null, organizationId, id, expectedUpdatedAt),
    { message: "", values },
  );
  const current = state.values ?? values;

  return (
    <form
      action={action}
      className="space-y-5 rounded-2xl border border-[var(--bits-border)] bg-white p-6"
    >
      <p className="text-sm leading-6 text-[var(--bits-muted)]">
        {GIVING_HOUSEHOLD_DIRECTORY_COPY} {GIVING_HOUSEHOLD_HISTORY_COPY}
      </p>
      {needsRecipientReview ? (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          This giving household needs a preferred statement recipient before
          household statements can be mailed or opened in the portal.
        </p>
      ) : null}
      <fieldset
        key={state.message}
        disabled={pending}
        className="grid gap-4 sm:grid-cols-2"
      >
        <legend className="sr-only">Giving household details</legend>
        <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
          Display name
          <input
            name="displayName"
            required
            maxLength={GIVING_HOUSEHOLD_NAME_MAX}
            defaultValue={current.displayName}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
          Mailing address
          <input
            name="mailingAddressLine1"
            required
            maxLength={GIVING_HOUSEHOLD_ADDRESS_MAX}
            defaultValue={current.mailingAddressLine1}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
          Address line 2
          <input
            name="mailingAddressLine2"
            maxLength={GIVING_HOUSEHOLD_ADDRESS_MAX}
            defaultValue={current.mailingAddressLine2}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          City
          <input
            name="city"
            required
            maxLength={80}
            defaultValue={current.city}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          State
          <input
            name="state"
            required
            maxLength={40}
            defaultValue={current.state}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Postal code
          <input
            name="postalCode"
            required
            maxLength={20}
            defaultValue={current.postalCode}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Country
          <input
            name="country"
            required
            maxLength={80}
            defaultValue={current.country}
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Statement delivery
          <select
            name="statementDeliveryMethod"
            defaultValue={current.statementDeliveryMethod}
            className={fieldClass}
          >
            <option value="">Not set</option>
            {GIVING_HOUSEHOLD_DELIVERY_METHODS.map((method) => (
              <option key={method} value={method}>
                {GIVING_HOUSEHOLD_DELIVERY_LABELS[method]}
              </option>
            ))}
          </select>
        </label>
        {canAssignFinancial ? (
          <>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Primary donor
              <select
                name="primaryDonorId"
                defaultValue={current.primaryDonorId}
                className={fieldClass}
              >
                <option value="">Not set</option>
                {eligibleDonors.map((donor) => (
                  <option key={donor.id} value={donor.id}>
                    {donor.lastName}, {donor.firstName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Preferred statement recipient
              <select
                name="preferredStatementRecipientId"
                defaultValue={current.preferredStatementRecipientId}
                className={fieldClass}
              >
                <option value="">Not set</option>
                {eligibleDonors.map((donor) => (
                  <option key={donor.id} value={donor.id}>
                    {donor.lastName}, {donor.firstName}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <input type="hidden" name="primaryDonorId" value={current.primaryDonorId} />
            <input
              type="hidden"
              name="preferredStatementRecipientId"
              value={current.preferredStatementRecipientId}
            />
            <p className="text-sm text-[var(--bits-muted)] sm:col-span-2">
              Primary donor and preferred statement recipient can be changed only
              by an administrator or treasurer.
              {current.preferredStatementRecipientId
                ? ""
                : " A preferred recipient is not set."}
            </p>
          </>
        )}
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          <input
            type="checkbox"
            name="active"
            defaultChecked={current.active}
            className="mr-2"
          />
          Active
        </label>
      </fieldset>
      <p role="status" aria-live="polite" className="text-sm">
        {state.message}
      </p>
      {state.savedId ? (
        <Link
          href={`/giving-households/${state.savedId}`}
          className="block underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          View saved giving household
        </Link>
      ) : null}
      {id && canViewHouseholdStatements ? (
        <Link
          href={`/statements/households/${id}`}
          className="block underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Open household statement preview
        </Link>
      ) : null}
      <p className="text-xs text-[var(--bits-muted)]">
        Current delivery method: {formatGivingHouseholdDelivery(current.statementDeliveryMethod)}
      </p>
      <button disabled={pending || (!id && Boolean(state.savedId))} className={buttonClass}>
        {pending ? "Saving…" : "Save giving household"}
      </button>
      <Link
        href="/giving-households"
        className="ml-4 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        Back to giving households
      </Link>
    </form>
  );
}
