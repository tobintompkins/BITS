import Link from "next/link";
import { redirect } from "next/navigation";

import {
  LEADERSHIP_SECURITY_ACTIVITY_CATEGORIES,
  LEADERSHIP_SECURITY_ACTIVITY_CATEGORY_LABELS,
  LEADERSHIP_SECURITY_ACTIVITY_EMPTY_COPY,
  LEADERSHIP_SECURITY_ACTIVITY_NOTICE,
  LEADERSHIP_SECURITY_ACTIVITY_SUBTITLE,
} from "@/lib/validation/leadership-security-activity";
import { getLeadershipSecurityActivity } from "@/server/services/leadership-security-activity.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function LeadershipSecurityActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const query = await searchParams;
  const activity = await getLeadershipSecurityActivity(query);

  if (activity.status === "SIGNED_OUT") redirect("/sign-in");
  if (activity.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (activity.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = activity.status === "READY" ? activity.rows : [];
  const category = activity.status === "READY" ? activity.category : null;
  const categoryCounts =
    activity.status === "READY" ? activity.categoryCounts : [];
  const relatedLinks =
    activity.status === "READY" ? activity.relatedLinks : [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Leadership Security Activity
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {LEADERSHIP_SECURITY_ACTIVITY_SUBTITLE}
        </p>
      </header>

      <aside
        role="note"
        className="rounded-2xl border border-[var(--bits-gold)] bg-white p-4 shadow-sm"
      >
        <p className="text-sm leading-6 text-[var(--bits-navy)]">
          {LEADERSHIP_SECURITY_ACTIVITY_NOTICE} BITS records selected
          application actions for this church. It cannot show Clerk sign-in
          history, devices, IP addresses, or two-factor-authentication events.
        </p>
      </aside>

      {activity.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid activity category.
        </p>
      ) : null}

      {categoryCounts.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categoryCounts.map((item) => (
            <li
              key={item.category}
              className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm"
            >
              <p className="text-sm text-[var(--bits-muted)]">
                {item.categoryLabel}
              </p>
              <p className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
                {item.count}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto]"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Category
          <select
            name="category"
            defaultValue={category ?? ""}
            className={fieldClass}
          >
            <option value="">All recorded security activity</option>
            {LEADERSHIP_SECURITY_ACTIVITY_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {LEADERSHIP_SECURITY_ACTIVITY_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Apply filter
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Recent recorded actions
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {LEADERSHIP_SECURITY_ACTIVITY_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 lg:hidden">
              {rows.map((row, index) => (
                <li
                  key={`${row.occurredAtIso}-${row.actionLabel}-${index}`}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <p className="text-sm text-[var(--bits-muted)]">
                    <time dateTime={row.occurredAtIso}>{row.occurredAtLabel}</time>
                  </p>
                  <p className="mt-1 font-semibold text-[var(--bits-navy)]">
                    {row.actionLabel}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-navy)]">
                    {row.categoryLabel}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    Performed by {row.performedBy}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
                    {row.summary}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Recent sensitive actions recorded inside BITS
                </caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Date & Time
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Category
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Action
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Performed By
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Safe Summary
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={`${row.occurredAtIso}-${row.actionLabel}-${index}`}
                      className="border-b border-[var(--bits-border)] align-top last:border-0"
                    >
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        <time dateTime={row.occurredAtIso}>
                          {row.occurredAtLabel}
                        </time>
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.categoryLabel}
                      </td>
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.actionLabel}
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.performedBy}
                      </td>
                      <td className="py-3 text-[var(--bits-navy)]">
                        {row.summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {relatedLinks.length > 0 ? (
        <nav aria-label="Related administration pages" className="flex flex-wrap gap-3">
          {relatedLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
