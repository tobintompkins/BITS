import Link from "next/link";
import { redirect } from "next/navigation";

import {
  STAFF_VOLUNTEER_SCHEDULE_CONFLICT_NOTICE,
  STAFF_VOLUNTEER_SCHEDULE_EMPTY_COPY,
  STAFF_VOLUNTEER_SCHEDULE_NOTICE,
} from "@/lib/validation/volunteer-service-schedule";
import { getStaffVolunteerSchedule } from "@/server/services/volunteer-service-schedule.service";

import {
  cancelVolunteerServiceAssignmentAction,
  createVolunteerServiceAssignmentAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function StaffVolunteerSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    eventId?: string;
    memberId?: string;
    ministryId?: string;
    roleLabel?: string;
  }>;
}) {
  const review = await getStaffVolunteerSchedule();
  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const { success, error, eventId, memberId, ministryId, roleLabel } =
    await searchParams;
  const selectedEventId = review.events.some((event) => event.id === eventId)
    ? eventId
    : undefined;
  const selectedMemberId = review.members.some((member) => member.id === memberId)
    ? memberId
    : undefined;
  const selectedMinistryId = review.ministries.some(
    (ministry) => ministry.id === ministryId,
  )
    ? ministryId
    : undefined;
  const selectedRoleLabel = roleLabel?.trim() ? roleLabel.trim() : "";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Ministry
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Volunteer Schedules
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {STAFF_VOLUNTEER_SCHEDULE_NOTICE}{" "}
          <Link
            href="/volunteer-schedules/substitute-requests"
            className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Substitute Requests
          </Link>
        </p>
      </header>

      {success || error ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? success}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Schedule a volunteer
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
          {STAFF_VOLUNTEER_SCHEDULE_CONFLICT_NOTICE}
        </p>
        <form
          action={createVolunteerServiceAssignmentAction}
          className="mt-4 grid gap-4 lg:grid-cols-2"
        >
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Upcoming event
            <select
              name="eventId"
              required
              defaultValue={selectedEventId ?? ""}
              className={fieldClass}
            >
              <option value="">Select an event</option>
              {review.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Volunteer
            <select
              name="memberId"
              required
              defaultValue={selectedMemberId ?? ""}
              className={fieldClass}
            >
              <option value="">Select a member</option>
              {review.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Ministry (optional)
            <select
              name="ministryId"
              defaultValue={selectedMinistryId ?? ""}
              className={fieldClass}
            >
              <option value="">No ministry</option>
              {review.ministries.map((ministry) => (
                <option key={ministry.id} value={ministry.id}>
                  {ministry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Assignment label
            <input
              name="roleLabel"
              required
              minLength={2}
              maxLength={60}
              placeholder="Sound Booth"
              defaultValue={selectedRoleLabel}
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] lg:col-span-2">
            Staff-only note (optional)
            <input
              name="staffNote"
              maxLength={140}
              className={fieldClass}
            />
          </label>
          <button
            type="submit"
            className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Create assignment
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Upcoming assignments
        </h2>
        {review.rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {STAFF_VOLUNTEER_SCHEDULE_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {review.rows.map((row) => (
                <li
                  key={row.assignmentId}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <p className="font-semibold text-[var(--bits-navy)]">
                    {row.eventTitle}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {row.startsAtLabel}
                  </p>
                  <p className="mt-2 text-sm text-[var(--bits-navy)]">
                    {row.memberName}
                    {row.ministryName ? ` · ${row.ministryName}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-navy)]">
                    {row.roleLabel} · {row.status === "SCHEDULED" ? "Scheduled" : "Cancelled"}
                  </p>
                  {row.status === "SCHEDULED" ? (
                    <form
                      action={cancelVolunteerServiceAssignmentAction}
                      className="mt-3 grid gap-2"
                    >
                      <input
                        type="hidden"
                        name="assignmentId"
                        value={row.assignmentId}
                      />
                      <label className="text-sm font-medium text-[var(--bits-navy)]">
                        Cancellation note (optional)
                        <input
                          name="cancellationNote"
                          maxLength={140}
                          className={fieldClass}
                        />
                      </label>
                      <button
                        type="submit"
                        className={`w-fit rounded-xl border border-[var(--bits-border)] px-3 py-1.5 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                      >
                        Cancel assignment
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Upcoming volunteer service assignments
                </caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Event
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      When
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Volunteer
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Assignment
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {review.rows.map((row) => (
                    <tr
                      key={row.assignmentId}
                      className="border-b border-[var(--bits-border)] align-top last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.eventTitle}
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.startsAtLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.memberName}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.ministryName
                          ? `${row.ministryName} · ${row.roleLabel}`
                          : row.roleLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.status === "SCHEDULED" ? "Scheduled" : "Cancelled"}
                      </td>
                      <td className="py-3">
                        {row.status === "SCHEDULED" ? (
                          <form
                            action={cancelVolunteerServiceAssignmentAction}
                            className="grid max-w-xs gap-2"
                          >
                            <input
                              type="hidden"
                              name="assignmentId"
                              value={row.assignmentId}
                            />
                            <label className="text-xs font-medium text-[var(--bits-navy)]">
                              Cancellation note (optional)
                              <input
                                name="cancellationNote"
                                maxLength={140}
                                className={fieldClass}
                              />
                            </label>
                            <button
                              type="submit"
                              className={`w-fit rounded-xl border border-[var(--bits-border)] px-3 py-1.5 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                            >
                              Cancel assignment
                            </button>
                          </form>
                        ) : (
                          "—"
                        )}
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
