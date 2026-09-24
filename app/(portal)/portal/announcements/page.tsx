import Link from "next/link";
import { redirect } from "next/navigation";

import { markMemberAnnouncementReadAction } from "@/app/(portal)/portal/announcements/actions";
import { memberAnnouncementsHref } from "@/lib/validation/member-announcements";
import { getMemberAnnouncements } from "@/server/services/member-announcements.service";

function formatPublishedDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

export default async function MemberAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const portal = await getMemberAnnouncements(query);
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
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
            Church Announcements
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            These announcements are posted by church leadership for signed-in
            members.
          </p>
        </div>
        <Link
          href="/portal"
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Member Portal Home
        </Link>
      </header>

      <section className="space-y-4">
        {portal.announcements.length ? (
          <ul className="grid gap-4">
            {portal.announcements.map((announcement) => (
              <li
                key={announcement.id}
                className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
                    {announcement.title}
                  </h2>
                  {announcement.isRead && announcement.readAt ? (
                    <p className="rounded-full bg-[var(--bits-page)] px-2.5 py-1 text-xs font-semibold text-[var(--bits-navy)]">
                      Read {formatPublishedDate(announcement.readAt)}
                    </p>
                  ) : (
                    <p className="rounded-full bg-[var(--bits-gold)] px-2.5 py-1 text-xs font-bold text-[var(--bits-navy-deep)]">
                      New
                    </p>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {formatPublishedDate(announcement.publishedAt)}
                </p>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--bits-navy)]">
                  {announcement.body}
                </p>
                {!announcement.isRead ? (
                  <form
                    action={markMemberAnnouncementReadAction}
                    className="mt-4"
                  >
                    <input
                      type="hidden"
                      name="announcementId"
                      value={announcement.id}
                    />
                    <input
                      type="hidden"
                      name="page"
                      value={String(portal.page)}
                    />
                    <button
                      type="submit"
                      className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                    >
                      Mark as read
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 text-sm leading-6 text-[var(--bits-muted)] shadow-sm">
            There are no church announcements right now.
          </p>
        )}

        {portal.pageCount > 1 ? (
          <nav
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
            aria-label="Church announcement pages"
          >
            <p className="text-[var(--bits-muted)]">
              Page {portal.page} of {portal.pageCount}
            </p>
            <div className="flex gap-2">
              {portal.page > 1 ? (
                <Link
                  href={memberAnnouncementsHref(portal.page - 1)}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Previous
                </Link>
              ) : null}
              {portal.page < portal.pageCount ? (
                <Link
                  href={memberAnnouncementsHref(portal.page + 1)}
                  className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>

      <p
        role="note"
        className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 text-sm leading-6 text-[var(--bits-muted)]"
      >
        Announcements are posted by church leadership. This page does not accept
        replies or announcement changes.
      </p>
    </div>
  );
}
