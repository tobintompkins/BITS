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
      </section>
    </div>
  );
}
