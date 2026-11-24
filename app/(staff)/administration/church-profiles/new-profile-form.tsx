"use client";

import { useActionState } from "react";

import { saveChurchProfileAction } from "./actions";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export function NewChurchProfileForm() {
  const [state, action, pending] = useActionState(saveChurchProfileAction, {
    ok: true,
    message: "",
  });
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-[var(--bits-border)] bg-white p-5">
      <h2 className="text-lg font-semibold text-[var(--bits-navy)]">Add a person without a login</h2>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Name
        <input name="officialName" required maxLength={120} className={fieldClass} />
      </label>
      <p className="text-sm text-[var(--bits-muted)]">
        This creates a hidden church profile only. It does not create an account or a donor.
      </p>
      <button disabled={pending} className="w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white">
        Create hidden profile
      </button>
      {state.message ? <p className="text-sm text-[var(--bits-navy)]">{state.message}</p> : null}
    </form>
  );
}
