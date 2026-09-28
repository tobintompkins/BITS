import Link from "next/link";
import { redirect } from "next/navigation";

import {
  STAFF_VOLUNTEER_TRAINING_EMPTY_COPY,
  STAFF_VOLUNTEER_TRAINING_NOTICE,
  VOLUNTEER_TRAINING_FILTER_LABELS,
  VOLUNTEER_TRAINING_STATUS_FILTERS,
  VOLUNTEER_TRAINING_TITLE_MAX,
  VOLUNTEER_TRAINING_TITLE_MIN,
} from "@/lib/validation/volunteer-training";
import { getStaffVolunteerTraining } from "@/server/services/volunteer-training.service";

import {
  archiveVolunteerTrainingRecordAction,
  createVolunteerTrainingRecordAction,
  restoreVolunteerTrainingRecordAction,
  updateVolunteerTrainingRecordAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function StaffVolunteerTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    status?: string;
  }>;
}) {
  const query = await searchParams;
  const review = await getStaffVolunteerTraining(query);

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = review.status === "READY" ? review.rows : [];
  const members = review.status === "READY" ? review.members : [];
  const ministries = review.status === "READY" ? review.ministries : [];
  const filterStatus = review.status === "READY" ? review.filterStatus : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Ministry
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Volunteer Training
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {STAFF_VOLUNTEER_TRAINING_NOTICE}{" "}
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
          Choose a valid training status filter.
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
          Record training
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
          Use this for ordinary ministry training such as nursery orientation or
          sound-booth training. Do not record background checks here.
        </p>
        <form
          action={createVolunteerTrainingRecordAction}
          className="mt-4 grid gap-4 lg:grid-cols-2"
        >
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Volunteer
            <select name="memberId" required className={fieldClass}>
              <option value="">Select a member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Ministry (optional)
            <select name="ministryId" className={fieldClass}>
              <option value="">No ministry</option>
              {ministries.map((ministry) => (
                <option key={ministry.id} value={ministry.id}>
                  {ministry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] lg:col-span-2">
            Training title
            <input
              name="title"
              required
              minLength={VOLUNTEER_TRAINING_TITLE_MIN}
              maxLength={VOLUNTEER_TRAINING_TITLE_MAX}
              placeholder="Nursery orientation"
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Completed date
            <input
              type="date"
              name="completedOn"
              required
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Expiration date (optional)
            <input type="date" name="expiresOn" className={fieldClass} />
          </label>
          <div className="lg:col-span-2">
            <button
              type="submit"
              className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
            >
              Save training
            </button>
          </div>
        </form>
      </section>

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto]"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Status
          <select
            name="status"
            defaultValue={filterStatus ?? ""}
            className={fieldClass}
          >
            <option value="">All current records</option>
            {VOLUNTEER_TRAINING_STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {VOLUNTEER_TRAINING_FILTER_LABELS[status]}
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
          Training records
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {STAFF_VOLUNTEER_TRAINING_EMPTY_COPY}
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {rows.map((row) => (
              <li
                key={row.recordId}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <p className="font-semibold text-[var(--bits-navy)]">
                  {row.memberName}
                </p>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {row.ministryName ?? "No ministry"} · {row.statusLabel}
                  {row.archived ? " · Archived" : ""}
                </p>
                {row.archived ? (
                  <form
                    action={restoreVolunteerTrainingRecordAction}
                    className="mt-4"
                  >
                    <input type="hidden" name="recordId" value={row.recordId} />
                    <p className="text-sm text-[var(--bits-navy)]">{row.title}</p>
                    <p className="mt-1 text-sm text-[var(--bits-muted)]">
                      Completed {row.completedOnLabel}
                      {row.expiresOnLabel
                        ? ` · Expires ${row.expiresOnLabel}`
                        : ""}
                    </p>
                    <button
                      type="submit"
                      className={`mt-3 w-fit rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                    >
                      Restore training
                      <span className="sr-only"> for {row.memberName}</span>
                    </button>
                  </form>
                ) : (
                  <div className="mt-4 grid gap-4">
                    <form
                      action={updateVolunteerTrainingRecordAction}
                      className="grid gap-4 lg:grid-cols-2"
                    >
                      <input
                        type="hidden"
                        name="recordId"
                        value={row.recordId}
                      />
                      <label className="text-sm font-medium text-[var(--bits-navy)] lg:col-span-2">
                        Training title
                        <input
                          name="title"
                          required
                          minLength={VOLUNTEER_TRAINING_TITLE_MIN}
                          maxLength={VOLUNTEER_TRAINING_TITLE_MAX}
                          defaultValue={row.title}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-sm font-medium text-[var(--bits-navy)]">
                        Completed date
                        <input
                          type="date"
                          name="completedOn"
                          required
                          defaultValue={row.completedOnValue}
                          className={fieldClass}
                        />
                      </label>
                      <label className="text-sm font-medium text-[var(--bits-navy)]">
                        Expiration date (optional)
                        <input
                          type="date"
                          name="expiresOn"
                          defaultValue={row.expiresOnValue}
                          className={fieldClass}
                        />
                      </label>
                      <div className="lg:col-span-2">
                        <button
                          type="submit"
                          className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
                        >
                          Update training
                          <span className="sr-only"> for {row.memberName}</span>
                        </button>
                      </div>
                    </form>
                    <form action={archiveVolunteerTrainingRecordAction}>
                      <input
                        type="hidden"
                        name="recordId"
                        value={row.recordId}
                      />
                      <button
                        type="submit"
                        className={`w-fit rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                      >
                        Archive training
                        <span className="sr-only"> for {row.memberName}</span>
                      </button>
                    </form>
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
