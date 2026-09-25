import { redirect } from "next/navigation";

import {
  VOLUNTEER_WEEKDAYS,
  VOLUNTEER_WEEKDAY_LABELS,
} from "@/lib/validation/member-volunteer-availability";
import {
  STAFF_VOLUNTEER_AVAILABILITY_EMPTY_COPY,
  STAFF_VOLUNTEER_AVAILABILITY_FILTER_EMPTY_COPY,
  STAFF_VOLUNTEER_AVAILABILITY_NOTICE,
  formatStaffAvailabilityTime,
} from "@/lib/validation/staff-volunteer-availability";
import { getStaffVolunteerAvailability } from "@/server/services/staff-volunteer-availability.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function StaffVolunteerAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const review = await getStaffVolunteerAvailability(query);

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = review.status === "READY" ? review.rows : [];
  const filtered = Boolean(review.filters.weekday || review.filters.ministryId);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Ministry
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Volunteer Availability
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {STAFF_VOLUNTEER_AVAILABILITY_NOTICE}
        </p>
      </header>

      {review.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid weekday or ministry filter.
        </p>
      ) : null}

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Weekday
          <select
            name="weekday"
            defaultValue={review.filters.weekday ?? ""}
            className={fieldClass}
          >
            <option value="">All weekdays</option>
            {VOLUNTEER_WEEKDAYS.map((weekday) => (
              <option key={weekday} value={weekday}>
                {VOLUNTEER_WEEKDAY_LABELS[weekday]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Ministry
          <select
            name="ministryId"
            defaultValue={review.filters.ministryId ?? ""}
            className={fieldClass}
          >
            <option value="">All ministries</option>
            {review.ministries.map((ministry) => (
              <option key={ministry.id} value={ministry.id}>
                {ministry.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Apply filters
          </button>
          {filtered ? (
            <a
              href="/volunteer-availability"
              className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
            >
              Clear
            </a>
          ) : null}
        </div>
      </form>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Weekly availability
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {review.status === "INVALID_FILTER" || filtered
              ? STAFF_VOLUNTEER_AVAILABILITY_FILTER_EMPTY_COPY
              : STAFF_VOLUNTEER_AVAILABILITY_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {rows.map((row, index) => (
                <li
                  key={`${row.memberName}-${row.weekday}-${index}`}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <p className="font-semibold text-[var(--bits-navy)]">
                    {row.memberName}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {row.ministryNames.length
                      ? row.ministryNames.join(", ")
                      : "No current ministry assignment"}
                  </p>
                  <p className="mt-3 text-sm font-medium text-[var(--bits-navy)]">
                    {row.weekdayLabel}
                  </p>
                  <p className="mt-1 text-sm">
                    {row.isAvailable ? "Available" : "Unavailable"}
                    {row.isAvailable
                      ? ` · ${formatStaffAvailabilityTime(
                          row.isAvailable,
                          row.startTime,
                          row.endTime,
                        )}`
                      : ""}
                  </p>
                  {row.note ? (
                    <p className="mt-2 text-sm text-[var(--bits-muted)]">
                      {row.note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Volunteer weekly availability for planning
                </caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Volunteer
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Ministries
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Weekday
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Time
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Note
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={`${row.memberName}-${row.weekday}-${index}`}
                      className="border-b border-[var(--bits-border)] last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.memberName}
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.ministryNames.length
                          ? row.ministryNames.join(", ")
                          : "—"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.weekdayLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.isAvailable ? "Available" : "Unavailable"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {formatStaffAvailabilityTime(
                          row.isAvailable,
                          row.startTime,
                          row.endTime,
                        )}
                      </td>
                      <td className="py-3 text-[var(--bits-muted)]">
                        {row.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
