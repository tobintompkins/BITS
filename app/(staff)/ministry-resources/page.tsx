import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MINISTRY_RESOURCE_DESCRIPTION_MAX,
  MINISTRY_RESOURCE_TITLE_MAX,
  MINISTRY_RESOURCE_TITLE_MIN,
  STAFF_MINISTRY_RESOURCE_EMPTY_COPY,
  STAFF_MINISTRY_RESOURCE_FILTER_LABELS,
  STAFF_MINISTRY_RESOURCE_FILTERS,
  STAFF_MINISTRY_RESOURCE_NOTICE,
} from "@/lib/validation/ministry-resource";
import { getStaffMinistryResources } from "@/server/services/ministry-resource.service";

import {
  archiveMinistryResourceAction,
  createMinistryResourceAction,
  publishMinistryResourceAction,
  restoreMinistryResourceAction,
  unpublishMinistryResourceAction,
  updateMinistryResourceAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function StaffMinistryResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    status?: string;
    ministryId?: string;
  }>;
}) {
  const query = await searchParams;
  const review = await getStaffMinistryResources(query);

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = review.status === "READY" ? review.rows : [];
  const ministries = review.status === "READY" ? review.ministries : [];
  const filterStatus = review.status === "READY" ? review.filterStatus : null;
  const selectedMinistryId =
    review.status === "READY" ? review.selectedMinistryId : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Ministry
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Ministry Resources
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {STAFF_MINISTRY_RESOURCE_NOTICE}{" "}
          <Link
            href="/ministries"
            className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Ministries
          </Link>
        </p>
      </header>

      {review.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid ministry and status filter.
        </p>
      ) : null}

      {query.success || query.error ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            query.error
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : "border-emerald-300 bg-emerald-50 text-emerald-800"
          }`}
        >
          {query.error ?? query.success}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Add a resource
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
          New links are saved as drafts until you publish them.
        </p>
        <form
          action={createMinistryResourceAction}
          className="mt-4 grid gap-4 lg:grid-cols-2"
        >
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Ministry
            <select
              name="ministryId"
              required
              defaultValue={selectedMinistryId ?? ""}
              className={fieldClass}
            >
              <option value="">Select a ministry</option>
              {ministries.map((ministry) => (
                <option key={ministry.id} value={ministry.id}>
                  {ministry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            HTTPS link
            <input
              name="url"
              type="url"
              required
              placeholder="https://example.com/guide"
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] lg:col-span-2">
            Title
            <input
              name="title"
              required
              minLength={MINISTRY_RESOURCE_TITLE_MIN}
              maxLength={MINISTRY_RESOURCE_TITLE_MAX}
              placeholder="Sound-booth guide"
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] lg:col-span-2">
            Short description (optional)
            <input
              name="description"
              maxLength={MINISTRY_RESOURCE_DESCRIPTION_MAX}
              className={fieldClass}
            />
          </label>
          <div className="lg:col-span-2">
            <button
              type="submit"
              className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
            >
              Save draft
            </button>
          </div>
        </form>
      </section>

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-3"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Ministry
          <select
            name="ministryId"
            defaultValue={selectedMinistryId ?? ""}
            className={fieldClass}
          >
            <option value="">All ministries</option>
            {ministries.map((ministry) => (
              <option key={ministry.id} value={ministry.id}>
                {ministry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Status
          <select
            name="status"
            defaultValue={filterStatus ?? ""}
            className={fieldClass}
          >
            <option value="">All current records</option>
            {STAFF_MINISTRY_RESOURCE_FILTERS.map((status) => (
              <option key={status} value={status}>
                {STAFF_MINISTRY_RESOURCE_FILTER_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Apply filter
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Resources
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {STAFF_MINISTRY_RESOURCE_EMPTY_COPY}
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {rows.map((row) => (
              <li
                key={row.resourceId}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <p className="font-semibold text-[var(--bits-navy)]">
                  {row.title}
                </p>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {row.ministryName} · {row.hostname} · {row.statusLabel}
                  {row.archived ? " · Archived" : ""} · Updated{" "}
                  {row.updatedOnLabel}
                </p>
                {row.archived ? (
                  <form
                    action={restoreMinistryResourceAction}
                    className="mt-4"
                  >
                    <input
                      type="hidden"
                      name="resourceId"
                      value={row.resourceId}
                    />
                    <button
                      type="submit"
                      className={`w-fit rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                    >
                      Restore resource
                      <span className="sr-only"> {row.title}</span>
                    </button>
                  </form>
                ) : (
                  <div className="mt-4 grid gap-4">
                    <form
                      action={updateMinistryResourceAction}
                      className="grid gap-4 lg:grid-cols-2"
                    >
                      <input
                        type="hidden"
                        name="resourceId"
                        value={row.resourceId}
                      />
                      <label className="text-sm font-medium text-[var(--bits-navy)]">
                        Ministry
                        <select
                          name="ministryId"
                          required
                          defaultValue={row.ministryId}
                          className={fieldClass}
                        >
                          {ministries.map((ministry) => (
                            <option key={ministry.id} value={ministry.id}>
                              {ministry.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-medium text-[var(--bits-navy)]">
                        HTTPS link
                        <input
                          name="url"
                          type="url"
                          required
                          defaultValue={row.url}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-sm font-medium text-[var(--bits-navy)] lg:col-span-2">
                        Title
                        <input
                          name="title"
                          required
                          minLength={MINISTRY_RESOURCE_TITLE_MIN}
                          maxLength={MINISTRY_RESOURCE_TITLE_MAX}
                          defaultValue={row.title}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-sm font-medium text-[var(--bits-navy)] lg:col-span-2">
                        Short description (optional)
                        <input
                          name="description"
                          maxLength={MINISTRY_RESOURCE_DESCRIPTION_MAX}
                          defaultValue={row.description}
                          className={fieldClass}
                        />
                      </label>
                      <div className="lg:col-span-2">
                        <button
                          type="submit"
                          className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
                        >
                          Update resource
                          <span className="sr-only"> {row.title}</span>
                        </button>
                      </div>
                    </form>
                    <div className="flex flex-wrap gap-3">
                      {row.status === "DRAFT" ? (
                        <form action={publishMinistryResourceAction}>
                          <input
                            type="hidden"
                            name="resourceId"
                            value={row.resourceId}
                          />
                          <button
                            type="submit"
                            className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
                          >
                            Publish
                            <span className="sr-only"> {row.title}</span>
                          </button>
                        </form>
                      ) : (
                        <form action={unpublishMinistryResourceAction}>
                          <input
                            type="hidden"
                            name="resourceId"
                            value={row.resourceId}
                          />
                          <button
                            type="submit"
                            className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                          >
                            Unpublish
                            <span className="sr-only"> {row.title}</span>
                          </button>
                        </form>
                      )}
                      <form action={archiveMinistryResourceAction}>
                        <input
                          type="hidden"
                          name="resourceId"
                          value={row.resourceId}
                        />
                        <button
                          type="submit"
                          className={`rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                        >
                          Archive
                          <span className="sr-only"> {row.title}</span>
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
