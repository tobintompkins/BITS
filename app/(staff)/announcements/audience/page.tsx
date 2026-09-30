import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ANNOUNCEMENT_AUDIENCE_INVALID_MINISTRY,
  ANNOUNCEMENT_AUDIENCE_NOTICE,
  ANNOUNCEMENT_AUDIENCE_PUBLISHED_EMPTY,
  ANNOUNCEMENT_AUDIENCE_SUBTITLE,
  CHURCH_ANNOUNCEMENTS_HREF,
  type AnnouncementAudienceCounts,
  type AnnouncementAudienceMinistryOption,
  type AnnouncementAudiencePublishedItem,
} from "@/lib/validation/announcement-audience-preview";
import { getAnnouncementAudiencePreview } from "@/server/services/announcement-audience-preview.service";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";
const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function AudienceScopeForm({
  ministries,
  selectedMinistryId,
}: {
  ministries: AnnouncementAudienceMinistryOption[];
  selectedMinistryId: string;
}) {
  return (
    <form
      method="get"
      className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto]"
    >
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Audience scope
        <select
          name="ministryId"
          defaultValue={selectedMinistryId}
          className={fieldClass}
        >
          <option value="">All active members</option>
          {ministries.map((ministry) => (
            <option key={ministry.id} value={ministry.id}>
              {ministry.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
        >
          Show preview
        </button>
      </div>
    </form>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
      <p className="text-sm text-[var(--bits-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--bits-navy)]">
        {value}
      </p>
    </li>
  );
}

function ExclusionList({
  title,
  eligibleLabel,
  eligible,
  optedOut,
  missingLabel,
  missing,
}: {
  title: string;
  eligibleLabel: string;
  eligible: number;
  optedOut: number;
  missingLabel: string;
  missing: number;
}) {
  return (
    <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--bits-navy)]">{title}</h2>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--bits-navy)]">
        <li>
          {eligible} {eligibleLabel}
        </li>
        <li>
          {optedOut} opted out and would not be included
        </li>
        <li>
          {missing} {missingLabel}
        </li>
      </ul>
    </section>
  );
}

function PublishedList({
  items,
}: {
  items: AnnouncementAudiencePublishedItem[];
}) {
  if (items.length === 0) {
    return (
      <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
        {ANNOUNCEMENT_AUDIENCE_PUBLISHED_EMPTY}
      </p>
    );
  }

  return (
    <ul className="mt-4 grid gap-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
        >
          <p className="font-semibold text-[var(--bits-navy)]">
            <Link href={item.href} className={`hover:underline ${focusClass}`}>
              {item.title}
            </Link>
          </p>
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            Published {item.publishedAtLabel}
          </p>
        </li>
      ))}
    </ul>
  );
}

const emptyCounts: AnnouncementAudienceCounts = {
  activeMembers: 0,
  emailEligible: 0,
  emailExcludedOptOut: 0,
  emailExcludedMissingAddress: 0,
  textEligible: 0,
  textExcludedOptOut: 0,
  textExcludedMissingPhone: 0,
};

export default async function AnnouncementAudiencePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ministryId?: string }>;
}) {
  const query = await searchParams;
  const preview = await getAnnouncementAudiencePreview(query);

  if (preview.status === "SIGNED_OUT") redirect("/sign-in");
  if (preview.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (preview.status === "UNAUTHORIZED") redirect("/dashboard");

  const counts = preview.status === "READY" ? preview.counts : emptyCounts;
  const published =
    preview.status === "READY" ? preview.publishedAnnouncements : [];
  const ministries =
    preview.status === "READY" || preview.status === "INVALID_FILTER"
      ? preview.ministries
      : [];
  const selectedMinistryId =
    preview.status === "READY" ? (preview.selectedMinistry?.id ?? "") : "";
  const scopeLabel = preview.status === "READY" ? preview.scopeLabel : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Church Life
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Announcement Audience Preview
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {ANNOUNCEMENT_AUDIENCE_SUBTITLE}
        </p>
        <p className="mt-3">
          <Link
            href={CHURCH_ANNOUNCEMENTS_HREF}
            className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Back to Church Announcements
          </Link>
        </p>
      </header>

      <aside
        role="note"
        className="rounded-2xl border border-[var(--bits-gold)] bg-white p-4 shadow-sm"
      >
        <p className="text-sm leading-6 text-[var(--bits-navy)]">
          {ANNOUNCEMENT_AUDIENCE_NOTICE}
        </p>
      </aside>

      {preview.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {ANNOUNCEMENT_AUDIENCE_INVALID_MINISTRY}
        </p>
      ) : null}

      <AudienceScopeForm
        ministries={ministries}
        selectedMinistryId={selectedMinistryId}
      />

      {preview.status === "READY" ? (
        <>
          {scopeLabel ? (
            <p className="text-sm font-medium text-[var(--bits-navy)]">
              {scopeLabel}
            </p>
          ) : null}

          <ul className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Active Members" value={counts.activeMembers} />
            <SummaryCard label="Email Eligible" value={counts.emailEligible} />
            <SummaryCard label="Text Eligible" value={counts.textEligible} />
          </ul>

          <div className="grid gap-4 lg:grid-cols-2">
            <ExclusionList
              title="Email audience"
              eligibleLabel="active members have an email address and allow email"
              eligible={counts.emailEligible}
              optedOut={counts.emailExcludedOptOut}
              missingLabel="are missing an email address"
              missing={counts.emailExcludedMissingAddress}
            />
            <ExclusionList
              title="Text audience"
              eligibleLabel="active members have a phone number and allow text messages"
              eligible={counts.textEligible}
              optedOut={counts.textExcludedOptOut}
              missingLabel="are missing a phone number"
              missing={counts.textExcludedMissingPhone}
            />
          </div>

          <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
              Published announcements
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
              These titles provide context only. Audience counts are for the
              whole church, not a selected announcement.
            </p>
            <PublishedList items={published} />
          </section>
        </>
      ) : null}
    </div>
  );
}
