import Link from "next/link";
import { redirect } from "next/navigation";

import { MEMBER_PRAYER_REQUESTS_EMPTY_COPY } from "@/lib/validation/member-prayer-requests";
import { getMemberPrayerRequests } from "@/server/services/member-prayer-requests.service";

function formatPrayerDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function MemberPrayerRequestsPage() {
  const portal = await getMemberPrayerRequests();
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
          My Prayer Requests
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your church
          membership record before prayer requests can appear.
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
            My Prayer Requests
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            These are prayer requests connected to your membership record.
            This page is read-only.
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
          Connected requests
        </h2>
        {portal.requests.length ? (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {portal.requests.map((row, index) => (
                <li
                  key={`${row.submittedAt.toISOString()}:${index}`}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <p className="font-semibold text-[var(--bits-navy)]">
                    {row.request}
                  </p>
                  <p className="mt-2 text-sm text-[var(--bits-muted)]">
                    Submitted {formatPrayerDate(row.submittedAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <p className="rounded-full bg-[var(--bits-page)] px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]">
                      {row.statusLabel}
                    </p>
                    <p className="rounded-full bg-[var(--bits-page)] px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]">
                      {row.privacyLabel}
                    </p>
                  </div>
                  {row.answeredAt ? (
                    <p className="mt-2 text-sm text-[var(--bits-muted)]">
                      Answered {formatPrayerDate(row.answeredAt)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Prayer requests connected to your membership record
                </caption>
                <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Request
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Submitted
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Privacy
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Answered
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {portal.requests.map((row, index) => (
                    <tr
                      key={`${row.submittedAt.toISOString()}:${index}`}
                      className="border-b border-[var(--bits-border)] last:border-0"
                    >
                      <td className="px-3 py-3 font-semibold text-[var(--bits-navy)]">
                        {row.request}
                      </td>
                      <td className="px-3 py-3 text-[var(--bits-muted)]">
                        {formatPrayerDate(row.submittedAt)}
                      </td>
                      <td className="px-3 py-3 text-[var(--bits-muted)]">
                        {row.statusLabel}
                      </td>
                      <td className="px-3 py-3 text-[var(--bits-muted)]">
                        {row.privacyLabel}
                      </td>
                      <td className="px-3 py-3 text-[var(--bits-muted)]">
                        {row.answeredAt
                          ? formatPrayerDate(row.answeredAt)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_PRAYER_REQUESTS_EMPTY_COPY}{" "}
            <Link
              href="/portal/help"
              className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
