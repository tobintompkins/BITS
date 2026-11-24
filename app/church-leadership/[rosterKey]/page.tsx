import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { churchPersonInitials } from "@/lib/church/team-roster";
import { publicChurchProfilePage } from "@/server/services/church-person-profile.service";

export const metadata: Metadata = {
  title: "Church profile | First UPC of Saco",
};

export default async function ChurchProfilePage({
  params,
}: {
  params: Promise<{ rosterKey: string }>;
}) {
  await connection();
  const { rosterKey } = await params;
  const profile = await publicChurchProfilePage(rosterKey);
  if (!profile) notFound();
  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <p className="font-semibold">First UPC of Saco</p>
          <Link href="/church-leadership" className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]">
            Meet Our Team
          </Link>
        </div>
      </header>
      <article className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
        <div className="flex items-center gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5">
          {profile.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/church-profile-photo/${profile.rosterKey}`}
              alt=""
              className="h-20 w-20 rounded-full border-2 border-[var(--bits-gold)] object-cover"
            />
          ) : (
            <span aria-hidden="true" className="grid h-20 w-20 place-items-center rounded-full border-2 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-xl font-semibold text-[var(--bits-gold)]">
              {churchPersonInitials(profile.name)}
            </span>
          )}
          <div>
            <h1 className="text-3xl font-semibold text-[var(--bits-navy)]">{profile.name}</h1>
            <ul className="mt-2 flex flex-wrap gap-2">
              {profile.teams.map((team) => (
                <li key={team.team} className="rounded-full border border-[var(--bits-gold)] px-3 py-1 text-sm text-[var(--bits-navy)]">
                  {team.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <ProfileText heading="About me" text={profile.aboutMe} />
        <ProfileText heading="Family" text={profile.familyIntroduction} />
        <ProfileText heading="How I help" text={profile.serviceDescription} />
        <p className="text-sm leading-6 text-[var(--bits-muted)]">
          Church teams are assigned by the church. A personal description is not a verified appointment.
        </p>
      </article>
    </main>
  );
}

function ProfileText({ heading, text }: { heading: string; text: string | null }) {
  if (!text) return null;
  return (
    <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5">
      <h2 className="text-lg font-semibold text-[var(--bits-navy)]">{heading}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--bits-navy)]">{text}</p>
    </section>
  );
}
