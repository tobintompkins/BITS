import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  decideStatementVoidRequestAction,
  executeApprovedStatementVoidAction,
} from "@/app/(staff)/statements/void-requests/actions";
import {
  StatementVoidReviewError,
  getStatementVoidReviewQueue,
} from "@/server/services/statement-void-review.service";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

function statusClassName(status: string) {
  switch (status) {
    case "PENDING":
      return "bg-amber-100 text-amber-900";
    case "APPROVED":
      return "bg-emerald-50 text-emerald-800";
    case "REJECTED":
      return "bg-rose-50 text-rose-800";
    default:
      return "bg-zinc-100 text-[var(--bits-navy)]";
  }
}

function typeLabel(type: string) {
  return type === "HOUSEHOLD" ? "Household" : "Individual";
}

function statementStatusLabel(status: string) {
  switch (status) {
    case "GENERATED":
      return "Generated";
    case "PUBLISHED":
      return "Published";
    case "VOIDED":
      return "VOIDED";
    default:
      return status;
  }
}

function statementStatusClassName(status: string) {
  switch (status) {
    case "VOIDED":
      return "rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-rose-900";
    case "PUBLISHED":
      return "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800";
    case "GENERATED":
      return "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900";
    default:
      return "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold";
  }
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function resultMessage(result: string) {
  if (result.startsWith("error:")) return result.slice(6);
  if (result === "approved") {
    return "The void request was approved. The statement has not been voided.";
  }
  if (result === "rejected") {
    return "The void request was rejected. The statement is unchanged.";
  }
  if (result === "executed") {
    return "The statement was voided. Portal access is revoked immediately. The statement record and PDF were retained for audit.";
  }
  return "The void request was reviewed.";
}

export default async function StatementVoidReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { result } = await searchParams;
  let queue;
  try {
    queue = await getStatementVoidReviewQueue();
  } catch (error) {
    if (
      error instanceof StatementVoidReviewError &&
      error.code === "SIGNED_OUT"
    ) {
      redirect("/sign-in");
    }
    if (
      error instanceof StatementVoidReviewError &&
      error.code === "FORBIDDEN"
    ) {
      redirect("/dashboard");
    }
    if (
      error instanceof StatementVoidReviewError &&
      error.code === "NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/statements/registry"
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          ← Back to Statement Registry
        </Link>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Statement Void Requests
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Two-person review for pending void requests. After approval, the same
          reviewer can execute a controlled void. That revokes portal access
          immediately. The statement record and PDF stay retained for audit.
        </p>
      </header>

      <p
        role="note"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
      >
        Approving a request does not void the statement. Only the reviewer who
        approved it can execute the void, and only after confirming that portal
        access will be revoked immediately.
      </p>

      {result ? (
        <p
          role="status"
          className={`rounded-xl border p-4 text-sm ${
            result.startsWith("error:")
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {resultMessage(result)}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">
            Pending review
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {queue.pendingCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--bits-muted)]">
            Reviewed requests
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
            {queue.completedCount}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Requests
        </h2>
        {queue.requests.length ? (
          <ul className="space-y-4">
            {queue.requests.map((request) => {
              const reviewAction = decideStatementVoidRequestAction.bind(
                null,
                request.id,
              );
              const executeAction = executeApprovedStatementVoidAction.bind(
                null,
                request.id,
              );
              const isPending = request.status === "PENDING";
              return (
                <li key={request.id}>
                  <article className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
                          {request.statementIdentifier}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--bits-muted)]">
                          {request.recipientLabel} · {typeLabel(request.statementType)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${statusClassName(request.status)}`}
                      >
                        {STATUS_LABELS[request.status] ?? request.status}
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                          Statement status
                        </dt>
                        <dd className="mt-1">
                          <span
                            className={statementStatusClassName(
                              request.statementStatus,
                            )}
                          >
                            {statementStatusLabel(request.statementStatus)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                          Requested
                        </dt>
                        <dd className="mt-1 text-[var(--bits-navy)]">
                          {formatDateTime(request.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                          Requested by
                        </dt>
                        <dd className="mt-1 text-[var(--bits-navy)]">
                          {request.requester.name}
                          {request.requester.email
                            ? ` · ${request.requester.email}`
                            : ""}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                          Reason
                        </dt>
                        <dd className="mt-1 text-[var(--bits-navy)]">
                          {request.reason}
                        </dd>
                      </div>
                      {request.reviewer ? (
                        <>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                              Reviewed by
                            </dt>
                            <dd className="mt-1 text-[var(--bits-navy)]">
                              {request.reviewer.name}
                              {request.reviewer.email
                                ? ` · ${request.reviewer.email}`
                                : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                              Review time
                            </dt>
                            <dd className="mt-1 text-[var(--bits-navy)]">
                              {formatDateTime(request.reviewer.reviewedAt)}
                            </dd>
                          </div>
                          {request.reviewer.reviewNote ? (
                            <div className="sm:col-span-2">
                              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                                Review note
                              </dt>
                              <dd className="mt-1 text-[var(--bits-navy)]">
                                {request.reviewer.reviewNote}
                              </dd>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </dl>
                    <p className="mt-4">
                      <Link
                        href={request.statementTimelineHref}
                        className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                      >
                        View statement timeline
                      </Link>
                    </p>
                    {isPending ? (
                      <form
                        action={reviewAction}
                        className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4"
                      >
                        <label className="text-sm font-semibold text-[var(--bits-navy)]">
                          Review note
                          <textarea
                            required
                            minLength={3}
                            maxLength={1000}
                            name="reviewNote"
                            rows={3}
                            className="mt-1 w-full rounded-lg border border-[var(--bits-border)] p-2"
                          />
                        </label>
                        {request.submittedByCurrentUser ? (
                          <p className="text-sm text-amber-800">
                            A second authorized person must review a request you
                            submitted.
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            name="decision"
                            value="APPROVED"
                            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                          >
                            Approve
                          </button>
                          <button
                            name="decision"
                            value="REJECTED"
                            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                          >
                            Reject
                          </button>
                        </div>
                      </form>
                    ) : null}
                    {request.canExecuteApprovedVoid ? (
                      <form
                        action={executeAction}
                        className="mt-4 grid gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4"
                      >
                        <p className="text-sm font-semibold text-rose-950">
                          Execute approved void
                        </p>
                        <p className="text-sm leading-6 text-rose-950">
                          This marks {request.statementIdentifier} as VOIDED and
                          removes it from the member portal immediately. The
                          statement record and PDF stay retained for audit.
                        </p>
                        <label className="flex items-start gap-2 text-sm font-medium text-rose-950">
                          <input
                            required
                            type="checkbox"
                            name="confirmed"
                            value="true"
                            className="mt-1"
                          />
                          <span>
                            I understand this revokes portal access immediately. The statement record and PDF will be retained for audit.
                          </span>
                        </label>
                        <button
                          type="submit"
                          className="w-fit rounded-lg bg-rose-800 px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                        >
                          Execute approved void
                        </button>
                      </form>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 text-sm text-[var(--bits-muted)]">
            No statement void requests are in the review queue.
          </p>
        )}
      </section>
    </div>
  );
}
