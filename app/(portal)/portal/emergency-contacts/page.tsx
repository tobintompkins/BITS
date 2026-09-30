import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MEMBER_EMERGENCY_CONTACTS_CORRECTION_COPY,
  MEMBER_EMERGENCY_CONTACTS_EMPTY_COPY,
  MEMBER_EMERGENCY_CONTACTS_NOTICE,
  MEMBER_EMERGENCY_CONTACTS_PENDING_COPY,
} from "@/lib/validation/member-emergency-contacts";
import { getMemberEmergencyContacts } from "@/server/services/member-emergency-contacts.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function HelpLink({ children }: { children: ReactNode }) {
  return (
    <Link
      href="/portal/help"
      className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
    >
      {children}
    </Link>
  );
}

export default async function MemberEmergencyContactsPage() {
  const portal = await getMemberEmergencyContacts();
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
          My Emergency Contacts
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          {MEMBER_EMERGENCY_CONTACTS_PENDING_COPY}
        </p>
        <p className="mt-4">
          <HelpLink>Help &amp; Contact</HelpLink>
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
            My Emergency Contacts
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_EMERGENCY_CONTACTS_NOTICE}{" "}
            {MEMBER_EMERGENCY_CONTACTS_CORRECTION_COPY}{" "}
            <HelpLink>Help &amp; Contact</HelpLink>
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
          Recorded contacts
        </h2>
        {portal.rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_EMERGENCY_CONTACTS_EMPTY_COPY}{" "}
            <HelpLink>Help &amp; Contact</HelpLink>
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {portal.rows.map((row) => (
              <li
                key={`${row.name}-${row.relationship}-${row.phone}`}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
                    {row.name}
                  </h3>
                  <p className="rounded-full bg-[var(--bits-page)] px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]">
                    {row.primaryStatusLabel}
                  </p>
                </div>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {row.relationship}
                </p>
                <p className="mt-2 text-sm text-[var(--bits-navy)]">{row.phone}</p>
                {row.email ? (
                  <p className="mt-1 text-sm text-[var(--bits-navy)]">{row.email}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
