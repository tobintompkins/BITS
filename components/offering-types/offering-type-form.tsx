"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  saveOfferingTypeAction,
  setOfferingTypeActiveAction,
} from "@/app/(staff)/offering-types/actions";
import {
  emptyOfferingType,
  OFFERING_TYPE_CODE_LOCK_COPY,
  OFFERING_TYPE_CODE_MAX,
  OFFERING_TYPE_DEACTIVATE_CONFIRM_COPY,
  OFFERING_TYPE_DESCRIPTION_MAX,
  OFFERING_TYPE_DIRECTORY_COPY,
  OFFERING_TYPE_HISTORY_COPY,
  OFFERING_TYPE_NAME_MAX,
  OFFERING_TYPE_REACTIVATE_CONFIRM_COPY,
  OFFERING_TYPE_STRIPE_ALLOWLIST_COPY,
  type OfferingTypeFormValues,
} from "@/lib/validation/offering-type";

const fieldClass =
  "mt-1 block w-full rounded-lg border border-[var(--bits-border)] bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const buttonClass =
  "rounded-lg bg-[var(--bits-navy)] px-4 py-2 text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const secondaryButtonClass =
  "mt-4 rounded-lg border border-[var(--bits-navy)] px-4 py-2 text-[var(--bits-navy)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function OfferingTypeForm({
  organizationId,
  id = null,
  values = emptyOfferingType,
  expectedUpdatedAt = null,
  codeLocked = false,
  allocationCount = 0,
}: {
  organizationId: string;
  id?: string | null;
  values?: OfferingTypeFormValues;
  expectedUpdatedAt?: string | null;
  codeLocked?: boolean;
  allocationCount?: number;
}) {
  const [state, action, pending] = useActionState(
    saveOfferingTypeAction.bind(null, organizationId, id, expectedUpdatedAt),
    { message: "", values },
  );
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(
    setOfferingTypeActiveAction.bind(
      null,
      organizationId,
      id ?? "",
      false,
      expectedUpdatedAt ?? "",
    ),
    { message: "" },
  );
  const [reactivateState, reactivateAction, reactivatePending] = useActionState(
    setOfferingTypeActiveAction.bind(
      null,
      organizationId,
      id ?? "",
      true,
      expectedUpdatedAt ?? "",
    ),
    { message: "" },
  );
  const current = state.values ?? values;

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-5 rounded-2xl border border-[var(--bits-border)] bg-white p-6">
        <p className="text-sm leading-6 text-[var(--bits-muted)]">
          {OFFERING_TYPE_DIRECTORY_COPY} {OFFERING_TYPE_HISTORY_COPY}
        </p>
        <fieldset
          key={state.message}
          disabled={pending}
          className="grid gap-4 sm:grid-cols-2"
        >
          <legend className="sr-only">Offering type details</legend>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Name
            <input
              name="name"
              required
              maxLength={OFFERING_TYPE_NAME_MAX}
              defaultValue={current.name}
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Display order
            <input
              name="displayOrder"
              inputMode="numeric"
              required
              defaultValue={current.displayOrder}
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
            Description
            <textarea
              name="description"
              maxLength={OFFERING_TYPE_DESCRIPTION_MAX}
              defaultValue={current.description}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
            Integration code
            <input
              name="code"
              maxLength={OFFERING_TYPE_CODE_MAX}
              defaultValue={current.code}
              readOnly={codeLocked}
              className={fieldClass}
            />
            <span className="mt-1 block text-xs font-normal text-[var(--bits-muted)]">
              {codeLocked
                ? OFFERING_TYPE_CODE_LOCK_COPY
                : "Leave blank if this fund does not use an integration code. New codes are stored in uppercase."}
            </span>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            <input
              type="checkbox"
              name="defaultTaxDeductible"
              defaultChecked={current.defaultTaxDeductible}
              className="mr-2"
            />
            Normally tax-deductible
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            <input
              type="checkbox"
              name="onlineGivingEnabled"
              defaultChecked={current.onlineGivingEnabled}
              className="mr-2"
            />
            Available for online giving
          </label>
          <input type="hidden" name="active" defaultValue={current.active ? "on" : ""} />
          <p className="text-xs leading-5 text-[var(--bits-muted)] sm:col-span-2">
            {OFFERING_TYPE_STRIPE_ALLOWLIST_COPY}
          </p>
        </fieldset>
        <p role="status" aria-live="polite" className="text-sm">
          {state.message}
        </p>
        {state.savedId ? (
          <Link
            href={`/offering-types/${state.savedId}`}
            className="block underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            View saved offering type
          </Link>
        ) : null}
        <button
          disabled={pending || (!id && Boolean(state.savedId))}
          className={buttonClass}
        >
          {pending ? "Saving…" : "Save offering type"}
        </button>
        <Link
          href="/offering-types"
          className="ml-4 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Back to offering types
        </Link>
      </form>

      {id && current.active ? (
        <form
          action={deactivateAction}
          className="rounded-2xl border border-[var(--bits-border)] bg-white p-6"
        >
          <p className="text-sm text-[var(--bits-muted)]">
            Deactivating stops this fund from new gift and checkout entry.
            Existing allocations stay linked.
            {allocationCount
              ? ` ${allocationCount} recorded allocation${allocationCount === 1 ? "" : "s"} remain on file.`
              : ""}
          </p>
          <label className="mt-4 block text-sm font-medium text-[var(--bits-navy)]">
            <input type="checkbox" name="confirm" required className="mr-2" />
            {OFFERING_TYPE_DEACTIVATE_CONFIRM_COPY}
          </label>
          <p role="status" aria-live="polite" className="mt-2 text-sm">
            {deactivateState.message}
          </p>
          <button disabled={deactivatePending} className={secondaryButtonClass}>
            {deactivatePending ? "Saving…" : "Deactivate offering type"}
          </button>
        </form>
      ) : null}
      {id && !current.active ? (
        <form
          action={reactivateAction}
          className="rounded-2xl border border-[var(--bits-border)] bg-white p-6"
        >
          <p className="text-sm text-[var(--bits-muted)]">
            Reactivating makes this fund available for new gift entry again.
            {allocationCount
              ? ` ${allocationCount} recorded allocation${allocationCount === 1 ? "" : "s"} remain on file.`
              : ""}
          </p>
          <label className="mt-4 block text-sm font-medium text-[var(--bits-navy)]">
            <input type="checkbox" name="confirm" required className="mr-2" />
            {OFFERING_TYPE_REACTIVATE_CONFIRM_COPY}
          </label>
          <p role="status" aria-live="polite" className="mt-2 text-sm">
            {reactivateState.message}
          </p>
          <button disabled={reactivatePending} className={secondaryButtonClass}>
            {reactivatePending ? "Saving…" : "Reactivate offering type"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
