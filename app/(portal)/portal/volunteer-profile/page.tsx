import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MEMBER_VOLUNTEER_GIFTS_EMPTY_COPY,
  MEMBER_VOLUNTEER_INTERESTS_EMPTY_COPY,
  MEMBER_VOLUNTEER_PROFILE_UPDATE_COPY,
  MEMBER_VOLUNTEER_SKILLS_EMPTY_COPY,
} from "@/lib/validation/member-volunteer-profile";
import { getMemberVolunteerProfile } from "@/server/services/member-volunteer-profile.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function UpdateHelpMessage() {
  return (
    <p className="text-sm leading-6 text-[var(--bits-muted)]">
      {MEMBER_VOLUNTEER_PROFILE_UPDATE_COPY}{" "}
      <Link
        href="/portal/help"
        className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
      >
        Help &amp; Contact
      </Link>
    </p>
  );
}

export default async function MemberVolunteerProfilePage() {
  const portal = await getMemberVolunteerProfile();
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  if (portal.status === "CONNECTION_PENDING") {
    return (
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
          My Volunteer Profile
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your church
          membership record before volunteer information can appear.
        </p>
        <p className="mt-4">
          <Link
            href="/portal/help"
            className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Help &amp; Contact
          </Link>
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            My Volunteer Profile
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            These are the ministry gifts, skills, and interests currently
            recorded for you. This page is read-only.
          </p>
        </div>
        <Link
          href="/portal"
          className={`text-sm font-medium text-[var(--bits-navy)] underline ${focusClass}`}
        >
          Member Portal Home
        </Link>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Spiritual Gifts
        </h2>
        {portal.gifts.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {portal.gifts.map((gift) => (
              <li
                key={gift.name}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <h3 className="font-semibold text-[var(--bits-navy)]">
                  {gift.name}
                </h3>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {gift.levelLabel}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_VOLUNTEER_GIFTS_EMPTY_COPY}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Skills
        </h2>
        {portal.skills.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {portal.skills.map((skill) => (
              <li
                key={skill.name}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <h3 className="font-semibold text-[var(--bits-navy)]">
                  {skill.name}
                </h3>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {skill.levelLabel}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_VOLUNTEER_SKILLS_EMPTY_COPY}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Ministry Interests
        </h2>
        {portal.interests.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {portal.interests.map((interest) => (
              <li
                key={interest.name}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <h3 className="font-semibold text-[var(--bits-navy)]">
                  {interest.name}
                </h3>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_VOLUNTEER_INTERESTS_EMPTY_COPY}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <UpdateHelpMessage />
      </section>
    </div>
  );
}
