import Link from "next/link";
import { redirect } from "next/navigation";

import { CancelMemberRegistrationForm } from "@/app/(portal)/portal/events/cancel-registration-form";
import { memberEventCalendarHref } from "@/lib/validation/member-event-calendar";
import {
  memberEventNoticeMessages,
  memberEventRegistrationsHref,
  parseMemberEventNotice,
} from "@/lib/validation/member-event-registrations";
import { getMemberEventRegistrations } from "@/server/services/member-event-registrations.service";

function formatEventWhen(row: {
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
}) {
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: row.timezone,
  });
  if (row.isAllDay) {
    const start = dateFmt.format(row.startDateTime);
    const end = dateFmt.format(row.endDateTime);
    return start === end ? start : `${start} – ${end}`;
  }
  const start = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: row.timezone,
  }).format(row.startDateTime);
  const endTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: row.timezone,
  }).format(row.endDateTime);
  return `${start} – ${endTime}`;
}

function RegistrationCalendarAction({
  registrationId,
  eventTitle,
  canAddToCalendar,
  calendarUnavailableReason,
}: {
  registrationId?: string;
  eventTitle: string;
  canAddToCalendar: boolean;
  calendarUnavailableReason: string | null;
}) {
  if (canAddToCalendar && registrationId) {
    return (
      <a
        href={memberEventCalendarHref(registrationId)}
        className="inline-flex rounded-xl border border-[var(--bits-border)] px-3 py-1.5 text-sm font-semibold text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        Add to calendar
        <span className="sr-only"> for {eventTitle}</span>
      </a>
    );
  }
  if (calendarUnavailableReason) {
    return (
      <p className="text-xs leading-5 text-[var(--bits-muted)]">
        {calendarUnavailableReason}
      </p>
    );
  }
  return null;
}

function formatLocation(
  location: {
    name: string;
    roomName: string | null;
    isOnline: boolean;
    city: string | null;
    state: string | null;
  } | null,
) {
  if (!location) return null;
  const cityLine = [location.city, location.state]
    .filter((part) => part?.trim())
    .join(", ");
  const parts = [
    location.name,
    location.roomName,
    cityLine,
    location.isOnline ? "Online" : null,
  ].filter((part) => part?.trim());
  return parts.join(" · ");
}

