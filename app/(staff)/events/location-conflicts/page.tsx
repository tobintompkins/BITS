import Link from "next/link";
import { redirect } from "next/navigation";

import {
  EVENT_LOCATION_CONFLICTS_CALENDAR_HREF,
  EVENT_LOCATION_CONFLICTS_EMPTY_COPY,
  EVENT_LOCATION_CONFLICTS_NOTICE,
  EVENT_LOCATION_CONFLICTS_WINDOW_COPY,
} from "@/lib/validation/event-location-conflicts";
import { getEventLocationConflicts } from "@/server/services/event-location-conflicts.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function EventLocationConflictsPage() {
  const review = await getEventLocationConflicts();
  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Church Life
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            Location Conflict Review
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {EVENT_LOCATION_CONFLICTS_NOTICE}
          </p>
          <p className="mt-2 text-sm text-[var(--bits-muted)]">
            {EVENT_LOCATION_CONFLICTS_WINDOW_COPY}
          </p>
        </div>
        <Link
          href={EVENT_LOCATION_CONFLICTS_CALENDAR_HREF}
          className={`inline-flex rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
        >
          Open Events Calendar
        </Link>
      </header>

      {review.pairs.length === 0 ? (
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
          <p className="text-sm leading-6 text-[var(--bits-navy)]">
            {EVENT_LOCATION_CONFLICTS_EMPTY_COPY}
          </p>
        </section>
      ) : (
        <ul className="grid gap-4">
          {review.pairs.map((pair) => (
            <li
              key={`${pair.locationId}-${pair.first.id}-${pair.second.id}`}
              className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
                {pair.locationName}
              </h2>
              <p className="mt-1 text-sm text-[var(--bits-muted)]">
                These two events overlap in this location.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[pair.first, pair.second].map((event) => (
                  <article
                    key={event.id}
                    className="rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
                  >
                    <h3 className="text-base font-semibold text-[var(--bits-navy)]">
                      {event.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
                      {event.whenLabel}
                    </p>
                    <p className="mt-3">
                      <Link
                        href={event.href}
                        className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
                      >
                        Open event
                      </Link>
                    </p>
                  </article>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
