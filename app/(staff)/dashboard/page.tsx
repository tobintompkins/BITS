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

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

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
  const attentionWidgets = widgets.filter((widget) => widget.count > 0);
  const otherWidgets = widgets.filter((widget) => widget.count === 0);

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl bg-[var(--bits-navy)] px-5 py-5 text-white shadow-lg sm:px-6 sm:py-6">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
          Private Leadership Portal
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Leadership Home
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-white/80">
          Your ministry overview for people, care, events, attendance, and
          giving.
        </p>
      </header>

      <section aria-labelledby="attention-heading">
        <div className="mb-2 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-6 w-1 rounded-full bg-[var(--bits-gold)]"
          />
          <h2
            id="attention-heading"
            className="text-lg font-semibold text-[var(--bits-navy-deep)]"
          >
            Needs Attention
          </h2>
        </div>
        <p className="mb-3 text-sm text-[var(--bits-muted)]">
          Items with activity that may need your attention.
        </p>
        {attentionWidgets.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attentionWidgets.map((widget) => (
              <Link
                key={widget.key}
                href={widget.href}
                className={`rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm ${focusClass}`}
              >
                <p className="text-sm font-medium text-[var(--bits-muted)]">
                  {widget.label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
                  {widget.count}
                </p>
                <p className="mt-2 text-xs font-semibold text-[var(--bits-navy)]">
                  View details <span aria-hidden="true">→</span>
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-[var(--bits-border)] bg-white p-4 text-sm text-[var(--bits-muted)] shadow-sm">
            Nothing needs immediate attention right now.
          </p>
        )}
      </section>

      {otherWidgets.length > 0 ? (
        <details className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white shadow-sm">
          <summary
            className={`cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--bits-navy)] marker:content-none [&::-webkit-details-marker]:hidden ${focusClass}`}
          >
            Church Snapshot — View all ministry numbers
            <span className="ml-2 font-medium text-[var(--bits-muted)]">
              ({otherWidgets.length} additional{" "}
              {otherWidgets.length === 1 ? "item" : "items"})
            </span>
          </summary>
          <div className="border-t border-[var(--bits-border)] px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {otherWidgets.map((widget) => (
                <Link
                  key={widget.key}
                  href={widget.href}
                  className={`rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-3 ${focusClass}`}
                >
                  <p className="text-sm font-medium text-[var(--bits-muted)]">
                    {widget.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-[var(--bits-navy)]">
                    {widget.count}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-[var(--bits-navy)]">
                    View details <span aria-hidden="true">→</span>
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </details>
      ) : null}

      <section aria-labelledby="start-here-heading">
        <div className="mb-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-6 w-1 rounded-full bg-[var(--bits-gold)]"
          />
          <h2
            id="start-here-heading"
            className="text-lg font-semibold text-[var(--bits-navy-deep)]"
          >
            Start Here
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/members"
            className={`flex h-full flex-col rounded-2xl border border-[var(--bits-border)] bg-white p-4 shadow-sm ${focusClass}`}
          >
            <h3 className="text-base font-semibold text-[var(--bits-navy)]">
              Members
            </h3>
            <p className="mt-1 flex-1 text-sm leading-6 text-[var(--bits-muted)]">
              Search and manage member profiles, households, and contacts.
            </p>
            <p className="mt-3 text-xs font-semibold text-[var(--bits-navy)]">
              Open <span aria-hidden="true">→</span>
            </p>
          </Link>
          <Link
            href="/donors"
            className={`flex h-full flex-col rounded-2xl border border-[var(--bits-border)] bg-white p-4 shadow-sm ${focusClass}`}
          >
            <h3 className="text-base font-semibold text-[var(--bits-navy)]">
              Donors
            </h3>
            <p className="mt-1 flex-1 text-sm leading-6 text-[var(--bits-muted)]">
              Manage donor records and later connect giving history.
            </p>
            <p className="mt-3 text-xs font-semibold text-[var(--bits-navy)]">
              Open <span aria-hidden="true">→</span>
            </p>
          </Link>
          <Link
            href="/batches"
            className={`flex h-full flex-col rounded-2xl border border-[var(--bits-border)] bg-white p-4 shadow-sm ${focusClass}`}
          >
            <h3 className="text-base font-semibold text-[var(--bits-navy)]">
              Batches
            </h3>
            <p className="mt-1 flex-1 text-sm leading-6 text-[var(--bits-muted)]">
              Enter and review offering batches before financial workflows are
              implemented.
            </p>
            <p className="mt-3 text-xs font-semibold text-[var(--bits-navy)]">
              Open <span aria-hidden="true">→</span>
            </p>
          </Link>
        </div>
      </section>

      <details className="rounded-2xl border border-[var(--bits-border)] bg-white shadow-sm">
        <summary
          className={`cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[var(--bits-navy)] marker:content-none [&::-webkit-details-marker]:hidden ${focusClass}`}
        >
          Future notification tools
        </summary>
        <div className="border-t border-[var(--bits-border)] px-4 py-4">
          <p className="text-sm text-[var(--bits-muted)]">
            These notification types are planned for a later delivery service.
            They are not active alerts yet.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {notificationPlaceholders.map((item) => (
              <li
                key={item}
                className="rounded-lg border border-dashed border-[var(--bits-border)] bg-[var(--bits-page)] px-3 py-2 text-sm text-[var(--bits-muted)]"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
