import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RequestStatementVoidForm } from "@/components/statements/request-statement-void-form";
import { formatMoney } from "@/lib/money/decimal";
import {
  parseStatementRegistryQuery,
  statementRegistryHref,
} from "@/lib/validation/statement-registry";
import {
  StatementAuditTimelineError,
  getStatementAuditTimeline,
} from "@/server/services/statement-audit-timeline.service";

function formatUtcDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

function formatOccurredAt(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function typeLabel(type: string) {
  return type === "HOUSEHOLD" ? "Household" : "Individual";
}

function statusLabel(status: string) {
  switch (status) {
    case "GENERATED":
      return "Generated";
    case "PUBLISHED":
      return "Published";
    case "VOIDED":
      return "Voided";
    default:
      return status;
  }
}

function actionBadge(actionLabel: string) {
  if (actionLabel.startsWith("Generate")) return "Generated";
  if (actionLabel.startsWith("View")) return "Reviewed";
  if (actionLabel.startsWith("Publish")) return "Published";
  if (actionLabel.toLowerCase().includes("void")) return "Void requested";
  return "Activity";
}

function voidRequestStatusLabel(status: string) {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export default async function StatementAuditTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const registryHref = statementRegistryHref(parseStatementRegistryQuery(query));

  let timeline;
  try {
    timeline = await getStatementAuditTimeline(id);
  } catch (error) {
    if (
      error instanceof StatementAuditTimelineError &&
      error.code === "SIGNED_OUT"
    ) {
      redirect("/sign-in");
    }
    if (
      error instanceof StatementAuditTimelineError &&
      error.code === "FORBIDDEN"
    ) {
      redirect("/dashboard");
    }
    if (
      error instanceof StatementAuditTimelineError &&
      error.code === "NOT_FOUND"
    ) {
      notFound();
    }
    throw error;
  }

  const { statement, events, voidRequests, canManageStatements, hasPendingVoidRequest } =
    timeline;
  const canRequestVoid =
    canManageStatements &&
    (statement.status === "GENERATED" || statement.status === "PUBLISHED") &&
    !hasPendingVoidRequest;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={registryHref}
          className="text-sm font-medium text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          ← Back to Statement Registry
        </Link>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Giving
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Statement Audit Timeline
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          Read-only history for {statement.statementIdentifier}. This page does
          not change, publish, void, or email the statement.
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Statement summary
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Identifier
            </dt>
            <dd className="mt-1 font-semibold text-[var(--bits-navy)]">
              {statement.statementIdentifier}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Recipient
            </dt>
            <dd className="mt-1">{statement.recipientLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Type
            </dt>
            <dd className="mt-1">{typeLabel(statement.statementType)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Status
            </dt>
            <dd className="mt-1">
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold">
                {statusLabel(statement.status)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Tax year
            </dt>
            <dd className="mt-1">{statement.taxYear ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Period
            </dt>
            <dd className="mt-1">
              {formatUtcDate(statement.periodStart)}–
              {formatUtcDate(statement.periodEnd)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Deductible total
            </dt>
            <dd className="mt-1 text-lg font-semibold text-[var(--bits-navy)]">
              {formatMoney(statement.deductibleTotal)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
              Generated
            </dt>
            <dd className="mt-1">{formatUtcDate(statement.generatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Void requests
        </h2>
        {hasPendingVoidRequest ? (
          <p
            role="status"
            className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950"
          >
            A void request is pending review. The statement has not been voided.
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--bits-muted)]">
            No pending void request. This statement remains{" "}
            {statusLabel(statement.status).toLowerCase()}.
          </p>
        )}
        {voidRequests.length ? (
          <ul className="mt-4 grid gap-3">
            {voidRequests.map((request) => (
              <li
                key={request.id}
                className="rounded-xl border border-[var(--bits-border)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      request.status === "PENDING"
                        ? "bg-amber-100 text-amber-950"
                        : "bg-zinc-100 text-[var(--bits-navy)]"
                    }`}
                  >
                    {voidRequestStatusLabel(request.status)}
                  </span>
                  <span className="text-xs text-[var(--bits-muted)]">
                    Requested {formatOccurredAt(request.createdAt)} by{" "}
                    {request.requesterLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
                  {request.reason}
                </p>
                {request.reviewNote ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
                    Review note
                    {request.reviewerLabel ? ` from ${request.reviewerLabel}` : ""}
                    {request.reviewedAt
                      ? ` · ${formatOccurredAt(request.reviewedAt)}`
                      : ""}
                    : {request.reviewNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No void requests have been recorded for this statement.
          </p>
        )}
      </section>

      {canRequestVoid ? (
        <RequestStatementVoidForm
          statementId={statement.id}
          statementIdentifier={statement.statementIdentifier}
        />
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Audit history
        </h2>
        <p className="mt-1 text-sm text-[var(--bits-muted)]">
          Oldest events appear first. At most 100 matching records are shown.
        </p>
        {events.length ? (
          <ol className="relative mt-6 space-y-6 border-l-2 border-[var(--bits-gold)] pl-6">
            {events.map((event) => (
              <li key={event.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.95rem] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--bits-navy)]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--bits-navy)] px-2 py-0.5 text-xs font-semibold text-white">
                    {actionBadge(event.actionLabel)}
                  </span>
                  <h3 className="text-sm font-semibold text-[var(--bits-navy)]">
                    {event.actionLabel}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-[var(--bits-muted)]">
                  <time dateTime={event.occurredAt.toISOString()}>
                    {formatOccurredAt(event.occurredAt)}
                  </time>
                  {" · "}
                  {event.actorLabel}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
                  {event.summary}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            No audit history is available for this statement yet.
          </p>
        )}
      </section>

      <p
        role="note"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
      >
        Audit history is read-only. It records what already happened and cannot
        be used to generate, publish, void, or email contribution statements.
      </p>
    </div>
  );
}
