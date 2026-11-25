import Link from "next/link";
import { redirect } from "next/navigation";

import { MyChurchProfileForm } from "@/components/church/my-church-profile-form";
import { toMemberProfileFormValues } from "@/lib/validation/member-profile-preferences";
import { ownChurchProfile } from "@/server/services/church-person-profile.service";
import { getMemberProfilePreferences } from "@/server/services/member-profile-preferences.service";

import { MemberProfileForm } from "./member-profile-form";

export default async function MemberProfilePage() {
  const portal = await getMemberProfilePreferences();
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  if (portal.status === "CONNECTION_PENDING") {
    const churchProfile = await ownChurchProfile();
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
            My Profile &amp; Preferences
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
            Your account ({portal.accountEmail}) must be connected to your donor
            record before contact preferences can appear. A church profile is separate and does not create a donor.
          </p>
        </section>
        <ChurchProfileSection churchProfile={churchProfile} />
      </div>
    );
  }

  const churchProfile = await ownChurchProfile();
  const displayName = `${portal.profile.firstName} ${portal.profile.lastName}`.trim();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            My Profile
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            Update your photo, introduction, and who can see your church profile.
            You can also update your email, phone, and preferred contact method.
            Name, household, and mailing-address changes still require church staff.
          </p>
          <p className="mt-3">
            <Link
              href="/portal/communication-preferences"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Communication Preferences
            </Link>
          </p>
        </div>
        <Link
          href="/portal"
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          My Home
        </Link>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:p-8">
        <MemberProfileForm
          displayName={displayName}
          initialValues={toMemberProfileFormValues(portal.profile)}
        />
      </section>
      <ChurchProfileSection churchProfile={churchProfile} />
    </div>
  );
}

function ChurchProfileSection({
  churchProfile,
}: {
  churchProfile: Awaited<ReturnType<typeof ownChurchProfile>>;
}) {
  return (
    <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold text-[var(--bits-navy)]">My church profile</h2>
      {churchProfile.status === "READY" ? (
        <div className="mt-4">
          <MyChurchProfileForm profile={churchProfile.profile} />
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
            Your church profile is not connected yet. Open the public team page and choose your own profile. A matching name or email does not connect it.
          </p>
          <p className="mt-3">
            <Link href="/church-leadership/my-profile" className="text-sm font-semibold text-[var(--bits-navy)] underline">
              Update my profile
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
