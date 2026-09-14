import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BatchStatusProgress } from "@/components/batches/batch-status-progress";
import { BatchTransitionDialog } from "@/components/batches/batch-transition-dialog";
import { OfferingBatchDepositForm } from "@/components/batches/offering-batch-deposit-form";
import {
  batchStatusClassName,
  batchStatusLabel,
  formatBatchDate,
  formatBatchMoney,
  paymentMethodLabel,
} from "@/lib/batches/display";
import { BATCH_INTEGRITY_MESSAGES } from "@/lib/batches/integrity";
import { toDateOnlyString } from "@/lib/batches/dates";
import { parseBatchDonationListQuery } from "@/lib/validation/manual-batch-donation";
import { toOfferingBatchDepositFormValues } from "@/lib/validation/offering-batch-deposit";
import {
  ManualBatchDonationError,
  getOfferingBatchDonations,
} from "@/server/services/manual-batch-donation.service";
import {
  OfferingBatchTransitionError,
  getOfferingBatchReview,
} from "@/server/services/offering-batch-transition.service";
import {
  OfferingBatchError,
  getOfferingBatchDetail,
} from "@/server/services/offering-batch.service";

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--bits-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[var(--bits-navy)]">
        {value?.trim() ? value : "—"}
      </dd>
    </div>
  );
}

