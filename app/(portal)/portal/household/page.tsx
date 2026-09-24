import Link from "next/link";
import { redirect } from "next/navigation";

import { getMemberHouseholdSummary } from "@/server/services/member-household-summary.service";

function formatAddress(row: {
  mailingAddressLine1: string;
  mailingAddressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}) {
  const cityLine = [row.city, row.state]
    .filter((part) => part.trim())
    .join(", ");
  const lines = [
    row.mailingAddressLine1,
    row.mailingAddressLine2,
    `${cityLine}${row.postalCode.trim() ? ` ${row.postalCode}` : ""}`,
    row.country,
  ]
    .map((line) => line?.trim())
    .filter(Boolean);
  return lines.join("\n");
}

function HouseholdPageLinks() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
      <Link
        href="/portal/statements"
        className="text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        My Statements
      </Link>
      <Link
        href="/portal/profile"
        className="text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        My Profile &amp; Preferences
      </Link>
    </div>
  );
}

function StaffChangeNote() {
  return (
    <p className="text-sm leading-6 text-[var(--bits-muted)]">
      Household changes must be requested through church staff. Members cannot
      update household names, addresses, members, preferred recipients, or
      statement delivery from this page.
    </p>
  );
}

export default async function MemberHouseholdPage() {
  const portal = await getMemberHouseholdSummary();
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
          My Household
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your donor
          record before household information can appear.
        </p>
      </section>
    );
  }

  if (portal.status === "NO_HOUSEHOLD") {
    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
              Private Member Access
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
              My Household
            </h1>
          </div>
          <HouseholdPageLinks />
        </header>
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
          <p className="text-sm leading-6 text-[var(--bits-muted)]">
            We do not currently have an active household connection on your
            giving record. Please contact the church office if you believe this
            is incorrect.
          </p>
          <div className="mt-4">
            <StaffChangeNote />
          </div>
        </section>
      </div>
    );
  }

  if (portal.status === "NEEDS_REVIEW") {
    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
              Private Member Access
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
              My Household
            </h1>
          </div>
          <HouseholdPageLinks />
        </header>
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-[var(--bits-navy)]">
            Church staff need to review this record
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
            More than one active household connection is on file. Please contact
            the church office so staff can review your record before household
            details can be shown.
          </p>
          <div className="mt-4">
            <StaffChangeNote />
          </div>
        </section>
      </div>
    );
  }

  const { household } = portal;
  const recipientStatus = household.isPreferredStatementRecipient
    ? "You are authorized to receive household statements"
    : "Household statements are assigned to another authorized household recipient";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            My Household
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            This page shows your current household connection. It does not list
            other household members.
          </p>
        </div>
        <HouseholdPageLinks />
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          {household.displayName}
        </h2>
        <dl className="mt-4 grid gap-4 text-sm">
          <div>
            <dt className="text-[var(--bits-muted)]">Household mailing address</dt>
            <dd className="mt-1 whitespace-pre-line font-medium">
              {formatAddress(household.mailingAddress)}
            </dd>
          </div>
          {household.relationshipLabel ? (
            <div>
              <dt className="text-[var(--bits-muted)]">Your relationship</dt>
              <dd className="mt-1 font-medium">{household.relationshipLabel}</dd>
            </div>
          ) : null}
          {household.statementDeliveryMethodLabel ? (
            <div>
              <dt className="text-[var(--bits-muted)]">Statement delivery</dt>
              <dd className="mt-1 font-medium">
                {household.statementDeliveryMethodLabel}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Household statements
        </h2>
        <p className="mt-3 rounded-xl border-l-4 border-[var(--bits-gold)] bg-[var(--bits-page)] p-4 text-sm font-semibold text-[var(--bits-navy)]">
          {recipientStatus}
        </p>
        <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
          {portal.authorizationExplanation}
        </p>
        <div className="mt-4">
          <StaffChangeNote />
        </div>
      </section>
    </div>
  );
}
