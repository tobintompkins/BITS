import Link from "next/link";

import { findEvents } from "@/server/repositories/event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function PublicChurchEventsPage() {
  const organization = await findPrimaryOrganization();
  const events = organization
    ? (
        await findEvents(organization.id, {
          status: "PUBLISHED",
          visibility: "PUBLIC",
          upcomingOnly: true,
          sort: "startAsc",
          pageSize: 30,
        }).catch(() => ({ events: [] }))
      ).events
    : [];

  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--bits-gold)] text-xl text-[var(--bits-gold)]"
            >
              ✝
            </span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
                First UPC of Saco
              </span>
              <span className="block font-semibold">Church Events</span>
            </span>
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold transition hover:bg-white hover:text-[var(--bits-navy)]"
          >
            Back Home
          </Link>
        </div>
      </header>

      <section className="bg-[var(--bits-navy-deep)] px-4 py-9 text-center text-white sm:px-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--bits-gold)]">
          Church Life
        </p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
          Upcoming Events
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/75">
          Join us for worship, fellowship, ministry, and special services.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {events.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2">
            {events.map((event) => (
              <article
                key={event.id}
                className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm"
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--bits-gold-hover)]">
                  {new Intl.DateTimeFormat("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  }).format(event.startDateTime)}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--bits-navy)]">
                  {event.title}
                </h2>
                <p className="mt-2 text-sm font-medium text-[var(--foreground)]">
                  {new Intl.DateTimeFormat("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: event.timezone,
                  }).format(event.startDateTime)}
                  {event.location ? ` · ${event.location.name}` : ""}
                </p>
                {event.shortDescription ? (
                  <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
                    {event.shortDescription}
                  </p>
                ) : null}
                {event.registrationRequired && event.slug ? (
                  <Link
                    href={`/register/${event.slug}`}
                    className="mt-5 inline-flex rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--bits-navy-deep)]"
                  >
                    Register
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--bits-border)] bg-white p-10 text-center">
            <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
              No public events are posted yet
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
              Published public events from the Leadership Portal will
              automatically appear here.
            </p>
            <div className="mt-6 rounded-xl bg-[var(--bits-page)] px-4 py-3 text-sm text-[var(--foreground)]">
              Sunday Morning Worship · 10:30 AM
              <span className="mx-2 text-[var(--bits-gold)]">•</span>
              Wednesday Service · 7:00 PM
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