export default async function OfferingBatchDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const donationQuery = parseBatchDonationListQuery(query);
  const created =
    (Array.isArray(query.donation) ? query.donation[0] : query.donation) ===
    "created";
  const transition = Array.isArray(query.transition)
    ? query.transition[0]
    : query.transition;

  let detail;
  try {
    detail = await getOfferingBatchDetail(id);
  } catch (error) {
    if (error instanceof OfferingBatchError && error.code === "FORBIDDEN") {
      redirect("/dashboard");
    }
    if (error instanceof OfferingBatchError && error.code === "SIGNED_OUT") {
      redirect("/sign-in");
    }
    if (error instanceof OfferingBatchError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  let review;
  try {
    review = await getOfferingBatchReview(id);
  } catch (error) {
    if (error instanceof OfferingBatchTransitionError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const { batch } = detail;
  const creatorName =
    batch.createdBy.displayName?.trim() ||
    batch.createdBy.primaryEmail ||
    "Church staff";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
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
            {batch.name}
          </h1>
          <p className="mt-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${batchStatusClassName(batch.status)}`}
            >
              {batchStatusLabel(batch.status)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {detail.canAddDonations ? (
            <Link
              href={`/batches/${batch.id}/donations/new`}
              className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Add Donation
            </Link>
          ) : null}
          {review.showCompleteEntry ? (
            <BatchTransitionDialog
              batchId={batch.id}
              kind="complete"
              disabled={!review.canCompleteEntry}
            />
          ) : null}
          {review.showReconcile ? (
            <BatchTransitionDialog
              batchId={batch.id}
              kind="reconcile"
              disabled={!review.canReconcile}
            />
          ) : null}
          {review.showLock ? (
            <BatchTransitionDialog
              batchId={batch.id}
              kind="lock"
              disabled={!review.canLock}
            />
          ) : null}
          {detail.canEdit ? (
            <Link
              href={`/batches/${batch.id}/edit`}
              className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Edit Batch
            </Link>
          ) : null}
          {review.isLocked ? (
            <Link href={`/batches/${batch.id}/corrections`} className="rounded-xl border border-[var(--bits-gold)] bg-white px-4 py-2 text-sm font-semibold text-[var(--bits-navy)]">
              Correction Requests
            </Link>
          ) : null}
        </div>
      </header>

      {review.isLocked ? (
        <p
          role="status"
          className="rounded-2xl border border-slate-300 bg-slate-900 p-5 text-sm leading-6 text-white"
        >
          <span className="mr-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-900">
            Locked
          </span>
          This batch is read-only. Donations cannot be added or edited, deposit
          information cannot be changed, and totals stay as recorded. Corrections
          require a restricted correction request and approval.
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Status
        </h2>
        <div className="mt-4">
          <BatchStatusProgress status={batch.status} />
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailItem
            label="Expected total"
            value={formatBatchMoney(review.expectedTotal)}
          />
          <DetailItem
            label="Recorded total"
            value={formatBatchMoney(review.recordedTotal)}
          />
          <DetailItem
            label="Difference"
            value={formatBatchMoney(review.difference)}
          />
          <DetailItem
            label="Donations / allocations"
            value={`${review.donationCount} / ${review.allocationCount}`}
          />
        </dl>
        {review.issues.length ? (
          <ul
            role="alert"
            className="mt-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            {review.issues.map((issue) => (
              <li key={issue}>{BATCH_INTEGRITY_MESSAGES[issue]}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            Financial totals currently match the donations recorded in this batch.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          Batch details
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="Batch name" value={batch.name} />
          <DetailItem
            label="Offering date"
            value={formatBatchDate(batch.offeringDate)}
          />
          <DetailItem
            label="Service description"
            value={batch.serviceDescription}
          />
          <DetailItem
            label="Expected total"
            value={formatBatchMoney(batch.expectedTotal)}
          />
          <DetailItem
            label="Recorded total"
            value={formatBatchMoney(batch.recordedTotal)}
          />
          <DetailItem
            label="Difference"
            value={formatBatchMoney(batch.difference)}
          />
          <DetailItem label="Notes" value={batch.notes} />
          <DetailItem
            label="Created"
            value={`${formatBatchDate(batch.createdAt)} by ${creatorName}`}
          />
          <DetailItem
            label="Last updated"
            value={formatBatchDate(batch.updatedAt)}
          />
        </dl>
      </section>

      {batch.status === "RECONCILED" ||
      batch.status === "LOCKED" ||
      batch.depositDate ||
      batch.depositReference ? (
        <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
            Deposit information
          </h2>
          {review.showDepositForm ? (
            <div className="mt-4">
              <OfferingBatchDepositForm
                batchId={batch.id}
                offeringDate={toDateOnlyString(batch.offeringDate)}
                recordedTotal={batch.recordedTotal}
                initialValues={toOfferingBatchDepositFormValues(batch)}
              />
            </div>
          ) : (
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <DetailItem
                label="Deposit date"
                value={formatBatchDate(batch.depositDate)}
              />
              <DetailItem
                label="Deposit reference"
                value={batch.depositReference}
              />
              <DetailItem
                label="Deposited amount"
                value={formatBatchMoney(batch.recordedTotal)}
              />
            </dl>
          )}
        </section>
      ) : null}

      {created ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          The donation was recorded and the batch total was updated.
        </p>
      ) : null}
      {transition === "entered" ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          Entry is complete. This batch is now Entered and can no longer accept
          donations or draft edits.
        </p>
      ) : null}
      {transition === "reconciled" ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          This batch is reconciled. Expected and recorded totals match.
        </p>
      ) : null}
      {transition === "locked" ? (
        <p
          role="status"
          className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-900"
        >
          This batch is locked and read-only. Deposit information and donations
          can no longer be changed.
        </p>
      ) : null}

      <BatchDonationList
        batchId={batch.id}
        query={donationQuery.success ? donationQuery.data : { page: 1, pageSize: 20 }}
      />
    </div>
  );
}

async function BatchDonationList({
  batchId,
  query,
}: {
  batchId: string;
  query: { page: number; pageSize: number };
}) {
  let list;
  try {
    list = await getOfferingBatchDonations(batchId, query);
  } catch (error) {
    if (error instanceof ManualBatchDonationError && error.code === "NOT_FOUND") {
      notFound();
    }
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-rose-900">Donations</h2>
        <p className="mt-2 text-sm text-rose-800">
          Donations could not be loaded. Try again.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-[var(--bits-navy)]">Donations</h2>
      <p className="mt-1 text-xs text-[var(--bits-muted)]">
        {list.total} gift{list.total === 1 ? "" : "s"} in this batch. Newest
        first.
      </p>

      {list.donations.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Batch donations</caption>
            <thead className="border-b border-[var(--bits-border)] text-xs uppercase text-[var(--bits-muted)]">
              <tr>
                <th scope="col" className="px-3 py-2">Donor</th>
                <th scope="col" className="px-3 py-2">Offering date</th>
                <th scope="col" className="px-3 py-2">Payment method</th>
                <th scope="col" className="px-3 py-2">Total</th>
                <th scope="col" className="px-3 py-2">Deductible</th>
                <th scope="col" className="px-3 py-2">Funds</th>
                <th scope="col" className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {list.donations.map((donation) => (
                <tr
                  key={donation.id}
                  className="border-b border-[var(--bits-border)] last:border-0"
                >
                  <td className="px-3 py-3 font-medium text-[var(--bits-navy)]">
                    {donation.donorName}
                  </td>
                  <td className="px-3 py-3">
                    {formatBatchDate(donation.offeringDate)}
                  </td>
                  <td className="px-3 py-3">
                    {paymentMethodLabel(donation.paymentMethod)}
                  </td>
                  <td className="px-3 py-3">
                    {formatBatchMoney(donation.totalAmount)}
                  </td>
                  <td className="px-3 py-3">
                    {formatBatchMoney(donation.deductibleAmount)}
                  </td>
                  <td className="px-3 py-3">
                    {donation.allocations
                      .map(
                        (row) =>
                          `${row.fund} ${formatBatchMoney(row.amount)}`,
                      )
                      .join(", ") || "—"}
                  </td>
                  <td className="px-3 py-3">
                    {donation.source === "stripe" ? (
                      <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800">
                        {donation.isTest ? "Stripe test gift" : "Stripe gift"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-[var(--bits-navy)]/10 px-2 py-1 text-xs font-bold text-[var(--bits-navy)]">
                        Manual
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--bits-muted)]">
          No donations have been recorded in this batch yet.
        </p>
      )}

      {list.pageCount > 1 ? (
        <nav
          className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          aria-label="Donation pages"
        >
          <p className="text-[var(--bits-muted)]">
            Page {list.page} of {list.pageCount}
          </p>
          <div className="flex gap-2">
            {list.page > 1 ? (
              <Link
                href={`/batches/${batchId}?donationsPage=${list.page - 1}`}
                className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold"
              >
                Previous
              </Link>
            ) : null}
            {list.page < list.pageCount ? (
              <Link
                href={`/batches/${batchId}?donationsPage=${list.page + 1}`}
                className="rounded-md border border-[var(--bits-border)] px-3 py-1.5 font-semibold"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
