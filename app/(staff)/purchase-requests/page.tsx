import { redirect } from "next/navigation";

import {
  PURCHASE_CATEGORY_MAX,
  PURCHASE_CANCEL_NOTE_MAX,
  PURCHASE_DECISION_NOTE_MAX,
  PURCHASE_DECISION_NOTE_MIN,
  PURCHASE_DESCRIPTION_MAX,
  PURCHASE_DESCRIPTION_MIN,
  PURCHASE_LOCATION_MAX,
  PURCHASE_REQUESTS_EMPTY_COPY,
  PURCHASE_REQUESTS_NOTICE,
  PURCHASE_REQUEST_STATUS_LABELS,
  PURCHASE_REQUEST_STATUSES,
  PURCHASE_TITLE_MAX,
  PURCHASE_TITLE_MIN,
  type PurchaseRequestRow,
} from "@/lib/validation/purchase-request";
import { getPurchaseRequests } from "@/server/services/purchase-request.service";

import {
  cancelPurchaseRequestAction,
  createPurchaseRequestAction,
  decidePurchaseRequestAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function PurchaseRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const review = await getPurchaseRequests(query);

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = review.status === "READY" ? review.rows : [];
  const canSubmit = review.status === "READY" ? review.canSubmit : false;
  const canReview = review.status === "READY" ? review.canReview : false;
  const equipmentOptions =
    review.status === "READY" ? review.equipmentOptions : [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Church Life
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Purchase Requests
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {PURCHASE_REQUESTS_NOTICE}
        </p>
      </header>

      {review.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid purchase request filter.
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

      {canSubmit ? (
        <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            New Purchase Request
          </h2>
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            Submit a ministry or facility purchase for leadership review. Saving
            this form does not place an order or move money.
          </p>
          <form
            action={createPurchaseRequestAction}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
              Title
              <input
                name="title"
                required
                minLength={PURCHASE_TITLE_MIN}
                maxLength={PURCHASE_TITLE_MAX}
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
              Description
              <textarea
                name="description"
                required
                minLength={PURCHASE_DESCRIPTION_MIN}
                maxLength={PURCHASE_DESCRIPTION_MAX}
                rows={3}
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Category
              <input
                name="category"
                maxLength={PURCHASE_CATEGORY_MAX}
                placeholder="Audio, kitchen, facilities"
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Estimated amount (USD)
              <input
                name="estimatedAmount"
                inputMode="decimal"
                placeholder="89.99"
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Location
              <input
                name="requestedForLocation"
                maxLength={PURCHASE_LOCATION_MAX}
                placeholder="Main Sanctuary, kitchen"
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Linked equipment
              <select name="equipmentItemId" defaultValue="" className={fieldClass}>
                <option value="">No linked equipment</option>
                {equipmentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
              >
                Submit request
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <form
        method="get"
        className="grid gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Status
          <select
            name="status"
            defaultValue={query.status ?? ""}
            className={fieldClass}
          >
            <option value="">All statuses</option>
            {PURCHASE_REQUEST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PURCHASE_REQUEST_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          Category
          <input
            name="category"
            defaultValue={query.category ?? ""}
            maxLength={PURCHASE_CATEGORY_MAX}
            className={fieldClass}
          />
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
          {canReview ? "Review queue" : "My requests"}
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {PURCHASE_REQUESTS_EMPTY_COPY}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-4 lg:hidden">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
                >
                  <RequestSummary row={row} showRequester={canReview} />
                  <RequestActions row={row} />
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Church purchase requests</caption>
                <thead>
                  <tr className="border-b border-[var(--bits-border)] text-[var(--bits-muted)]">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Title
                    </th>
                    {canReview ? (
                      <th scope="col" className="py-3 pr-4 font-medium">
                        Requester
                      </th>
                    ) : null}
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Category
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Estimate
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Location
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Equipment
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-3 pr-4 font-medium">
                      Submitted
                    </th>
                    <th scope="col" className="py-3 font-medium">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--bits-border)] align-top last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-3 pr-4 font-semibold text-[var(--bits-navy)]"
                      >
                        {row.title}
                      </th>
                      {canReview ? (
                        <td className="py-3 pr-4 text-[var(--bits-navy)]">
                          {row.requesterName ?? "Church staff"}
                        </td>
                      ) : null}
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.category ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.estimatedAmountLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.requestedForLocation ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.equipmentName ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.statusLabel}
                      </td>
                      <td className="py-3 pr-4 text-[var(--bits-navy)]">
                        {row.submittedOnLabel}
                      </td>
                      <td className="py-3">
                        <a
                          href={`#request-${row.id}`}
                          className={`text-sm font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
                        >
                          {row.canDecide ? "Review" : "View"}
                          <span className="sr-only"> {row.title}</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-6 hidden gap-4 lg:grid">
              {rows.map((row) => (
                <li
                  key={`detail-${row.id}`}
                  id={`request-${row.id}`}
                  className="rounded-xl border border-[var(--bits-border)] p-4"
                >
                  <h3 className="font-semibold text-[var(--bits-navy)]">
                    {row.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--bits-muted)]">
                    {row.description}
                  </p>
                  {row.decisionNote ? (
                    <p className="mt-2 text-sm text-[var(--bits-navy)]">
                      Decision note: {row.decisionNote}
                    </p>
                  ) : null}
                  <RequestActions row={row} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function RequestSummary({
  row,
  showRequester,
}: {
  row: PurchaseRequestRow;
  showRequester: boolean;
}) {
  return (
    <>
      <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
        {row.title}
      </h3>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        {row.category ?? "Uncategorized"} · {row.estimatedAmountLabel}
        {row.requestedForLocation ? ` · ${row.requestedForLocation}` : ""}
        {row.equipmentName ? ` · ${row.equipmentName}` : ""}
      </p>
      <p className="mt-2 text-sm text-[var(--bits-navy)]">{row.statusLabel}</p>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        Submitted {row.submittedOnLabel}
        {showRequester && row.requesterName ? ` · ${row.requesterName}` : ""}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--bits-navy)]">
        {row.description}
      </p>
      {row.decisionNote ? (
        <p className="mt-2 text-sm text-[var(--bits-muted)]">
          Decision note: {row.decisionNote}
        </p>
      ) : null}
    </>
  );
}

function RequestActions({ row }: { row: PurchaseRequestRow }) {
  return (
    <div className="mt-4 grid gap-4">
      {row.canDecide ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <form action={decidePurchaseRequestAction} className="grid gap-2">
            <input type="hidden" name="requestId" value={row.id} />
            <input type="hidden" name="decision" value="APPROVED" />
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Decision note
              <textarea
                name="decisionNote"
                required
                minLength={PURCHASE_DECISION_NOTE_MIN}
                maxLength={PURCHASE_DECISION_NOTE_MAX}
                rows={2}
                className={fieldClass}
              />
            </label>
            <button
              type="submit"
              className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
            >
              Approve to proceed
              <span className="sr-only"> {row.title}</span>
            </button>
          </form>
          <form action={decidePurchaseRequestAction} className="grid gap-2">
            <input type="hidden" name="requestId" value={row.id} />
            <input type="hidden" name="decision" value="DECLINED" />
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Decision note
              <textarea
                name="decisionNote"
                required
                minLength={PURCHASE_DECISION_NOTE_MIN}
                maxLength={PURCHASE_DECISION_NOTE_MAX}
                rows={2}
                className={fieldClass}
              />
            </label>
            <button
              type="submit"
              className={`w-fit rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
            >
              Decline
              <span className="sr-only"> {row.title}</span>
            </button>
          </form>
        </div>
      ) : null}
      {row.canCancel ? (
        <form action={cancelPurchaseRequestAction} className="grid gap-2">
          <input type="hidden" name="requestId" value={row.id} />
          <label className="text-sm font-medium text-[var(--bits-navy)]">
            Cancellation note (optional)
            <textarea
              name="decisionNote"
              maxLength={PURCHASE_CANCEL_NOTE_MAX}
              rows={2}
              className={fieldClass}
            />
          </label>
          <button
            type="submit"
            className={`w-fit rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] ${focusClass}`}
          >
            Cancel request
            <span className="sr-only"> {row.title}</span>
          </button>
        </form>
      ) : null}
    </div>
  );
}
