"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  MEMBER_PROFILE_COMMUNICATION_LABELS,
  MEMBER_PROFILE_COMMUNICATION_METHODS,
  createMemberProfileActionState,
  type MemberProfileFormValues,
} from "@/lib/validation/member-profile-preferences";

import { updateMemberProfileAction } from "./actions";

const fieldClassName =
  "w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function FieldError({
  id,
  messages,
}: {
  id: string;
  messages?: string[];
}) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-rose-700">
      {messages[0]}
    </p>
  );
}

export function MemberProfileForm({
  displayName,
  initialValues,
}: {
  displayName: string;
  initialValues: MemberProfileFormValues;
}) {
  const [state, formAction, pending] = useActionState(
    updateMemberProfileAction,
    createMemberProfileActionState(initialValues),
  );
  const values = state.values;
  const errors = state.fieldErrors;

  return (
    <form
      action={formAction}
      className="space-y-6"
      key={`${state.status}:${values.email}:${values.phone}:${values.preferredCommunicationMethod}`}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-[var(--bits-navy)]">Name</p>
          <p className="mt-2 text-sm text-[var(--bits-muted)]">{displayName}</p>
        </div>
      </div>

      <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          defaultValue={values.email}
          maxLength={254}
          aria-invalid={Boolean(errors.email?.length)}
          aria-describedby={errors.email?.length ? "email-error" : undefined}
          className={fieldClassName}
        />
        <FieldError id="email-error" messages={errors.email} />
      </label>

      <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
        Phone
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          defaultValue={values.phone}
          maxLength={40}
          aria-invalid={Boolean(errors.phone?.length)}
          aria-describedby={errors.phone?.length ? "phone-error" : undefined}
          className={fieldClassName}
        />
        <FieldError id="phone-error" messages={errors.phone} />
      </label>

      <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
        Preferred contact method
        <select
          name="preferredCommunicationMethod"
          defaultValue={values.preferredCommunicationMethod}
          aria-invalid={Boolean(errors.preferredCommunicationMethod?.length)}
          aria-describedby={
            errors.preferredCommunicationMethod?.length
              ? "preferred-error"
              : undefined
          }
          className={fieldClassName}
        >
          {MEMBER_PROFILE_COMMUNICATION_METHODS.map((method) => (
            <option key={method} value={method}>
              {MEMBER_PROFILE_COMMUNICATION_LABELS[method]}
            </option>
          ))}
        </select>
        <FieldError
          id="preferred-error"
          messages={errors.preferredCommunicationMethod}
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          {pending ? "Saving…" : "Save preferences"}
        </button>
        <Link
          href="/portal"
          className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
