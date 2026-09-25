"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  MEMBER_COMMUNICATION_PREFERENCE_FIELDS,
  MEMBER_COMMUNICATION_PREFERENCE_LABELS,
  createMemberCommunicationPreferencesActionState,
  type MemberCommunicationPreferences,
} from "@/lib/validation/member-communication-preferences";

import { updateMemberCommunicationPreferencesAction } from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function CommunicationPreferencesForm({
  initialValues,
}: {
  initialValues: MemberCommunicationPreferences;
}) {
  const [state, formAction, pending] = useActionState(
    updateMemberCommunicationPreferencesAction,
    createMemberCommunicationPreferencesActionState(initialValues),
  );
  const values = state.values;

  return (
    <form
      action={formAction}
      className="space-y-6"
      key={`${state.status}:${values.allowEmail}:${values.allowSms}:${values.allowPhoneCalls}:${values.allowPostalMail}`}
    >
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

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-[var(--bits-navy)]">
          How the church may contact you
        </legend>
        {MEMBER_COMMUNICATION_PREFERENCE_FIELDS.map((field) => (
          <label
            key={field}
            className="flex items-start gap-3 rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] px-4 py-3 text-sm text-[var(--bits-navy)]"
          >
            <input
              type="checkbox"
              name={field}
              value="on"
              defaultChecked={values[field]}
              className={`mt-0.5 h-4 w-4 accent-[var(--bits-navy)] ${focusClass}`}
            />
            <span className="font-medium">
              {MEMBER_COMMUNICATION_PREFERENCE_LABELS[field]}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${focusClass}`}
        >
          {pending ? "Saving…" : "Save preferences"}
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
