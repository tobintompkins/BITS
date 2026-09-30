import Link from "next/link";
import { redirect } from "next/navigation";

import {
  FACILITY_ROOM_SCHEDULE_CALENDAR_HREF,
  FACILITY_ROOM_SCHEDULE_CONFLICTS_HREF,
  FACILITY_ROOM_SCHEDULE_EMPTY_LOCATION_COPY,
  FACILITY_ROOM_SCHEDULE_NOTICE,
  type FacilityRoomScheduleLocation,
} from "@/lib/validation/facility-room-schedule";
import { getFacilityRoomSchedule } from "@/server/services/facility-room-schedule.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function FacilityRoomSchedulePage() {
  const review = await getFacilityRoomSchedule();

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const counts =
    review.status === "READY"
      ? review.counts
      : {
          activeLocations: 0,
          locationsWithUpcomingEvents: 0,
          eventsInWindow: 0,
        };
  const locations = review.status === "READY" ? review.locations : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Church Life
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            Facility & Room Schedule
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {FACILITY_ROOM_SCHEDULE_NOTICE}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={FACILITY_ROOM_SCHEDULE_CALENDAR_HREF}
            className={`inline-flex rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Open Events Calendar
          </Link>
          <Link
            href={FACILITY_ROOM_SCHEDULE_CONFLICTS_HREF}
            className={`inline-flex rounded-xl border border-[var(--bits-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
          >
            Review Location Conflicts
          </Link>
        </div>
      </header>

      <section
        aria-label="Facility schedule counts"
        className="grid gap-4 sm:grid-cols-3"
      >
        {[
          { label: "Active Locations", value: counts.activeLocations },
          {
            label: "Locations With Upcoming Events",
            value: counts.locationsWithUpcomingEvents,
          },
          { label: "Events in Next 30 Days", value: counts.eventsInWindow },
        ].map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm"
          >
            <h2 className="text-xs font-medium text-[var(--bits-muted)]">
              {card.label}
            </h2>
            <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
              {card.value}
            </p>
          </article>
        ))}
      </section>

      {locations.length === 0 ? (
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
          <p className="text-sm leading-6 text-[var(--bits-navy)]">
            No active rooms or locations are available yet.
          </p>
        </section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((location) => (
            <li key={location.id}>
              <LocationCard location={location} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LocationCard({
  location,
}: {
  location: FacilityRoomScheduleLocation;
}) {
  const details = [
    location.placeLabel,
    location.roomName,
    location.capacity != null ? `Seats ${location.capacity}` : null,
  ].filter(Boolean);

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
        {location.name}
      </h2>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        {details.join(" · ")}
      </p>
      {location.events.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-[var(--bits-navy)]">
          {FACILITY_ROOM_SCHEDULE_EMPTY_LOCATION_COPY}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {location.events.map((event) => (
            <li
              key={event.id}
              className="rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-3"
            >
              <h3 className="text-sm font-semibold text-[var(--bits-navy)]">
                {event.title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-[var(--bits-muted)]">
                {event.whenLabel}
              </p>
              <p className="mt-1 text-xs text-[var(--bits-muted)]">
                {event.statusLabel}
                {event.isAllDay ? " · All day" : ""}
              </p>
              <p className="mt-2">
                <Link
                  href={event.href}
                  className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
                >
                  Open event
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