export default async function MemberEventRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const portal = await getMemberEventRegistrations(query);
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  const filters = {
    view: portal.view,
    status: portal.statusFilter,
    page: portal.page,
  };
  const notice = parseMemberEventNotice(query.notice);
  const noticeCopy = notice ? memberEventNoticeMessages[notice] : null;

  return (
    <div className="space-y-6">
      {noticeCopy ? (
        <p
          role="status"
          className={
            noticeCopy.tone === "success"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950"
          }
        >
          {noticeCopy.message}
        </p>
      ) : null}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            My Event Registrations
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            Only registrations created with your signed-in account are shown.
            This list does not include other people’s registrations.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
          <Link
            href="/portal"
            className="text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Member Portal Home
          </Link>
          <Link
            href="/church-events"
            className="text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Public Events
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <form
          className="flex flex-wrap items-end gap-3"
          action="/portal/events"
        >
          <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
            Show
            <select
              name="view"
              defaultValue={portal.view}
              className="min-w-36 rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2"
            >
              <option value="upcoming">Upcoming</option>
              <option value="past">Past</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
            Status
            <select
              name="status"
              defaultValue={portal.statusFilter}
              className="min-w-40 rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="waitlisted">Waitlisted</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Apply filters
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          {portal.view === "upcoming"
            ? "Upcoming registrations"
            : "Past registrations"}
        </h2>
        {portal.registrations.length ? (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {portal.registrations.map((row) => {
                const location = formatLocation(row.location);
                return (
                  <li
                    key={row.confirmationCode}
                    className="rounded-xl border border-[var(--bits-border)] p-4"
                  >
                    <p className="font-semibold text-[var(--bits-navy)]">
                      {row.eventTitle}
                    </p>
                    <p className="mt-1 text-sm text-[var(--bits-muted)]">
                      {formatEventWhen(row)}
                    </p>
                    {location ? (
                      <p className="mt-1 text-sm text-[var(--bits-muted)]">
                        {location}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm">
                      <span className="rounded-full bg-[var(--bits-page)] px-2 py-0.5 text-xs font-semibold text-[var(--bits-navy)]">
                        {row.registrationStatus}
                      </span>
                      <span className="ml-2 text-[var(--bits-muted)]">
                        Party of {row.partySize}
                      </span>
                    </p>
                    <p className="mt-2 font-mono text-sm font-semibold tracking-wide text-[var(--bits-navy)]">
                      {row.confirmationCode}
                    </p>
                    <div className="mt-3 grid gap-2">
                      <RegistrationCalendarAction
                        registrationId={row.id}
                        eventTitle={row.eventTitle}
                        canAddToCalendar={row.canAddToCalendar}
                        calendarUnavailableReason={
                          row.calendarUnavailableReason
                        }
                      />
                      {row.canCancel && row.id ? (
                        <CancelMemberRegistrationForm
                          registrationId={row.id}
                          view={filters.view}
                          status={filters.status}
                          page={filters.page}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  {portal.view === "upcoming" ? "Upcoming" : "Past"} event
                  registrations
                </caption>
                <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Event
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Date / time
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Party size
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Confirmation
                    </th>
                    <th scope="col" className="px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {portal.registrations.map((row) => {
                    const location = formatLocation(row.location);
                    return (
                      <tr
                        key={row.confirmationCode}
                        className="border-b border-[var(--bits-border)] last:border-0"
                      >
                        <td className="px-3 py-3">
                          <p className="font-semibold text-[var(--bits-navy)]">
                            {row.eventTitle}
                          </p>
                          {location ? (
                            <p className="mt-1 text-xs text-[var(--bits-muted)]">
                              {location}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-[var(--bits-muted)]">
                          {formatEventWhen(row)}
                        </td>
                        <td className="px-3 py-3">
                          {row.registrationStatus}
                        </td>
                        <td className="px-3 py-3">{row.partySize}</td>
                        <td className="px-3 py-3 font-mono font-semibold tracking-wide text-[var(--bits-navy)]">
                          {row.confirmationCode}
                        </td>
                        <td className="px-3 py-3">
                          <div className="grid justify-items-start gap-2">
                            <RegistrationCalendarAction
                              registrationId={row.id}
                              eventTitle={row.eventTitle}
                              canAddToCalendar={row.canAddToCalendar}
                              calendarUnavailableReason={
                                row.calendarUnavailableReason
                              }
                            />
                            {row.canCancel && row.id ? (
                              <CancelMemberRegistrationForm
                                registrationId={row.id}
                                view={filters.view}
                                status={filters.status}
                                page={filters.page}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {portal.view === "upcoming"
              ? "You do not have any upcoming event registrations."
              : "You do not have any past event registrations."}{" "}
            New registrations can be made from the{" "}
            <Link
              href="/church-events"
              className="font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              public Events page
            </Link>
            .
          </p>
        )}

        {portal.pageCount > 1 ? (
          <nav
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
            aria-label="Event registration pages"
          >
            <p className="text-[var(--bits-muted)]">
              Page {portal.page} of {portal.pageCount}
            </p>
            <div className="flex gap-2">
              {portal.page > 1 ? (
                <Link
                  href={memberEventRegistrationsHref({
                    ...filters,
                    page: portal.page - 1,
                  })}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Previous
                </Link>
              ) : null}
              {portal.page < portal.pageCount ? (
                <Link
                  href={memberEventRegistrationsHref({
                    ...filters,
                    page: portal.page + 1,
                  })}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>

      <p
        role="note"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
      >
        Eligible upcoming registrations can be cancelled here when the church
        still allows it. Cancellation depends on the event’s church-set deadline
        and cannot be undone from the portal. To register for another event,
        visit the{" "}
        <Link
          href="/church-events"
          className="font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          public Events page
        </Link>
        .
      </p>
    </div>
  );
}
