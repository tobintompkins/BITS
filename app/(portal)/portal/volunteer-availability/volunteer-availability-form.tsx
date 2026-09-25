"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  MEMBER_VOLUNTEER_AVAILABILITY_NOTE_MAX,
  VOLUNTEER_WEEKDAY_LABELS,
  VOLUNTEER_WEEKDAYS,
  createMemberVolunteerAvailabilityActionState,
  type MemberVolunteerAvailabilityInput,
} from "@/lib/validation/member-volunteer-availability";

import { updateMemberVolunteerAvailabilityAction } from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

const fieldClassName = `w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] ${focusClass}`;

export function VolunteerAvailabilityForm({
  initialValues,
}: {
  initialValues: MemberVolunteerAvailabilityInput;
}) {
  const [state, formAction, pending] = useActionState(
    updateMemberVolunteerAvailabilityAction,
    createMemberVolunteerAvailabilityActionState(initialValues),
  );
  const values = state.values;

  return (
    <form action={formAction} className="space-y-6">
      {state.message ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            state.status === "error"
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4">
        {VOLUNTEER_WEEKDAYS.map((weekday, index) => {
          const day = values.days[index];
          const errors = state.fieldErrors[weekday];
          const errorId = `${weekday}-error`;
          return (
            <fieldset
              key={weekday}
              className="rounded-2xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
            >
              <legend className="px-1 text-sm font-semibold text-[var(--bits-navy)]">
                {VOLUNTEER_WEEKDAY_LABELS[weekday]}
              </legend>
              <label className="mt-2 flex items-start gap-3 text-sm text-[var(--bits-navy)]">
                <input
                  type="checkbox"
                  name={`${weekday}.isAvailable`}
                  value="on"
                  defaultChecked={day.isAvailable}
                  aria-describedby={errors?.length ? errorId : undefined}
                  className={`mt-0.5 h-4 w-4 accent-[var(--bits-navy)] ${focusClass}`}
                />
                <span className="font-medium">Available this day</span>
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
                  Start time
                  <input
                    type="time"
                    name={`${weekday}.startTime`}
                    defaultValue={day.startTime ?? ""}
                    aria-describedby={errors?.length ? errorId : undefined}
                    className={fieldClassName}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
                  End time
                  <input
                    type="time"
                    name={`${weekday}.endTime`}
                    defaultValue={day.endTime ?? ""}
                    aria-describedby={errors?.length ? errorId : undefined}
                    className={fieldClassName}
                  />
                </label>
              </div>
              <label className="mt-3 grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
                Optional note
                <input
                  type="text"
                  name={`${weekday}.note`}
                  defaultValue={day.note ?? ""}
                  maxLength={MEMBER_VOLUNTEER_AVAILABILITY_NOTE_MAX}
                  aria-describedby={errors?.length ? errorId : undefined}
                  className={fieldClassName}
                />
              </label>
              {errors?.length ? (
                <p id={errorId} className="mt-2 text-sm text-rose-700">
                  {errors[0]}
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${focusClass}`}
        >
          {pending ? "Saving…" : "Save availability"}
        </button>
        <Link
          href="/portal"
          className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
