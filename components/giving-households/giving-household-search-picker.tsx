"use client";

import { useActionState } from "react";

import {
  GIVING_HOUSEHOLD_PICKER_PAGE_SIZE,
  GIVING_HOUSEHOLD_SEARCH_MAX,
  type GivingHouseholdPickerState,
} from "@/lib/validation/giving-household";

const fieldClass =
  "mt-1 block w-full rounded-lg border border-[var(--bits-border)] bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function GivingHouseholdSearchPicker({
  name,
  label,
  emptyLabel,
  searchAction,
  initial,
  selectionFormId,
}: {
  name: string;
  label: string;
  emptyLabel: string;
  searchAction: (
    previous: GivingHouseholdPickerState,
    form: FormData,
  ) => Promise<GivingHouseholdPickerState>;
  initial: GivingHouseholdPickerState;
  selectionFormId: string;
}) {
  const [state, action, pending] = useActionState(searchAction, initial);
  const selectedStillPresent = state.rows.some((row) => row.id === state.selectedId);
  const pageSize = GIVING_HOUSEHOLD_PICKER_PAGE_SIZE;
  const hasPrevious = state.page > 1;
  const hasNext = state.page * pageSize < state.total;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Search {label.toLowerCase()}
        <input
          name="q"
          form={`${name}-search`}
          defaultValue={state.q}
          maxLength={GIVING_HOUSEHOLD_SEARCH_MAX}
          className={fieldClass}
        />
      </label>
      <form id={`${name}-search`} action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="selectedId" value={state.selectedId} />
        <input type="hidden" name="page" value="1" />
        <button
          disabled={pending}
          className="rounded border px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </form>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        {label}
        <select
          name={name}
          required
          form={selectionFormId}
          defaultValue={state.selectedId}
          className={fieldClass}
        >
          <option value="">{emptyLabel}</option>
          {state.selectedId && !selectedStillPresent ? (
            <option value={state.selectedId}>
              Previously selected — search again to confirm
            </option>
          ) : null}
          {state.rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <p role="status" aria-live="polite" className="text-sm">
        {state.message ||
          (state.total
            ? `Showing ${state.rows.length} of ${state.total}`
            : "No matching records on this page.")}
      </p>
      <div className="flex gap-2">
        {hasPrevious ? (
          <form action={action}>
            <input type="hidden" name="q" value={state.q} />
            <input type="hidden" name="selectedId" value={state.selectedId} />
            <input type="hidden" name="page" value={String(state.page - 1)} />
            <button
              disabled={pending}
              className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Previous
            </button>
          </form>
        ) : null}
        {hasNext ? (
          <form action={action}>
            <input type="hidden" name="q" value={state.q} />
            <input type="hidden" name="selectedId" value={state.selectedId} />
            <input type="hidden" name="page" value={String(state.page + 1)} />
            <button
              disabled={pending}
              className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Next
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
