import Link from "next/link";

import { getCareDashboardWidgets } from "@/app/(staff)/care/actions";
import { getEventDashboardWidgets } from "@/app/(staff)/events/actions";
import { getEngagementDashboardWidgets } from "@/app/(staff)/member-engagement/actions";
import { getLifecycleDashboardWidgets } from "@/app/(staff)/member-lifecycle/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type DashboardWidget = {
  key: string;
  label: string;
  count: number;
  href: string;
};

const notificationPlaceholders = [
  "Follow-up assigned",
  "Follow-up due soon",
  "Follow-up overdue",
  "Pastoral care follow-up due",
  "Prayer request assigned",
  "Communication follow-up due",
  "Document expires in 30 days",
  "Document expires in 7 days",
  "Document expired",
  "Ministry without leader",
  "Event assigned to organizer",
  "Event published",
  "Event cancelled",
  "Event begins soon",
  "Registration opens",
  "Registration closes",
  "Registration confirmed",
  "Registration waitlisted",
  "Waitlist promoted",
  "Registration cancelled",
  "Event reminder",
  "Check-in ready",
];

export default async function DashboardPage() {
  const organization = await findPrimaryOrganization();
  const emptyWidgets = { widgets: [] as Array<DashboardWidget | null> };
  const care = organization
    ? await getCareDashboardWidgets().catch(() => emptyWidgets)
    : emptyWidgets;
  const engagement = organization
    ? await getEngagementDashboardWidgets().catch(() => emptyWidgets)
    : emptyWidgets;
  const lifecycle = organization
    ? await getLifecycleDashboardWidgets().catch(() => emptyWidgets)
    : emptyWidgets;
  const events = organization
    ? await getEventDashboardWidgets().catch(() => emptyWidgets)
    : emptyWidgets;

  const widgets = [
    ...care.widgets,
    ...engagement.widgets,
    ...lifecycle.widgets,
    ...events.widgets,
  ].filter((widget): widget is DashboardWidget => Boolean(widget));

  return (
    <div className="space-y-7">
      <header className="overflow-hidden rounded-2xl bg-[var(--bits-navy)] px-6 py-7 text-white shadow-lg sm:px-8">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
          Private Leadership Portal
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          Leadership Home
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
          Your ministry overview for people, care, events, attendance, and
          giving.
        </p>
      </header>

      {widgets.length > 0 ? (
        <section aria-labelledby="snapshot-heading">
          <div className="mb-3 flex items-center gap-3">
            <span aria-hidden="true" className="h-6 w-1 rounded-full bg-[var(--bits-gold)]" />
            <h2 id="snapshot-heading" className="text-lg font-semibold text-[var(--bits-navy-deep)]">
              Today&apos;s Church Snapshot
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {widgets.map((widget) => (
            <Link
              key={widget.key}
              href={widget.href}
              className="group rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--bits-gold)] hover:shadow-md"
            >
              <p className="text-sm font-medium text-[var(--bits-muted)]">
                {widget.label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-[var(--bits-navy)]">
                {widget.count}
              </p>
              <p className="mt-3 text-xs font-semibold text-[var(--bits-gold-hover)]">
                View details <span aria-hidden="true">→</span>
              </p>
            </Link>
          ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="quick-actions-heading">
        <div className="mb-3 flex items-center gap-3">
          <span aria-hidden="true" className="h-6 w-1 rounded-full bg-[var(--bits-gold)]" />
          <h2 id="quick-actions-heading" className="text-lg font-semibold text-[var(--bits-navy-deep)]">
            Quick Ministry Actions
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link
          href="/members"
          className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm transition hover:border-[var(--bits-gold)] hover:shadow-md"
        >
          <h3 className="text-base font-semibold text-[var(--bits-navy)]">
            Members
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Search and manage member profiles, households, and contacts.
          </p>
        </Link>
        <Link
          href="/donors"
          className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm transition hover:border-[var(--bits-gold)] hover:shadow-md"
        >
          <h3 className="text-base font-semibold text-[var(--bits-navy)]">
            Donors
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Manage donor records and later connect giving history.
          </p>
        </Link>
        <Link
          href="/batches"
          className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm transition hover:border-[var(--bits-gold)] hover:shadow-md"
        >
          <h3 className="text-base font-semibold text-[var(--bits-navy)]">
            Batches
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
            Enter and review offering batches before financial workflows are
            implemented.
          </p>
        </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[var(--bits-navy)]">
          Notification placeholders
        </h2>
        <p className="mt-1 text-sm text-[var(--bits-muted)]">
          In-app notification types reserved for a future delivery service.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {notificationPlaceholders.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-dashed border-[var(--bits-border)] bg-[var(--bits-page)] px-3 py-2 text-sm text-[var(--bits-muted)]"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
