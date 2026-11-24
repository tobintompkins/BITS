"use client";

import { useActionState } from "react";

import type { ChurchProfileSnapshot } from "@/lib/church/church-profile-access";
import { saveOwnChurchProfileAction } from "@/app/(portal)/portal/profile/church-profile-actions";
import { ProfilePhotoControls } from "@/components/church/profile-photo-controls";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export function MyChurchProfileForm({ profile }: { profile: ChurchProfileSnapshot }) {
  const [state, action, pending] = useActionState(saveOwnChurchProfileAction, {
    ok: true,
    message: "",
  });
  return (
    <form action={action} className="grid gap-4">
      <p className="text-sm leading-6 text-[var(--bits-muted)]">
        Your descriptions are personal. Church teams and titles stay with the administrator and are not security permissions.
      </p>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Preferred display name
        <input name="preferredName" defaultValue={profile.preferredName ?? ""} maxLength={80} className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        About me
        <textarea name="aboutMe" defaultValue={profile.aboutMe ?? ""} maxLength={1000} rows={4} className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Family introduction
        <textarea name="familyIntroduction" defaultValue={profile.familyIntroduction ?? ""} maxLength={1000} rows={3} className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        How I help at church
        <textarea name="serviceDescription" defaultValue={profile.serviceDescription ?? ""} maxLength={500} rows={3} className={fieldClass} />
      </label>
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="shareWithMembers" defaultChecked={profile.shareWithMembers} />
        Share this description with signed-in members of this church.
      </label>
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input type="checkbox" name="photoShareWithMembers" defaultChecked={profile.photoShareWithMembers} />
        Share my photo with signed-in members.
      </label>
      <label className="flex items-start gap-2 text-sm text-[var(--bits-navy)]">
        <input
          type="checkbox"
          name="showPublic"
          defaultChecked={
            profile.publication === "PUBLISHED" &&
            profile.publicConsent &&
            profile.photoPublicConsent
          }
        />
        Show my profile and photo on the public team page. Leave this off to keep them private.
      </label>
      <div>
        <p className="text-sm font-medium text-[var(--bits-navy)]">Church teams</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {profile.teams.length ? profile.teams.map((team) => (
            <li key={team.team} className="rounded-full border border-[var(--bits-gold)] px-3 py-1 text-sm">{team.label}</li>
          )) : <li className="text-sm text-[var(--bits-muted)]">No church team is assigned.</li>}
        </ul>
      </div>
      <ProfilePhotoControls rosterKey={profile.rosterKey} hasPhoto={profile.hasPhoto} />
      <button type="submit" disabled={pending} className="w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]">
        Save profile
      </button>
      {state.message ? <p className="text-sm text-[var(--bits-navy)]">{state.message}</p> : null}
    </form>
  );
}
