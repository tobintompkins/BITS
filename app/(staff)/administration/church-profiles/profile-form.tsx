"use client";

import { useActionState } from "react";

import type { ChurchProfileSnapshot } from "@/lib/church/church-profile-access";
import { ProfilePhotoControls } from "@/components/church/profile-photo-controls";

import { saveChurchProfileAction } from "./actions";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export function ChurchProfileAdminForm({
  profile,
}: {
  profile: ChurchProfileSnapshot;
}) {
  const [state, action, pending] = useActionState(saveChurchProfileAction, {
    ok: true,
    message: "",
  });
  const teams = new Set(profile.teams.map((team) => team.team));
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-[var(--bits-border)] bg-white p-5">
      <h2 className="text-lg font-semibold text-[var(--bits-navy)]">{profile.officialName}</h2>
      <input type="hidden" name="rosterKey" value={profile.rosterKey} />
      <input type="hidden" name="officialName" value={profile.officialName} />
      {(["leadership", "board", "music"] as const).map((team) => (
        <label key={team} className="flex items-center gap-2 text-sm text-[var(--bits-navy)]">
          <input type="checkbox" name={`team-${team}`} defaultChecked={teams.has(team)} />
          {team === "leadership" ? "Church Leadership" : team === "board" ? "Church Board" : "Music Team"}
        </label>
      ))}
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="publicConsent" defaultChecked={profile.publicConsent} />
        This person has consented to a public team profile.
      </label>
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="photoPublicConsent" defaultChecked={profile.photoPublicConsent} />
        This person has consented to a public photo.
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Publication
        <select name="publication" defaultValue={profile.publication} className={fieldClass}>
          <option value="HIDDEN">Hidden</option>
          <option value="PUBLISHED">Published</option>
        </select>
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Link an existing account by its exact id
        <input name="linkUserAccountId" defaultValue={profile.linkedUserAccountId ?? ""} className={fieldClass} />
      </label>
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="linkConfirmed" />
        I confirm this exact account belongs to this person. Do not match by name or email.
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="clearLink" />
        Remove the account link
      </label>
      <ProfilePhotoControls rosterKey={profile.rosterKey} hasPhoto={profile.hasPhoto} />
      <button disabled={pending} className="w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white">
        Save church profile
      </button>
      {state.message ? <p className="text-sm text-[var(--bits-navy)]">{state.message}</p> : null}
    </form>
  );
}
