import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MEMBER_COMMUNICATION_HISTORY_EMPTY_COPY,
  MEMBER_COMMUNICATION_HISTORY_NOTICE,
  MEMBER_COMMUNICATION_HISTORY_PENDING_COPY,
  memberCommunicationPreferencesHref,
} from "@/lib/validation/member-communication-history";
import { getMemberCommunicationHistory } from "@/server/services/member-communication-history.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function PreferencesLink({ className }: { className?: string }) {
  return (
    <Link
      href={memberCommunicationPreferencesHref}
      className={`inline-flex rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass} ${className ?? ""}`}
    >
      Update Communication Preferences
    </Link>
  );
}

export default async function MemberCommunicationHistoryPage() {
  const portal = await getMemberCommunicationHistory();
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
          My Communication History
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          {MEMBER_COMMUNICATION_HISTORY_PENDING_COPY}
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
            My Communication History
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_COMMUNICATION_HISTORY_NOTICE}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PreferencesLink />
          <Link
            href="/portal"
            className={`text-sm font-medium text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Member Portal Home
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Preference changes
        </h2>
        {portal.rows.length === 0 ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-6 text-[var(--bits-muted)]">
              {MEMBER_COMMUNICATION_HISTORY_EMPTY_COPY}
            </p>
            <PreferencesLink />
          </div>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 sm:hidden">
              {portal.rows.map((row) => (
                <li
                  key={`${row.preferenceLabel}-${row.changedAtLabel}-${row.sourceLabel}-${row.newValueLabel}`}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
                    {row.preferenceLabel}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--bits-navy)]">
                    {row.previousValueLabel} → {row.newValueLabel}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {row.sourceLabel}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {row.changedAtLabel}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Communication and privacy preference changes
                </caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Preference
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Changed from
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Changed to
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Source
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {portal.rows.map((row) => (
                    <tr
                      key={`${row.preferenceLabel}-${row.changedAtLabel}-${row.sourceLabel}-${row.newValueLabel}`}
                      className="border-b border-[var(--bits-border)] align-top last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.preferenceLabel}
                      </th>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.previousValueLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.newValueLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.sourceLabel}
                      </td>
                      <td className="py-3 text-[var(--bits-navy)]">
                        {row.changedAtLabel}
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
