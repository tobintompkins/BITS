import { redirect } from "next/navigation";

import { getAnnouncementAccess } from "@/lib/auth/announcement-permissions";
import { getStaffAnnouncementReadTotals } from "@/server/services/member-announcement-read.service";
import { listChurchAnnouncements } from "@/server/services/church-announcement.service";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

import {
  archiveAnnouncementAction,
  createDraftAnnouncementAction,
  publishAnnouncementAction,
  updateDraftAnnouncementAction,
} from "./actions";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm";

function formatStatus(status: string) {
  if (status === "DRAFT") return "Draft";
  if (status === "PUBLISHED") return "Published";
  if (status === "ARCHIVED") return "Archived";
  return status;
}

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

export default async function ChurchAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getAnnouncementAccess(organization.id);
  if (!access.canManageAnnouncements) redirect("/dashboard");

  const [{ success, error }, announcements, totals] = await Promise.all([
    searchParams,
    listChurchAnnouncements(),
    getStaffAnnouncementReadTotals(),
  ]);
  const readCounts = new Map(
    totals.status === "READY"
      ? totals.totals.map((row) => [row.announcementId, row.readCount])
      : [],
  );

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Church Life
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Church Announcements
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Drafts are not visible to members. Only published announcements will
          appear in the member portal in a later update. Use plain text only.
        </p>
      </header>

      {success || error ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error ?? success}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Create a draft
        </h2>
        <form action={createDraftAnnouncementAction} className="mt-4 grid gap-4">
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Title
            <input
              name="title"
              required
              minLength={3}
              maxLength={140}
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Announcement text
            <textarea
              name="body"
              required
              minLength={10}
              maxLength={5000}
              rows={5}
              className={fieldClass}
            />
          </label>
          <button
            type="submit"
            className="w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Save draft
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Announcements
        </h2>
        {announcements.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No church announcements have been created yet.
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {announcements.map((announcement) => (
              <li
                key={announcement.id}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--bits-navy)]">
                      {announcement.title}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-[var(--bits-muted)]">
                      {formatStatus(announcement.status)} · Published{" "}
                      {formatDate(announcement.publishedAt)} · Created{" "}
                      {formatDate(announcement.createdAt)}
                      {announcement.status === "PUBLISHED"
                        ? ` · Read by ${readCounts.get(announcement.id) ?? 0} member accounts`
                        : ""}
                    </p>
                  </div>
                </div>

                {announcement.status === "DRAFT" ? (
                  <form
                    action={updateDraftAnnouncementAction}
                    className="mt-4 grid gap-3"
                  >
                    <input type="hidden" name="id" value={announcement.id} />
                    <label className="text-sm font-medium text-[var(--bits-navy)]">
                      Title
                      <input
                        name="title"
                        required
                        minLength={3}
                        maxLength={140}
                        defaultValue={announcement.title}
                        className={fieldClass}
                      />
                    </label>
                    <label className="text-sm font-medium text-[var(--bits-navy)]">
                      Announcement text
                      <textarea
                        name="body"
                        required
                        minLength={10}
                        maxLength={5000}
                        rows={4}
                        defaultValue={announcement.body}
                        className={fieldClass}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white"
                      >
                        Save draft
                      </button>
                      <button
                        type="submit"
                        formAction={publishAnnouncementAction}
                        className="rounded-xl bg-[var(--bits-gold)] px-4 py-2 text-sm font-bold text-[var(--bits-navy-deep)]"
                      >
                        Publish
                      </button>
                      <button
                        type="submit"
                        formAction={archiveAnnouncementAction}
                        className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)]"
                      >
                        Archive
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--bits-navy)]">
                      {announcement.body}
                    </p>
                    {announcement.status === "PUBLISHED" ? (
                      <form
                        action={archiveAnnouncementAction}
                        className="mt-4"
                      >
                        <input type="hidden" name="id" value={announcement.id} />
                        <button
                          type="submit"
                          className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)]"
                        >
                          Archive
                        </button>
                      </form>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
