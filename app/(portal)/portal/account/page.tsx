import Link from "next/link";

import { OpenSignInSecurity } from "@/components/account/open-sign-in-security";
import { ProfilePhotoControls } from "@/components/church/profile-photo-controls";
import { churchPersonInitials } from "@/lib/church/team-roster";
import { MEMBER_PORTAL_NAV_GROUPS } from "@/lib/portal/member-portal-nav";
import { ownChurchProfile } from "@/server/services/church-person-profile.service";

export default async function MyAccountPage() {
  const account = MEMBER_PORTAL_NAV_GROUPS.find((group) => group.heading === "My Account");
  const links = account?.items.filter((item) => item.href !== "/portal/account") ?? [];
  const profile = await ownChurchProfile();
  const ready = profile.status === "READY" ? profile.profile : null;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Private Member Access
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">My Account</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {account?.description} Opening a section does not change who can see your church profile or grant leadership access.
        </p>
      </header>
      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">My photo</h2>
        {ready ? (
          <div className="mt-4">
            <ProfilePhotoControls
              rosterKey={ready.rosterKey}
              hasPhoto={ready.hasPhoto}
              initials={churchPersonInitials(ready.preferredName || ready.officialName)}
              label="Change photo"
            />
            <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
              This is your personal photo. Saving it does not publish it or change who can see it.
            </p>
            <p className="mt-3">
              <Link
                href="/portal/profile"
                className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
              >
                Edit my introduction
              </Link>
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
            Choose your church before a personal profile can be created. A matching name or email does not connect an existing church card.
          </p>
        )}
      </section>
      <ul className="grid gap-3">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="bits-button block rounded-2xl border border-[var(--bits-border)] bg-white p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              <span className="font-semibold text-[var(--bits-navy)]">{item.label}</span>
              {item.description ? (
                <span className="mt-1 block text-sm leading-5 text-[var(--bits-muted)]">{item.description}</span>
              ) : null}
            </Link>
          </li>
        ))}
        <li className="rounded-2xl border border-[var(--bits-border)] bg-white p-4">
          <h2 className="font-semibold text-[var(--bits-navy)]">Sign-in &amp; Security</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--bits-muted)]">
            Change your sign-in email, password, and security settings in the existing account window.
          </p>
          <div className="mt-3">
            <OpenSignInSecurity />
          </div>
        </li>
      </ul>
    </div>
  );
}
