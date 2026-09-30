import Link from "next/link";
import { redirect } from "next/navigation";

import {
  UPCOMING_CELEBRATIONS_EMPTY_COPY,
  UPCOMING_CELEBRATIONS_MEMBERS_HREF,
  UPCOMING_CELEBRATIONS_NOTICE,
  UPCOMING_CELEBRATIONS_SUBTITLE,
  formatCelebrationDaysAway,
  type UpcomingCelebrationRow,
} from "@/lib/validation/upcoming-celebrations";
import { getUpcomingCelebrations } from "@/server/services/upcoming-celebrations.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
      <p className="text-sm text-[var(--bits-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
        {value}
      </p>
    </li>
  );
}

function CelebrationItem({ row }: { row: UpcomingCelebrationRow }) {
  return (
    <li className="rounded-xl border border-[var(--bits-border)] bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--bits-gold-dark)]">
        {row.kind}
      </p>
      <p className="mt-1 font-semibold text-[var(--bits-navy)]">
        {row.displayName}
      </p>
      <p className="mt-1 text-sm text-[var(--bits-navy)]">
        {row.occurrenceLabel}
      </p>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        {row.monthDayLabel} · {formatCelebrationDaysAway(row.daysAway)}
      </p>
    </li>
  );
}

export default async function UpcomingCelebrationsPage() {
  const view = await getUpcomingCelebrations();

  if (view.status === "SIGNED_OUT") redirect("/sign-in");
  if (view.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (view.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = view.status === "READY" ? view.rows : [];
  const counts =
    view.status === "READY"
      ? view.counts
      : { birthdays: 0, anniversaries: 0 };
  const canViewMembers =
    view.status === "READY" ? view.canViewMembers : false;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Church Life
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Upcoming Celebrations
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {UPCOMING_CELEBRATIONS_SUBTITLE}
        </p>
        {canViewMembers ? (
          <p className="mt-3">
            <Link
              href={UPCOMING_CELEBRATIONS_MEMBERS_HREF}
              className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              View Members
            </Link>
          </p>
        ) : null}
      </header>

      <aside
        role="note"
        className="rounded-2xl border border-[var(--bits-gold)] bg-white p-4 shadow-sm"
      >
        <p className="text-sm leading-6 text-[var(--bits-navy)]">
          {UPCOMING_CELEBRATIONS_NOTICE}
        </p>
      </aside>

      <ul className="grid gap-3 sm:grid-cols-2">
        <SummaryCard label="Upcoming Birthdays" value={counts.birthdays} />
        <SummaryCard
          label="Upcoming Anniversaries"
          value={counts.anniversaries}
        />
      </ul>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        {rows.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--bits-muted)]">
            {UPCOMING_CELEBRATIONS_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="grid gap-3 lg:hidden">
              {rows.map((row, index) => (
                <CelebrationItem
                  key={`${row.kind}-${row.displayName}-${row.monthDayLabel}-${index}`}
                  row={row}
                />
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Upcoming birthdays and marriage anniversaries
                </caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Name
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Kind
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Date
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={`row-${row.kind}-${row.displayName}-${row.monthDayLabel}-${index}`}
                      className="border-b border-[var(--bits-border)] align-top last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.displayName}
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.kind}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.occurrenceLabel}
                        <span className="mt-1 block text-[var(--bits-muted)]">
                          {row.monthDayLabel}
                        </span>
                      </td>
                      <td className="py-3 text-[var(--bits-navy)]">
                        {formatCelebrationDaysAway(row.daysAway)}
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
