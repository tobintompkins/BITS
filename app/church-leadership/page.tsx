import type { Metadata } from "next";
import Link from "next/link";

import { DisplayOptions } from "@/components/accessibility/display-options";
import { ChurchLeadershipCard } from "@/components/home/church-leadership-card";

import { CHURCH_BOARD_NAMES, CHURCH_MUSIC_TEAM_NAMES } from "@/lib/church/leadership";

export const metadata: Metadata = {
  title: "Meet Our Team | First UPC of Saco",
};

export default function ChurchLeadershipPage() {
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
            <Link href="/" className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold hover:bg-white hover:text-[var(--bits-navy)]">
              Back Home
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--bits-navy)] sm:text-4xl">Meet Our Team</h1>
        <p className="mt-3 text-[var(--bits-muted)]">First UPC of Saco</p>
      </div>
      <ChurchLeadershipCard />
      <ChurchLeadershipCard
        heading="Church Board"
        names={CHURCH_BOARD_NAMES}
        headingId="church-board-heading"
      />
      <ChurchLeadershipCard
        heading="Music Team"
        names={CHURCH_MUSIC_TEAM_NAMES}
        headingId="music-team-heading"
      />
    </main>
  );
}
