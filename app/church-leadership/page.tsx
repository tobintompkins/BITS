import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { DisplayOptions } from "@/components/accessibility/display-options";
import { ChurchLeadershipCard } from "@/components/home/church-leadership-card";
import { ownChurchProfile, publicChurchPhotoEditors, publicChurchTeamCards, publicFamilyCards } from "@/server/services/church-person-profile.service";

export const metadata: Metadata = {
  title: "Meet Our Team | First UPC of Saco",
};

export default async function ChurchLeadershipPage() {
  await connection();
  const [sections, family, own, editors] = await Promise.all([
    publicChurchTeamCards(),
    publicFamilyCards(),
    ownChurchProfile(),
    publicChurchPhotoEditors(),
  ]);
  const ownedKey = own.status === "READY" ? own.profile.rosterKey : null;
  const withEditor = (people: typeof sections[number]["people"]) =>
    people.map((person) => ({
      ...person,
      ...(person.key === ownedKey
        ? { selfHref: "/church-leadership/my-profile", selfLabel: "Update my photo" }
        : {}),
      ...(editors
        ? { canEditPhoto: true, editorHasPhoto: editors.get(person.key) === true }
        : {}),
    }));
  const withSelf = sections.map((section) => ({
    ...section,
    people: withEditor(section.people),
  }));
  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[var(--bits-gold)] text-2xl text-[var(--bits-gold)]">✝</span>
            First UPC of Saco
          </Link>
          <div className="flex items-center gap-3">
            <DisplayOptions />
            <Link href="/" className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white hover:text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]">
              Back Home
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--bits-navy)] sm:text-4xl">Meet Our Team</h1>
        <p className="mt-3 text-[var(--bits-muted)]">First UPC of Saco</p>
        <Link
          href="/church-leadership/my-profile"
          className="mt-6 inline-flex rounded-xl bg-[var(--bits-navy)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--bits-navy-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Update my profile
        </Link>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--bits-muted)]">
          Any signed-in church member can change their own photo and introduction. Administrator access is not required.
        </p>
      </div>
      {withSelf.map((section) => (
        <ChurchLeadershipCard
          key={section.headingId}
          heading={section.heading}
          headingId={section.headingId}
          people={section.people}
        />
      ))}
      {family.length ? (
        <ChurchLeadershipCard heading="Church family" headingId="church-family-heading" people={withEditor(family)} />
      ) : null}
    </main>
  );
}
