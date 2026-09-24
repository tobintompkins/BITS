import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MEMBER_ATTENDANCE_EMPTY_COPY,
  memberAttendanceHref,
} from "@/lib/validation/member-attendance";
import { getMemberAttendance } from "@/server/services/member-attendance.service";

function formatAttendanceDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function MemberAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const portal = await getMemberAttendance(query);
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  if (portal.status === "CONNECTION_PENDING") {
    return (
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
          My Attendance
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your church
          membership record before attendance can appear.
        </p>
        <p className="mt-4">
          <Link
            href="/portal/help"
            className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Help &amp; Contact
          </Link>
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            My Attendance
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            A private record of your recent church attendance. This page is
            read-only.
          </p>
        </div>
        <Link
          href="/portal"
          className={`text-sm font-medium text-[var(--bits-navy)] underline ${focusClass}`}
        >
          Member Portal Home
        </Link>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Recent attendance
        </h2>
        {portal.records.length ? (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {portal.records.map((row, index) => (
                <li
                  key={`${row.attendanceDate.toISOString()}:${row.serviceName}:${index}`}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <p className="font-semibold text-[var(--bits-navy)]">
                    {row.serviceName}
                  </p>
                  {row.eventTitle ? (
                    <p className="mt-1 text-sm text-[var(--bits-muted)]">
                      {row.eventTitle}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {formatAttendanceDate(row.attendanceDate)}
                  </p>
                  <p className="mt-2">
                    <span className="rounded-full bg-[var(--bits-page)] px-2 py-0.5 text-xs font-semibold text-[var(--bits-navy)]">
                      {row.statusLabel}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Recent attendance records</caption>
                <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Service / event
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {portal.records.map((row, index) => (
                    <tr
                      key={`${row.attendanceDate.toISOString()}:${row.serviceName}:${index}`}
                      className="border-b border-[var(--bits-border)] last:border-0"
                    >
                      <td className="px-3 py-3">
                        <p className="font-semibold text-[var(--bits-navy)]">
                          {row.serviceName}
                        </p>
                        {row.eventTitle ? (
                          <p className="mt-1 text-xs text-[var(--bits-muted)]">
                            {row.eventTitle}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-[var(--bits-muted)]">
                        {formatAttendanceDate(row.attendanceDate)}
                      </td>
                      <td className="px-3 py-3">{row.statusLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_ATTENDANCE_EMPTY_COPY}{" "}
            <Link
              href="/portal/help"
              className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
          </p>
        )}

        {portal.pageCount > 1 ? (
          <nav
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
            aria-label="Attendance pages"
          >
            <p className="text-[var(--bits-muted)]">
              Page {portal.page} of {portal.pageCount}
            </p>
            <div className="flex gap-2">
              {portal.page > 1 ? (
                <Link
                  href={memberAttendanceHref(portal.page - 1)}
                  className={`rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold ${focusClass}`}
                >
                  Previous
                </Link>
              ) : null}
              {portal.page < portal.pageCount ? (
                <Link
                  href={memberAttendanceHref(portal.page + 1)}
                  className={`rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold ${focusClass}`}
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
