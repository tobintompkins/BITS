import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MEMBER_VOLUNTEER_SCHEDULE_EMPTY_COPY,
  MEMBER_VOLUNTEER_SCHEDULE_NOTICE,
} from "@/lib/validation/volunteer-service-schedule";
import {
  MEMBER_VOLUNTEER_SUBSTITUTE_NOTICE,
  VOLUNTEER_SUBSTITUTE_REASON_MAX,
} from "@/lib/validation/volunteer-substitute-request";
import { getMemberVolunteerSchedule } from "@/server/services/volunteer-service-schedule.service";
import { getMemberSubstituteRequests } from "@/server/services/volunteer-substitute-request.service";

import {
  cancelVolunteerSubstituteRequestAction,
  submitVolunteerSubstituteRequestAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function MemberVolunteerSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const portal = await getMemberVolunteerSchedule();
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
          My Service Schedule
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
          Your account ({portal.accountEmail}) must be connected to your church
          membership record before volunteer assignments can appear.
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

  const substitutes = await getMemberSubstituteRequests();
  const requestByAssignment = new Map(
    substitutes.status === "READY"
      ? substitutes.rows.map((row) => [row.assignmentId, row])
      : [],
  );
  const { success, error } = await searchParams;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            My Service Schedule
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_VOLUNTEER_SCHEDULE_NOTICE}{" "}
            {MEMBER_VOLUNTEER_SUBSTITUTE_NOTICE}{" "}
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

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Upcoming assignments
        </h2>
        {portal.rows.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-[var(--bits-muted)]">
            {MEMBER_VOLUNTEER_SCHEDULE_EMPTY_COPY}{" "}
            <Link
              href="/portal/help"
              className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
          </p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {portal.rows.map((row) => {
              const request = requestByAssignment.get(row.assignmentId);
              return (
                <li
                  key={row.assignmentId}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <p className="font-semibold text-[var(--bits-navy)]">
                    {row.eventTitle}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {row.startsAtLabel}
                  </p>
                  {row.location ? (
                    <p className="mt-1 text-sm text-[var(--bits-muted)]">
                      {row.location}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm text-[var(--bits-navy)]">
                    {row.ministryName
                      ? `${row.ministryName} · ${row.roleLabel}`
                      : row.roleLabel}
                  </p>
                  {request ? (
                    <div className="mt-3">
                      <p className="text-sm text-[var(--bits-muted)]">
                        Substitute request · {request.statusLabel}
                      </p>
                      {request.memberReason ? (
                        <p className="mt-1 text-sm text-[var(--bits-navy)]">
                          {request.memberReason}
                        </p>
                      ) : null}
                      {request.resultMessage ? (
                        <p className="mt-1 text-sm text-[var(--bits-muted)]">
                          {request.resultMessage}
                        </p>
                      ) : null}
                      {request.canCancel ? (
                        <form
                          action={cancelVolunteerSubstituteRequestAction}
                          className="mt-3"
                        >
                          <input
                            type="hidden"
                            name="requestId"
                            value={request.requestId}
                          />
                          <button
                            type="submit"
                            className={`rounded-xl border border-[var(--bits-border)] px-3 py-1.5 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
                          >
                            Cancel request
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : (
                    <form
                      action={submitVolunteerSubstituteRequestAction}
                      className="mt-3 grid gap-2"
                    >
                      <input
                        type="hidden"
                        name="assignmentId"
                        value={row.assignmentId}
                      />
                      <label className="text-sm font-medium text-[var(--bits-navy)]">
                        Reason (optional)
                        <textarea
                          name="memberReason"
                          maxLength={VOLUNTEER_SUBSTITUTE_REASON_MAX}
                          rows={2}
                          className={fieldClass}
                        />
                      </label>
                      <button
                        type="submit"
                        className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
                      >
                        Request a substitute
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
