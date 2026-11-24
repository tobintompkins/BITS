"use client";

import { useActionState } from "react";

import {
  claimOwnChurchProfileAction,
  createOwnPersonalProfileAction,
} from "@/app/church-leadership/my-profile/actions";

const buttonClass =
  "rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function ClaimChurchProfileForm({
  rosterKey,
  name,
}: {
  rosterKey: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(claimOwnChurchProfileAction, {
    ok: true,
    message: "",
  });
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-[var(--bits-border)] bg-white p-4">
      <h2 className="text-lg font-semibold text-[var(--bits-navy)]">{name}</h2>
      <input type="hidden" name="rosterKey" value={rosterKey} />
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="claimConfirmed" />
        I am {name}. Connect this profile to my signed-in account.
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        Use this profile
      </button>
      {state.message ? <p className="text-sm text-[var(--bits-navy)]">{state.message}</p> : null}
    </form>
  );
}

export function CreatePersonalProfileForm() {
  const [state, action, pending] = useActionState(createOwnPersonalProfileAction, {
    ok: true,
    message: "",
  });
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-[var(--bits-border)] bg-white p-4">
      <h2 className="text-lg font-semibold text-[var(--bits-navy)]">I am not on this list</h2>
      <p className="text-sm leading-6 text-[var(--bits-muted)]">
        This creates your own profile. It does not take another person’s card, create a donor, or grant administrator access.
      </p>
      <button type="submit" disabled={pending} className={buttonClass}>
        Create my profile
      </button>
      {state.message ? <p className="text-sm text-[var(--bits-navy)]">{state.message}</p> : null}
    </form>
  );
}
