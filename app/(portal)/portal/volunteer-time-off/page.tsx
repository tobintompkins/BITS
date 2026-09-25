import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MEMBER_VOLUNTEER_TIME_OFF_EMPTY_COPY,
  MEMBER_VOLUNTEER_TIME_OFF_NOTICE,
  VOLUNTEER_TIME_OFF_REASON_MAX,
} from "@/lib/validation/volunteer-time-off-request";
import { getMemberVolunteerTimeOffRequests } from "@/server/services/volunteer-time-off-request.service";

import {
  cancelVolunteerTimeOffRequestAction,
  submitVolunteerTimeOffRequestAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function MemberVolunteerTimeOffPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const portal = await getMemberVolunteerTimeOffRequests();
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  if (portal.status === "CONNECTION_PENDING") {
    return (
      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-[var(--bits-navy)]">
          Request Time Off
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your church
          membership record before volunteer time-off requests can be submitted.
        </p>
        <p className="mt-4">
          <Link
            href="/portal/help"
            className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
          >
            Help &amp; Contact
          </Link>
        </p>
      </section>
    );
  }

  const { success, error } = await searchParams;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            Request Time Off
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_VOLUNTEER_TIME_OFF_NOTICE}{" "}
            <Link
              href="/portal/help"
              className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
          </p>
        </div>
        <Link
          href="/portal"
          className={`text-sm font-medium text-[var(--bits-navy)] underline ${focusClass}`}
        >
          Member Portal Home
        </Link>
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
          New request
        </h2>
        <form
          action={submitVolunteerTimeOffRequestAction}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Start date
            <input
              type="date"
              name="startDate"
              required
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            End date
            <input type="date" name="endDate" required className={fieldClass} />
          </label>
          <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
            Reason (optional)
            <textarea
              name="memberReason"
              maxLength={VOLUNTEER_TIME_OFF_REASON_MAX}
              rows={3}
              className={fieldClass}
            />
          </label>
          <button
            type="submit"
            className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
          >
            Submit request
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Your requests
        </h2>
        {portal.rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_VOLUNTEER_TIME_OFF_EMPTY_COPY}{" "}
            <Link
              href="/portal/help"
              className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {portal.rows.map((row) => (
              <li
                key={row.requestId}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <p className="font-semibold text-[var(--bits-navy)]">
                  {row.startDateLabel} – {row.endDateLabel}
                </p>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {row.statusLabel} · Submitted {row.submittedLabel}
                </p>
                {row.memberReason ? (
                  <p className="mt-2 text-sm text-[var(--bits-navy)]">
                    {row.memberReason}
                  </p>
                ) : null}
                {row.resultMessage ? (
                  <p className="mt-2 text-sm text-[var(--bits-muted)]">
                    {row.resultMessage}
                  </p>
                ) : null}
                {row.canCancel ? (
                  <form
                    action={cancelVolunteerTimeOffRequestAction}
                    className="mt-3"
                  >
                    <input
                      type="hidden"
                      name="requestId"
                      value={row.requestId}
                    />
                    <button
                      type="submit"
                      className={`rounded-xl border border-[var(--bits-border)] px-3 py-1.5 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                    >
                      Cancel request
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
