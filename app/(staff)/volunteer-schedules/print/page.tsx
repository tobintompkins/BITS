import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PrintPageButton } from "@/components/portal/print-page-button";
import {
  STAFF_VOLUNTEER_SCHEDULE_PRINT_EMPTY_COPY,
  STAFF_VOLUNTEER_SCHEDULE_PRINT_NOTICE,
} from "@/lib/validation/volunteer-service-schedule-print";
import { getVolunteerServiceSchedulePrint } from "@/server/services/volunteer-service-schedule-print.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function VolunteerServiceSchedulePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ eventId?: string }>;
}) {
  const { eventId } = await searchParams;
  const review = await getVolunteerServiceSchedulePrint(eventId);

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");
  if (review.status === "NOT_FOUND") notFound();

  return (
    <div className="volunteer-schedule-print space-y-6">
      <header className="print-hidden">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Ministry
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Print Volunteer Schedule
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {STAFF_VOLUNTEER_SCHEDULE_PRINT_NOTICE}{" "}
          <Link
            href="/volunteer-schedules"
            className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Volunteer Schedules
          </Link>
        </p>
      </header>

      <PrintPageButton
        label="Print"
        ariaLabel="Open the browser print dialog for this volunteer schedule"
        note="Use the browser print dialog to print this schedule. Saving or printing does not change assignments."
      />

      <article className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm print-letterhead">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--bits-gold-dark)]">
          {review.churchName}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
          {review.eventTitle}
        </h2>
        <p className="mt-2 text-sm text-[var(--bits-navy)]">
          {review.startsAtLabel}
        </p>
        {review.location ? (
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            {review.location}
          </p>
        ) : null}
      </article>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Volunteer assignments
        </h2>
        {review.groups.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {STAFF_VOLUNTEER_SCHEDULE_PRINT_EMPTY_COPY}
          </p>
        ) : (
          <div className="mt-4 grid gap-6">
            {review.groups.map((group) => (
              <section key={group.ministryName} className="print-keep">
                <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
                  {group.ministryName}
                </h3>
                <table className="mt-2 min-w-full text-left text-sm">
                  <caption className="sr-only">
                    {group.ministryName} volunteer assignments
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Role
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Volunteer
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Status
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Confirmation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.assignments.map((row) => (
                      <tr
                        key={`${group.ministryName}-${row.roleLabel}-${row.memberName}-${row.statusLabel}`}
                        className="border-b border-[var(--bits-border)] last:border-0"
                      >
                        <th
                          scope="row"
                          className="py-2 pr-3 font-medium text-[var(--bits-navy)]"
                        >
                          {row.roleLabel}
                        </th>
                        <td className="py-2 pr-3 text-[var(--bits-navy)]">
                          {row.memberName}
                        </td>
                        <td className="py-2 pr-3 text-[var(--bits-navy)]">
                          {row.statusLabel}
                        </td>
                        <td className="py-2 text-[var(--bits-navy)]">
                          {row.confirmationLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
