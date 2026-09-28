import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MEMBER_VOLUNTEER_TRAINING_EMPTY_COPY,
  MEMBER_VOLUNTEER_TRAINING_NOTICE,
  MEMBER_VOLUNTEER_TRAINING_PENDING_COPY,
} from "@/lib/validation/member-volunteer-training";
import { getMemberVolunteerTraining } from "@/server/services/member-volunteer-training.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

export default async function MemberVolunteerTrainingPage() {
  const portal = await getMemberVolunteerTraining();
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
          My Training
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          {MEMBER_VOLUNTEER_TRAINING_PENDING_COPY}
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
            My Training
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_VOLUNTEER_TRAINING_NOTICE}{" "}
            <Link
              href="/portal/help"
              className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
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
          Your training
        </h2>
        {portal.rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_VOLUNTEER_TRAINING_EMPTY_COPY}{" "}
            <Link
              href="/portal/help"
              className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {portal.rows.map((row) => (
              <li
                key={`${row.title}-${row.completedOnLabel}-${row.ministryName ?? "none"}`}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
                    {row.title}
                  </h3>
                  <p className="rounded-full bg-[var(--bits-page)] px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]">
                    {row.statusLabel}
                  </p>
                </div>
                {row.ministryName ? (
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {row.ministryName}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-[var(--bits-navy)]">
                  Completed {row.completedOnLabel}
                  {row.expiresOnLabel ? ` · Expires ${row.expiresOnLabel}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
