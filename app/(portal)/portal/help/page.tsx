import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatMemberHelpAddress,
  memberHelpTelHref,
} from "@/lib/validation/member-portal-help";
import { getMemberPortalHelp } from "@/server/services/member-portal-help.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function HelpLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
    >
      {children}
    </Link>
  );
}

export default async function MemberPortalHelpPage() {
  const portal = await getMemberPortalHelp();
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  const { organization } = portal;
  const emailHref = organization.contactEmail
    ? `mailto:${organization.contactEmail}`
    : null;
  const phoneHref = organization.contactPhone
    ? memberHelpTelHref(organization.contactPhone)
    : null;
  const addressText = organization.mailingAddress
    ? formatMemberHelpAddress(organization.mailingAddress)
    : null;
  const hasDirectContact = Boolean(
    emailHref || phoneHref || organization.websiteUrl || addressText,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            Help &amp; Contact
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            Use this page to find common BITS tasks and reach the church office
            when staff help is needed.
          </p>
        </div>
        <Link
          href="/portal"
          className={`text-sm font-medium text-[var(--bits-navy)] underline ${focusClass}`}
        >
          Member Portal Home
        </Link>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Giving &amp; Statements
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-navy)]">
          Review recorded gifts on{" "}
          <HelpLink href="/portal/gifts">My Giving History</HelpLink>. Published
          annual contribution statements appear in{" "}
          <HelpLink href="/portal/statements">My Statements</HelpLink> when
          church staff has released them.
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Profile &amp; Household
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-navy)]">
          Update email, phone, and preferred contact method on{" "}
          <HelpLink href="/portal/profile">My Profile</HelpLink>. Name,
          household membership, and mailing-address changes require church
          staff. See your household connection on{" "}
          <HelpLink href="/portal/household">My Household</HelpLink>.
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Events
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-navy)]">
          Registrations created with your signed-in account are listed on{" "}
          <HelpLink href="/portal/events">My Event Registrations</HelpLink>.
          Cancellations follow each event’s church-set deadline and cannot be
          undone from the portal.
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Need Help?
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-navy)]">
          Contact the {organization.displayName} office when you need staff
          assistance.
          {organization.name !== organization.displayName
            ? ` Legal name: ${organization.name}.`
            : null}
        </p>
        {hasDirectContact ? (
          <div className="mt-4 grid gap-3">
            {emailHref ? (
              <a
                href={emailHref}
                className={`inline-flex w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
              >
                Email the church office
              </a>
            ) : null}
            {phoneHref ? (
              <a
                href={phoneHref}
                className={`inline-flex w-fit rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
              >
                Call {organization.contactPhone}
              </a>
            ) : null}
            {addressText ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                  Mailing address
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[var(--bits-navy)]">
                  {addressText}
                </p>
              </div>
            ) : null}
            {organization.websiteUrl ? (
              <a
                href={organization.websiteUrl}
                rel="noopener noreferrer"
                className={`w-fit text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
              >
                Visit the church website
              </a>
            ) : null}
            {organization.timeZone ? (
              <p className="text-xs text-[var(--bits-muted)]">
                Church time zone: {organization.timeZone}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            The church office contact details are not listed here. Please
            contact the church office in person if you need help.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Privacy &amp; Security
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-navy)]">
          Do not share your password or sign-in link with anyone. Use only your
          own BITS account. Church staff can help connect your account to the
          correct church record, but they will not ask you to send a password.
        </p>
      </section>
    </div>
  );
}
