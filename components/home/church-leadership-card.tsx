import {
  CHURCH_LEADERSHIP_HEADING,
  CHURCH_LEADERSHIP_NAMES,
} from "@/lib/church/leadership";
import { churchPersonInitials } from "@/lib/church/team-roster";
import type { ChurchTeamCardPerson } from "@/lib/church/church-profile-access";
import Link from "next/link";

export function ChurchLeadershipCard({
  heading = CHURCH_LEADERSHIP_HEADING,
  names = CHURCH_LEADERSHIP_NAMES,
  people,
  headingId = "church-leadership-heading",
}: {
  heading?: string;
  names?: readonly string[];
  people?: readonly ChurchTeamCardPerson[];
  headingId?: string;
} = {}) {
  const cards: readonly ChurchTeamCardPerson[] =
    people ??
    names.map((name) => ({
      key: name,
      name,
      initials: churchPersonInitials(name),
      roleLabel: heading,
      href: null,
      photoUrl: null,
    }));
  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <h2
            id={headingId}
            className="text-lg font-semibold text-[var(--bits-navy-deep)]"
          >
            {heading}
          </h2>
        </div>

        <ul className="mt-5 grid max-w-3xl gap-3 sm:grid-cols-2">
          {cards.map((person) => {
            const body = (
              <>
                {person.photoUrl ? (
                  // Profile bytes are served by an authorized route, not the image optimizer.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={person.photoUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full border-2 border-[var(--bits-gold)] object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-sm font-semibold text-[var(--bits-gold)]"
                  >
                    {person.initials}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block break-words text-base font-semibold leading-snug text-[var(--bits-navy)]">
                    {person.name}
                  </span>
                  <span className="mt-1 block text-sm text-[var(--bits-muted)]">
                    {person.roleLabel}
                  </span>
                </span>
              </>
            );
            return (
              <li key={person.key}>
                {person.href ? (
                  <Link
                    href={person.href}
                    className="flex items-center gap-3 rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4 hover:border-[var(--bits-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4">
                    {body}
                  </div>
                )}
                {person.selfHref ? (
                  <Link
                    href={person.selfHref}
                    className="mt-2 inline-flex rounded-xl px-1 text-sm font-semibold text-[var(--bits-navy)] underline decoration-[var(--bits-gold)] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                  >
                    {person.selfLabel ?? "Update my profile"}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
