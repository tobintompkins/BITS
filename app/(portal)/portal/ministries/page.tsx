import Link from "next/link";
import { redirect } from "next/navigation";

import { MEMBER_MINISTRIES_EMPTY_COPY } from "@/lib/validation/member-ministries";
import { getMemberMinistries } from "@/server/services/member-ministries.service";

function formatJoinedDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function MemberMinistriesPage() {
  const portal = await getMemberMinistries();
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
          My Ministries
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your church
          membership record before ministry assignments can appear.
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
            My Ministries
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            These are the church ministries currently assigned to your
            membership record. This page is read-only.
          </p>
        </div>
        <Link
          href="/portal"
          className={`text-sm font-medium text-[var(--bits-navy)] underline ${focusClass}`}
        >
          Member Portal Home
        </Link>
      </header>

      <section className="space-y-4">
        {portal.ministries.length ? (
          <ul className="grid gap-4">
            {portal.ministries.map((ministry) => {
              const joined = formatJoinedDate(ministry.joinedDate);
              return (
                <li
                  key={`${ministry.ministryName}:${ministry.roleLabel}`}
                  className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
                      {ministry.ministryName}
                    </h2>
                    <p className="rounded-full bg-[var(--bits-page)] px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]">
                      {ministry.roleLabel}
                    </p>
                  </div>
                  {joined ? (
                    <p className="mt-1 text-sm text-[var(--bits-muted)]">
                      Joined {joined}
                    </p>
                  ) : null}
                  {ministry.description ? (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--bits-navy)]">
                      {ministry.description}
                    </p>
                  ) : null}
                  {ministry.meetingSchedule ? (
                    <p className="mt-3 text-sm text-[var(--bits-muted)]">
                      {ministry.meetingSchedule}
                    </p>
                  ) : null}
                  {ministry.location ? (
                    <p className="mt-1 text-sm text-[var(--bits-muted)]">
                      {ministry.location}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 text-sm leading-6 text-[var(--bits-muted)] shadow-sm">
            {MEMBER_MINISTRIES_EMPTY_COPY}{" "}
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
