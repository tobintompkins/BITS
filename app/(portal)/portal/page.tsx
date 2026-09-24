import Link from "next/link";
import { redirect } from "next/navigation";

import { getMemberPortalDashboard } from "@/server/services/member-portal.service";

function formatMoney(value: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

export default async function MemberPortalPage() {
  const portal = await getMemberPortalDashboard();
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
          Member Portal
        </h1>
        <p className="mt-3 text-[var(--bits-muted)]">
          The church organization has not been configured yet.
        </p>
      </section>
    );
  }

  if (portal.status === "CONNECTION_PENDING") {
    return (
      <div className="mx-auto max-w-2xl">
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Secure Member Portal
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--bits-navy)]">
            Welcome{portal.displayName ? `, ${portal.displayName}` : ""}
          </h1>
          <div className="mt-6 rounded-xl border-l-4 border-[var(--bits-gold)] bg-[var(--bits-page)] p-4">
            <h2 className="font-semibold text-[var(--bits-navy)]">
              Your church record is not connected yet
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
              Your sign-in is secure. A church administrator must connect
              {` ${portal.accountEmail} `}to the correct giving record before
              personal giving or statements can appear.
            </p>
          </div>
          <p className="mt-5 text-sm text-[var(--bits-muted)]">
            Please contact the church office if you need assistance.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
            <Link
              href="/portal/ministries"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              My Ministries
            </Link>
            <Link
              href="/portal/attendance"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              My Attendance
            </Link>
            <Link
              href="/portal/milestones"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              My Milestones
            </Link>
            <Link
              href="/portal/announcements"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Church Announcements
            </Link>
            <Link
              href="/portal/help"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Help &amp; Contact
            </Link>
            <Link
              href="/portal/privacy"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Privacy &amp; Data
            </Link>
          </div>
          {portal.hasLeadershipAccess ? (
            <Link
              href="/dashboard"
              className="mt-6 inline-flex rounded-xl bg-[var(--bits-navy)] px-5 py-3 text-sm font-semibold text-white"
            >
              Open Leadership Portal
            </Link>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-[var(--bits-navy-deep)] p-6 text-white shadow-lg sm:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
          Welcome Home
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">
              {portal.donor.firstName} {portal.donor.lastName}
            </h1>
            <p className="mt-2 text-white/70">{portal.organizationName}</p>
          </div>
          {portal.hasLeadershipAccess ? (
            <Link
              href="/dashboard"
              className="rounded-xl bg-[var(--bits-gold)] px-4 py-2 text-sm font-bold text-[var(--bits-navy-deep)]"
            >
              Leadership Portal
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Year-to-Date Giving", formatMoney(portal.yearGiving.totalAmount)],
          ["Tax-Deductible Giving", formatMoney(portal.yearGiving.deductibleAmount)],
          ["Gifts Recorded", String(portal.yearGiving.giftCount)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-[var(--bits-muted)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
              {value}
            </p>
            <p className="mt-1 text-xs text-[var(--bits-muted)]">{portal.year}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/portal/gifts"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            My Giving History
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Review your recorded gifts by year and fund.
          </p>
        </Link>
        <Link
          href="/portal/statements"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            My Statements
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Open published contribution statements when they are available.
          </p>
        </Link>
        <Link
          href="/portal/household"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            My Household
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            See your household connection and whether you are authorized to
            receive household statements.
          </p>
        </Link>
        <Link
          href="/portal/ministries"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            My Ministries
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Review the church ministries assigned to your membership record.
          </p>
        </Link>
        <Link
          href="/portal/attendance"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            My Attendance
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Review your recent church attendance.
          </p>
        </Link>
        <Link
          href="/portal/milestones"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            My Milestones
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Review baptism, membership, and other recorded church milestones.
          </p>
        </Link>
        <Link
          href="/portal/events"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            My Event Registrations
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Review event registrations created with your signed-in account.
          </p>
        </Link>
        <Link
          href="/portal/announcements"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            Church Announcements
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Read published notes from church leadership.
          </p>
        </Link>
        <Link
          href="/portal/profile"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            My Profile &amp; Preferences
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Update your email, phone, and preferred contact method.
          </p>
        </Link>
        <Link
          href="/portal/help"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            Help &amp; Contact
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Find common BITS tasks and reach the church office when you need
            staff help.
          </p>
        </Link>
        <Link
          href="/portal/privacy"
          className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            Privacy &amp; Data
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Ask the church office for a copy of your BITS information or a
            contact correction.
          </p>
        </Link>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            Recent Giving
          </h2>
          {portal.recentGifts.length ? (
            <ul className="mt-4 divide-y divide-[var(--bits-border)]">
              {portal.recentGifts.map((gift) => (
                <li key={gift.id} className="flex justify-between gap-4 py-3 text-sm">
                  <span>
                    <span className="block font-medium">{formatDate(gift.offeringDate)}</span>
                    <span className="text-xs text-[var(--bits-muted)]">
                      {gift.paymentMethod.replaceAll("_", " ")}
                      {gift.isTest ? " · Stripe test" : ""}
                    </span>
                  </span>
                  <span className="font-semibold text-[var(--bits-navy)]">
                    {formatMoney(gift.totalAmount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[var(--bits-muted)]">
              No giving has been connected to this account yet.
            </p>
          )}
          <p className="mt-4">
            <Link
              href="/portal/gifts"
              className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              My Giving History
            </Link>
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            Available Statements
          </h2>
          {portal.statements.length ? (
            <ul className="mt-4 divide-y divide-[var(--bits-border)]">
              {portal.statements.map((statement) => (
                <li key={statement.id} className="py-3 text-sm">
                  <p className="font-medium">{statement.statementIdentifier}</p>
                  <p className="mt-1 text-xs text-[var(--bits-muted)]">
                    {formatDate(statement.periodStart)}–{formatDate(statement.periodEnd)}
                    {" · "}
                    {formatMoney(statement.deductibleTotal)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-[var(--bits-muted)]">
              No published statements are available yet.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          My Contact Information
        </h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--bits-muted)]">Email</dt>
            <dd className="mt-1 font-medium">{portal.donor.email ?? "Not provided"}</dd>
          </div>
          <div>
            <dt className="text-[var(--bits-muted)]">Phone</dt>
            <dd className="mt-1 font-medium">{portal.donor.phone ?? "Not provided"}</dd>
          </div>
        </dl>
        <p className="mt-4">
          <Link
            href="/portal/profile"
            className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            My Profile &amp; Preferences
          </Link>
        </p>
      </section>
    </div>
  );
}
