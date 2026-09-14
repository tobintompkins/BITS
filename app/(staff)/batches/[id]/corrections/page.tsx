import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CancelCorrectionForm } from "@/components/batches/cancel-correction-form";
import {
  FinancialCorrectionError,
  getFinancialCorrections,
} from "@/server/services/financial-correction.service";
import {
  cancelCorrectionAction,
  createCorrectionAction,
  decideCorrectionAction,
} from "./actions";

const labels: Record<string, string> = {
  DONOR: "Donor",
  AMOUNT: "Amount",
  FUND_ALLOCATION: "Fund allocation",
  PAYMENT_METHOD: "Payment method",
  DEPOSIT: "Deposit",
  OTHER: "Other",
};

function resultMessage(result: string) {
  if (result.startsWith("error:")) return result.slice(6);
  if (result === "cancelled") {
    return "The correction request was cancelled. Locked financial records were not changed.";
  }
  return "The correction request was saved.";
}

export default async function CorrectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { id } = await params;
  const { result } = await searchParams;
  let data;
  try {
    data = await getFinancialCorrections(id);
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
  const createAction = createCorrectionAction.bind(null, id);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/batches/${id}`}
          className="text-sm font-semibold text-[var(--bits-navy)] underline"
        >
          ← Back to batch
        </Link>
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Financial safeguard
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Correction requests
        </h1>
        <p className="mt-2 text-[var(--bits-muted)]">
          {data.batch.name} · Locked records remain unchanged until a separately
          approved adjustment workflow is completed.
        </p>
      </header>

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

      {data.canRequest ? (
        <form
          action={createAction}
          className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm"
        >
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Request a correction
          </h2>
          <div className="mt-4 grid gap-4">
            <label className="text-sm font-semibold">
              Correction type
              <select
                name="type"
                className="mt-1 w-full rounded-xl border border-[var(--bits-border)] p-3"
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              Why is this needed?
              <textarea
                required
                minLength={10}
                maxLength={1000}
                name="reason"
                rows={3}
                className="mt-1 w-full rounded-xl border border-[var(--bits-border)] p-3"
              />
            </label>
            <label className="text-sm font-semibold">
              Describe the exact requested change
              <textarea
                required
                minLength={10}
                maxLength={2000}
                name="requestedChange"
                rows={4}
                className="mt-1 w-full rounded-xl border border-[var(--bits-border)] p-3"
              />
            </label>
            <button className="w-fit rounded-xl bg-[var(--bits-navy)] px-5 py-3 font-semibold text-white">
              Submit for second-person review
            </button>
          </div>
        </form>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Request history
        </h2>
        {data.rows.length ? (
          data.rows.map((row) => {
            const reviewAction = decideCorrectionAction.bind(null, id, row.id);
            const cancelAction = cancelCorrectionAction.bind(null, id, row.id);
            const requester =
              row.requestedBy.displayName || row.requestedBy.primaryEmail;
            const canCancel =
              row.status === "PENDING" && row.requestedBy.id === data.actorId;
            return (
              <article
                key={row.id}
                className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold text-[var(--bits-navy)]">
                    {labels[row.type]}
                  </h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                    {row.status}
                  </span>
                </div>
                <p className="mt-3 text-sm">
                  <strong>Reason:</strong> {row.reason}
                </p>
                <p className="mt-2 text-sm">
                  <strong>Requested change:</strong> {row.requestedChange}
                </p>
                <p className="mt-3 text-xs text-[var(--bits-muted)]">
                  Requested by {requester} on {row.createdAt.toLocaleString()}
                </p>
                {row.reviewedBy ? (
                  <p className="mt-2 text-sm">
                    <strong>Review:</strong> {row.reviewNote} —{" "}
                    {row.reviewedBy.displayName || row.reviewedBy.primaryEmail}
                  </p>
                ) : null}
                {row.status === "PENDING" && data.canReview ? (
                  <form
                    action={reviewAction}
                    className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4"
                  >
                    <label className="text-sm font-semibold">
                      Reviewer note
                      <input
                        required
                        minLength={3}
                        maxLength={1000}
                        name="reviewNote"
                        className="mt-1 w-full rounded-lg border border-[var(--bits-border)] p-2"
                      />
                    </label>
                    {row.requestedBy.id === data.actorId ? (
                      <p className="text-sm text-amber-800">
                        A different authorized person must review your request.
                      </p>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          name="decision"
                          value="APPROVED"
                          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Approve
                        </button>
                        <button
                          name="decision"
                          value="REJECTED"
                          className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </form>
                ) : null}
                {canCancel ? <CancelCorrectionForm action={cancelAction} /> : null}
              </article>
            );
          })
        ) : (
          <p className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 text-sm text-[var(--bits-muted)]">
            No correction requests have been submitted.
          </p>
        )}
      </section>
    </div>
  );
}
