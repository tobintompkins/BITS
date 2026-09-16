import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  FinancialCorrectionError,
  getFinancialCorrectionReviewQueue,
} from "@/server/services/financial-correction.service";

const TYPE_LABELS: Record<string, string> = {
  DONOR: "Donor",
  AMOUNT: "Amount",
  FUND_ALLOCATION: "Fund allocation",
  PAYMENT_METHOD: "Payment method",
  DEPOSIT: "Deposit",
  OTHER: "Other",
};

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
      return "bg-[var(--bits-bg)] text-[var(--bits-navy)]";
  }
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function FinancialCorrectionReviewQueuePage() {
  let queue;
  try {
    queue = await getFinancialCorrectionReviewQueue();
  } catch (error) {
    if (error instanceof FinancialCorrectionError && error.code === "SIGNED_OUT") {
      redirect("/sign-in");
    }
    if (error instanceof FinancialCorrectionError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    if (error instanceof FinancialCorrectionError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/batches"
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          ← Back to Offering Batches
        </Link>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Correction Review Queue
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Review pending financial correction requests. Approve or reject each
          request on its batch correction page.
        </p>
      </header>

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
            Completed requests
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
            {queue.requests.map((request) => (
              <li key={request.id}>
                <article className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
                        {TYPE_LABELS[request.type] ?? request.type} correction
                      </h3>
                      <p className="mt-1 text-sm text-[var(--bits-muted)]">
                        {request.batch.name}
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
                        Reason
                      </dt>
                      <dd className="mt-1 text-[var(--bits-navy)]">
                        {request.reason}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                        Requested change
                      </dt>
                      <dd className="mt-1 text-[var(--bits-navy)]">
                        {request.requestedChange}
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
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
                        Requested
                      </dt>
                      <dd className="mt-1 text-[var(--bits-navy)]">
                        {formatDateTime(request.createdAt)}
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
                              Reviewer note
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
                      href={`/batches/${request.batch.id}/corrections`}
                      className="text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                    >
                      Review {request.batch.name} corrections
                    </Link>
                  </p>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 text-sm text-[var(--bits-muted)]">
            No financial correction requests are in the review queue.
          </p>
        )}
      </section>
    </div>
  );
}
