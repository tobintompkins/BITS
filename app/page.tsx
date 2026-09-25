import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { ChurchLeadershipCard } from "@/components/home/church-leadership-card";
import {
  ChurchPhotoCarousel,
  type ChurchPhoto,
} from "@/components/home/church-photo-carousel";
import { PrayerWall } from "@/components/home/prayer-wall";
import { findPublicPrayerWallRequests } from "@/server/repositories/care-engagement.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const churchPhotos: ChurchPhoto[] = [];

const guestOptions = [
  {
    icon: "⌂",
    title: "Plan Your Visit",
    description:
      "Find service information, directions, and what to expect when you arrive.",
    href: "/visit",
  },
  {
    icon: "✦",
    title: "Prayer Request",
    description:
      "Share a request with church leadership or the church prayer team.",
    href: "/prayer",
  },
  {
    icon: "◷",
    title: "Events",
    description:
      "See upcoming worship services, Bible studies, and church activities.",
    href: "/church-events",
  },
  {
    icon: "＋",
    title: "I’m New Here",
    description:
      "Introduce yourself and let our church family know how we can serve you.",
    href: "/new-here",
  },
  {
    icon: "▤",
    title: "Giving Statements",
    description:
      "Sign in to view your giving history and available contribution statements.",
    href: "/portal/statements",
  },
];

export default async function Home() {
  const organization = await findPrimaryOrganization();
  const publicPrayerRequests = organization
    ? await findPublicPrayerWallRequests(organization.id).catch(() => [])
    : [];

  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white shadow-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center rounded-full border-2 border-[var(--bits-gold)] text-2xl font-semibold text-[var(--bits-gold)]"
            >
              ✝
            </span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[var(--bits-gold)]">
                BITS
              </span>
              <span className="block text-lg font-semibold text-white">
                Bring In The Sheaves
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Show when="signed-out">
              <SignInButton mode="redirect">
                <button
                  type="button"
                  className="rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white hover:text-[var(--bits-navy)]"
                >
                  Member Sign In
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/portal"
                className="rounded-xl bg-[var(--bits-gold)] px-4 py-2 text-sm font-bold text-[var(--bits-navy-deep)] transition hover:bg-white"
              >
                Member Portal
              </Link>
              <UserButton />
            </Show>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[var(--bits-navy-deep)] text-white">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-32 h-96 w-96 rounded-full border-[70px] border-white/5"
        />
        <div className="relative mx-auto grid w-full max-w-7xl items-stretch gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-6">
          <div className="flex items-center gap-4 py-1 sm:gap-6">
            <span
              aria-hidden="true"
              className="hidden h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-[var(--bits-gold)] bg-white/5 text-3xl text-[var(--bits-gold)] shadow-xl sm:grid"
            >
              ✝
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--bits-gold)] sm:text-sm">
                First UPC of Saco
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                Welcome Home
              </h1>
              <p className="mt-2 text-sm leading-6 text-white/85 sm:text-base">
                Where Everybody is Somebody
                <span className="block">and Jesus Christ is Lord</span>
              </p>
              <p className="mt-2 text-sm leading-5 text-white/65">
                We’re glad you’re here. How can we help you today?
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-xl">
            <ChurchPhotoCarousel photos={churchPhotos} />
          </div>
        </div>
      </section>

      <PrayerWall requests={publicPrayerRequests} />

      <section
        id="guest-services"
        className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12"
      >
        <article className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--bits-gold)] bg-[var(--bits-gold)] p-5 text-center shadow-lg ring-4 ring-[var(--bits-gold)]/15 sm:p-6 lg:flex-row lg:text-left">
          <span
            aria-hidden="true"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--bits-navy)] text-lg text-white"
          >
            ♥
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-[var(--bits-navy-deep)] sm:text-2xl">
              Give Tithes &amp; Offerings
            </h2>
            <p className="mt-1 text-sm leading-5 text-[var(--bits-navy-deep)]/75">
              Give securely toward tithes, general offerings, missions,
              building fund, Sunday school, and special offerings.
            </p>
          </div>
          <Link
            href="/give"
            className="inline-flex shrink-0 rounded-xl bg-[var(--bits-navy)] px-6 py-3 text-sm font-bold text-white shadow-sm"
          >
            Give Online
          </Link>
        </article>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {guestOptions.map((option) => {
            const content = (
              <>
              <span
                aria-hidden="true"
                className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--bits-navy)] text-xl font-bold text-[var(--bits-gold)]"
              >
                {option.icon}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-[var(--bits-navy)]">
                {option.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
                {option.description}
              </p>
                {option.href ? (
                  <span className="mt-auto pt-5 text-xs font-bold uppercase tracking-wide text-[var(--bits-gold-hover)]">
                    View details <span aria-hidden="true">→</span>
                  </span>
                ) : null}
              </>
            );

            return option.href ? (
              <Link
                key={option.title}
                href={option.href}
                className="relative flex min-h-52 flex-col items-center rounded-2xl border border-[var(--bits-border)] bg-white p-6 text-center shadow-sm transition hover:-translate-y-1 hover:border-[var(--bits-gold)] hover:shadow-lg"
              >
                {content}
              </Link>
            ) : (
              <article
                key={option.title}
                className="relative flex min-h-52 flex-col items-center rounded-2xl border border-[var(--bits-border)] bg-white p-6 text-center shadow-sm"
              >
                {content}
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-center text-sm text-[var(--bits-muted)]">
          Guest service forms and secure online giving will be connected in the
          next small development patches.
        </p>
        <div className="mx-auto mt-8 max-w-xl">
          <ChurchLeadershipCard />
        </div>
      </section>

      <section className="border-y border-[var(--bits-border)] bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] md:items-center lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-hover)]">
              Members & Leadership
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--bits-navy-deep)]">
              Member and Leadership Access
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--bits-muted)]">
              Sign in to reach the private area available for your approved
              church role.
            </p>
          </div>
          <div>
            <Show when="signed-out">
              <SignInButton mode="redirect">
                <button
                  type="button"
                  className="rounded-xl bg-[var(--bits-navy)] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--bits-navy-deep)]"
                >
                  Secure Portal Sign In
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/portal"
                className="inline-flex rounded-xl bg-[var(--bits-navy)] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--bits-navy-deep)]"
              >
                Open Member Portal
              </Link>
            </Show>
          </div>
        </div>
      </section>

      <footer className="bg-[var(--bits-navy-deep)] text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-8 text-center sm:px-6 md:flex-row md:items-center md:justify-between md:text-left lg:px-8">
          <div>
            <p className="font-semibold">First UPC of Saco</p>
            <p className="mt-1 text-sm text-white/65">
              Where everybody is somebody and Jesus Christ is Lord.
            </p>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--bits-gold)]">
            BITS · Bring In The Sheaves
          </p>
        </div>
      </footer>
    </main>
  );
}
