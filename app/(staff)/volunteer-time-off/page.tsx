import Link from "next/link";
import { redirect } from "next/navigation";

import {
  STAFF_VOLUNTEER_TIME_OFF_EMPTY_COPY,
  STAFF_VOLUNTEER_TIME_OFF_NOTICE,
  STAFF_VOLUNTEER_TIME_OFF_REVIEW_STATUSES,
  VOLUNTEER_TIME_OFF_REASON_MAX,
  VOLUNTEER_TIME_OFF_STATUSES,
  VOLUNTEER_TIME_OFF_STATUS_LABELS,
} from "@/lib/validation/volunteer-time-off-request";
import { getStaffVolunteerTimeOffRequests } from "@/server/services/volunteer-time-off-request.service";

import { reviewVolunteerTimeOffRequestAction } from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function StaffVolunteerTimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    status?: string;
  }>;
}) {
  const query = await searchParams;
  const review = await getStaffVolunteerTimeOffRequests(query);

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = review.status === "READY" ? review.rows : [];
  const filterStatus = review.status === "READY" ? review.filterStatus : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Ministry
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Volunteer Time Off
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {STAFF_VOLUNTEER_TIME_OFF_NOTICE}{" "}
          <Link
            href="/volunteer-schedules"
            className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Volunteer Schedules
          </Link>
        </p>
      </header>

      {review.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid status filter.
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

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto]"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Status
          <select
            name="status"
            defaultValue={filterStatus ?? ""}
            className={fieldClass}
          >
            <option value="">All statuses</option>
            {VOLUNTEER_TIME_OFF_STATUSES.map((status) => (
              <option key={status} value={status}>
                {VOLUNTEER_TIME_OFF_STATUS_LABELS[status]}
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
          Time-off requests
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {STAFF_VOLUNTEER_TIME_OFF_EMPTY_COPY}
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {rows.map((row) => (
              <li
                key={row.requestId}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <p className="font-semibold text-[var(--bits-navy)]">
                  {row.memberName}
                </p>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {row.startDateLabel} – {row.endDateLabel} · {row.statusLabel} ·
                  Submitted {row.submittedLabel}
                </p>
                {row.memberReason ? (
                  <p className="mt-2 text-sm text-[var(--bits-navy)]">
                    Member reason: {row.memberReason}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--bits-muted)]">
                    No member reason provided.
                  </p>
                )}
                {row.staffResolutionNote ? (
                  <p className="mt-2 text-sm text-[var(--bits-muted)]">
                    Staff note: {row.staffResolutionNote}
                  </p>
                ) : null}
                {row.status === "OPEN" || row.status === "IN_REVIEW" ? (
                  <form
                    action={reviewVolunteerTimeOffRequestAction}
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    <input
                      type="hidden"
                      name="requestId"
                      value={row.requestId}
                    />
                    <label className="text-sm font-medium text-[var(--bits-navy)]">
                      Review status
                      <select
                        name="status"
                        defaultValue="IN_REVIEW"
                        className={fieldClass}
                      >
                        {STAFF_VOLUNTEER_TIME_OFF_REVIEW_STATUSES.map(
                          (status) => (
                            <option key={status} value={status}>
                              {VOLUNTEER_TIME_OFF_STATUS_LABELS[status]}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-[var(--bits-navy)]">
                      Staff-only note (optional)
                      <input
                        name="staffResolutionNote"
                        maxLength={VOLUNTEER_TIME_OFF_REASON_MAX}
                        className={fieldClass}
                      />
                    </label>
                    <button
                      type="submit"
                      className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
                    >
                      Save review
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
