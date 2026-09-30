import Link from "next/link";
import { redirect } from "next/navigation";

import {
  LEADERSHIP_HELP_CONTACT_FALLBACK,
  LEADERSHIP_HELP_NOT_YET,
  LEADERSHIP_HELP_SUBTITLE,
  hasLeadershipHelpContact,
  leadershipHelpTelHref,
  type LeadershipHelpCard,
} from "@/lib/leadership-help/leadership-help";
import { getLeadershipHelp } from "@/server/services/leadership-help.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function GuideCard({ card }: { card: LeadershipHelpCard }) {
  return (
    <article className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
        {card.title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
        {card.summary}
      </p>
      <ul className="mt-4 grid gap-2">
        {card.links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default async function LeadershipHelpCenterPage() {
  const help = await getLeadershipHelp();

  if (help.status === "SIGNED_OUT") redirect("/sign-in");
  if (help.status === "NO_ORGANIZATION") redirect("/settings/organization");

  const cards = help.status === "READY" ? help.cards : [];
  const contact =
    help.status === "READY"
      ? help.contact
      : {
          displayName: "the church",
          contactEmail: null,
          contactPhone: null,
          websiteUrl: null,
        };
  const emailHref = contact.contactEmail
    ? `mailto:${contact.contactEmail}`
    : null;
  const phoneHref = contact.contactPhone
    ? leadershipHelpTelHref(contact.contactPhone)
    : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Administration
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Leadership Help Center
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {LEADERSHIP_HELP_SUBTITLE}
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Start Here
        </h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--bits-navy)]">
          <li>Find your ministry area in the navigation.</li>
          <li>Review what needs attention.</li>
          <li>Ask the church office or pastor when you are unsure.</li>
        </ol>
      </section>

      {cards.length > 0 ? (
        <section>
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Guides for your role
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {cards.map((card) => (
              <GuideCard key={card.id} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      <article className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Shared Computer Safety
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
          Leadership pages sign you out after a period of inactivity so church
          information stays protected on a shared computer. Sign out when you
          are finished, especially in the church office, sound booth, or another
          shared space.
        </p>
      </article>

      <article className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Need Help?
        </h2>
        {hasLeadershipHelpContact(contact) ? (
          <div className="mt-3 grid gap-3 text-sm leading-6 text-[var(--bits-navy)]">
            <p>
              Contact the {contact.displayName} office when you need staff
              assistance.
            </p>
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
                Call {contact.contactPhone}
              </a>
            ) : null}
            {contact.websiteUrl ? (
              <a
                href={contact.websiteUrl}
                rel="noopener noreferrer"
                className={`w-fit text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
              >
                Visit the church website
              </a>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
            {LEADERSHIP_HELP_CONTACT_FALLBACK}
          </p>
        )}
      </article>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          What BITS Does Not Do Yet
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--bits-navy)]">
          {LEADERSHIP_HELP_NOT_YET.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
