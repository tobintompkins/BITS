import Link from "next/link";
import { redirect } from "next/navigation";

import { submitMemberPrivacyDataRequestAction } from "@/app/(portal)/portal/privacy/actions";
import {
  memberPrivacyRequestStatusLabels,
  memberPrivacyRequestTypeLabels,
  memberPrivacyRequestTypeValues,
} from "@/lib/validation/member-privacy-data-request";
import { getMemberPrivacyDataRequests } from "@/server/services/member-privacy-data-request.service";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

const noticeMessages: Record<string, { tone: "success" | "error"; message: string }> =
  {
    submitted: {
      tone: "success",
      message: "Your privacy request was sent to the church office.",
    },
    duplicate: {
      tone: "error",
      message:
        "You already have an open request of this type. Contact the church office if you need more help.",
    },
    invalid: {
      tone: "error",
      message: "Please choose a valid request type and use a short plain-text note.",
    },
    "no-organization": {
      tone: "error",
      message: "The church organization has not been configured.",
    },
  };

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

export default async function MemberPrivacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const portal = await getMemberPrivacyDataRequests();
  if (portal.status === "SIGNED_OUT") redirect("/sign-in");

  if (portal.status === "NO_ORGANIZATION") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm">
        The church organization has not been configured.
      </p>
    );
  }

  const noticeKey = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const notice = noticeKey ? noticeMessages[noticeKey] : null;

  return (
    <div className="space-y-6">
      {notice ? (
        <p
          role="status"
          className={
            notice.tone === "success"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950"
          }
        >
          {notice.message}{" "}
          {noticeKey === "duplicate" ? (
            <Link
              href="/portal/help"
              className={`font-semibold underline ${focusClass}`}
            >
              Help &amp; Contact
            </Link>
          ) : null}
        </p>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Private Member Access
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
            Privacy &amp; Data
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
            This page concerns only your signed-in BITS account. Submitting a
            request asks church staff to review it. It does not automatically
            change, copy, email, or erase any records.
          </p>
        </div>
        <Link
          href="/portal"
          className={`text-sm font-medium text-[var(--bits-navy)] underline ${focusClass}`}
        >
          Member Portal Home
        </Link>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Submit a request
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
          Choose one request type. Church staff will review it. You cannot
          submit another open request of the same type until the current one is
          finished.
        </p>
        <form
          action={submitMemberPrivacyDataRequestAction}
          className="mt-4 grid gap-4"
        >
          <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
            Request type
            <select
              name="requestType"
              required
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2"
            >
              {memberPrivacyRequestTypeValues.map((value) => (
                <option key={value} value={value}>
                  {memberPrivacyRequestTypeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-[var(--bits-navy)]">
            Note (optional)
            <textarea
              name="memberNote"
              maxLength={500}
              rows={4}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm font-normal"
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

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Your requests
        </h2>
        {portal.requests.length ? (
          <ul className="mt-4 divide-y divide-[var(--bits-border)]">
            {portal.requests.map((row, index) => (
              <li key={`${row.requestType}:${row.createdAt.toISOString()}:${index}`} className="py-3">
                <p className="font-semibold text-[var(--bits-navy)]">
                  {memberPrivacyRequestTypeLabels[row.requestType]}
                </p>
                <p className="mt-1 text-sm text-[var(--bits-muted)]">
                  {memberPrivacyRequestStatusLabels[row.status] ?? row.status}
                  {" · "}
                  {formatDate(row.createdAt)}
                </p>
                {row.staffResolutionNote ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
                    Staff note: {row.staffResolutionNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[var(--bits-muted)]">
            You have not submitted a privacy request yet.
          </p>
        )}
      </section>
    </div>
  );
}
