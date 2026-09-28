import Link from "next/link";
import { redirect } from "next/navigation";

import {
  STAFF_VOLUNTEER_SCHEDULE_READINESS_EMPTY_COPY,
  STAFF_VOLUNTEER_SCHEDULE_READINESS_NOTICE,
} from "@/lib/validation/volunteer-schedule-readiness";
import { getVolunteerScheduleReadiness } from "@/server/services/volunteer-schedule-readiness.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <article className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
      <h2 className="text-xs font-medium text-[var(--bits-muted)]">{label}</h2>
      <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
        {value}
      </p>
    </article>
  );
}

export default async function VolunteerScheduleReadinessPage() {
  const review = await getVolunteerScheduleReadiness();
  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Ministry
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Schedule Readiness
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {STAFF_VOLUNTEER_SCHEDULE_READINESS_NOTICE}{" "}
          <Link
            href="/volunteer-schedules"
            className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Volunteer Schedules
          </Link>
          {" · "}
          <Link
            href="/volunteer-schedules/substitute-requests"
            className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Substitute Requests
          </Link>
        </p>
      </header>

      <section
        aria-label="Upcoming volunteer schedule counts"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
      >
        <SummaryCard
          label="Upcoming scheduled assignments"
          value={review.counts.scheduledAssignments}
        />
        <SummaryCard
          label="Confirmed"
          value={review.counts.confirmedAssignments}
        />
        <SummaryCard
          label="Awaiting confirmation"
          value={review.counts.awaitingConfirmation}
        />
        <SummaryCard
          label="Open or in-review substitute requests"
          value={review.counts.openSubstituteRequests}
        />
        <SummaryCard
          label="Approved time off overlapping a service"
          value={review.counts.overlappingApprovedTimeOff}
        />
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Needs attention
        </h2>
        {review.attention.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {STAFF_VOLUNTEER_SCHEDULE_READINESS_EMPTY_COPY}
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {review.attention.map((row) => (
              <li
                key={`${row.eventTitle}-${row.startsAtLabel}`}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <h3 className="font-semibold text-[var(--bits-navy)]">
                  {row.eventTitle}
                </h3>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {row.startsAtLabel}
                </p>
                <p className="mt-2 text-sm text-[var(--bits-navy)]">
                  {row.awaitingConfirmationCount} awaiting confirmation
                  {" · "}
                  {row.openSubstituteRequestCount} open or in-review substitute
                  {row.openSubstituteRequestCount === 1 ? " request" : " requests"}
                </p>
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
                  {row.awaitingConfirmationCount > 0 ? (
                    <Link
                      href="/volunteer-schedules"
                      className={`text-[var(--bits-navy)] underline ${focusClass}`}
                    >
                      Review schedule
                    </Link>
                  ) : null}
                  {row.openSubstituteRequestCount > 0 ? (
                    <Link
                      href="/volunteer-schedules/substitute-requests"
                      className={`text-[var(--bits-navy)] underline ${focusClass}`}
                    >
                      Review substitute requests
                    </Link>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
