import Link from "next/link";
import { redirect } from "next/navigation";

import { MEMBER_MILESTONES_EMPTY_COPY } from "@/lib/validation/member-milestones";
import { getMemberMilestones } from "@/server/services/member-milestones.service";

function formatMilestoneDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function MemberMilestonesPage() {
  const portal = await getMemberMilestones();
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
          My Milestones
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your church
          membership record before milestones can appear.
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
            My Milestones
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            These are church milestones recorded on your membership record.
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
          Recorded milestones
        </h2>
        {portal.milestones.length ? (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {portal.milestones.map((row, index) => (
                <li
                  key={`${row.milestoneDate.toISOString()}:${row.title}:${index}`}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="font-semibold text-[var(--bits-navy)]">
                      {row.title}
                    </h3>
                    <p className="rounded-full bg-[var(--bits-page)] px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]">
                      {row.typeLabel}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {formatMilestoneDate(row.milestoneDate)}
                  </p>
                  {row.location ? (
                    <p className="mt-1 text-sm text-[var(--bits-muted)]">
                      {row.location}
                    </p>
                  ) : null}
                  {row.officiant ? (
                    <p className="mt-1 text-sm text-[var(--bits-muted)]">
                      {row.officiant}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Recorded church milestones</caption>
                <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Milestone
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Location
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Officiant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {portal.milestones.map((row, index) => (
                    <tr
                      key={`${row.milestoneDate.toISOString()}:${row.title}:${index}`}
                      className="border-b border-[var(--bits-border)] last:border-0"
                    >
                      <td className="px-3 py-3">
                        <p className="font-semibold text-[var(--bits-navy)]">
                          {row.title}
                        </p>
                        <p className="mt-1 text-xs text-[var(--bits-muted)]">
                          {row.typeLabel}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[var(--bits-muted)]">
                        {formatMilestoneDate(row.milestoneDate)}
                      </td>
                      <td className="px-3 py-3 text-[var(--bits-muted)]">
                        {row.location ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-[var(--bits-muted)]">
                        {row.officiant ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_MILESTONES_EMPTY_COPY}{" "}
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
