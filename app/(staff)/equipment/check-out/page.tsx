import { redirect } from "next/navigation";

import {
  EQUIPMENT_CHECKOUT_EMPTY_COPY,
  EQUIPMENT_CHECKOUT_NAME_MAX,
  EQUIPMENT_CHECKOUT_NAME_MIN,
  EQUIPMENT_CHECKOUT_NOTICE,
  EQUIPMENT_CHECKOUT_PURPOSE_MAX,
  EQUIPMENT_CHECKOUT_PURPOSE_MIN,
  EQUIPMENT_CHECKOUT_QUANTITY_MAX,
  EQUIPMENT_CHECKOUT_QUANTITY_MIN,
  EQUIPMENT_CHECKOUT_RETURN_NOTE_MAX,
  type EquipmentCheckoutRow,
} from "@/lib/validation/equipment-checkout";
import { getEquipmentCheckouts } from "@/server/services/equipment-checkout.service";

import {
  createEquipmentCheckoutAction,
  returnEquipmentCheckoutAction,
} from "./actions";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";
const fieldClass =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)]";

export default async function EquipmentCheckOutPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const query = await searchParams;
  const review = await getEquipmentCheckouts(query);

  if (review.status === "SIGNED_OUT") redirect("/sign-in");
  if (review.status === "NO_ORGANIZATION") redirect("/settings/organization");
  if (review.status === "UNAUTHORIZED") redirect("/dashboard");

  const rows = review.status === "READY" ? review.rows : [];
  const counts =
    review.status === "READY"
      ? review.counts
      : {
          currentlyCheckedOut: 0,
          dueBackSoon: 0,
          overdue: 0,
          returnedThisMonth: 0,
        };
  const canManage = review.status === "READY" ? review.canManage : false;
  const equipmentOptions =
    review.status === "READY" ? review.equipmentOptions : [];
  const showingReturned = query.view === "returned";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
          Church Life
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          Equipment Check-Out & Return
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          {EQUIPMENT_CHECKOUT_NOTICE}
        </p>
      </header>

      {review.status === "INVALID_FILTER" ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          Choose a valid check-out view.
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

      <section
        aria-label="Equipment check-out counts"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          { label: "Currently Checked Out", value: counts.currentlyCheckedOut },
          { label: "Due Back Soon", value: counts.dueBackSoon },
          { label: "Overdue", value: counts.overdue },
          { label: "Returned This Month", value: counts.returnedThisMonth },
        ].map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-4 shadow-sm"
          >
            <h2 className="text-xs font-medium text-[var(--bits-muted)]">
              {card.label}
            </h2>
            <p className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">
              {card.value}
            </p>
          </article>
        ))}
      </section>

      {canManage ? (
        <section className="rounded-2xl border border-[var(--bits-border)] border-t-4 border-t-[var(--bits-gold)] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
            Check Out Equipment
          </h2>
          <p className="mt-1 text-sm text-[var(--bits-muted)]">
            This records temporary church use. It does not charge a fee or
            change the saved inventory quantity.
          </p>
          <form
            action={createEquipmentCheckoutAction}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
              Equipment
              <select name="equipmentItemId" required className={fieldClass}>
                <option value="">Select equipment</option>
                {equipmentOptions.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={item.available < 1}
                  >
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Quantity
              <input
                name="quantity"
                type="number"
                required
                min={EQUIPMENT_CHECKOUT_QUANTITY_MIN}
                max={EQUIPMENT_CHECKOUT_QUANTITY_MAX}
                defaultValue={1}
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)]">
              Due back
              <input name="dueBackAt" type="date" className={fieldClass} />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
              Checked out to
              <input
                name="checkedOutToName"
                required
                minLength={EQUIPMENT_CHECKOUT_NAME_MIN}
                maxLength={EQUIPMENT_CHECKOUT_NAME_MAX}
                placeholder="Worship team, youth ministry"
                className={fieldClass}
              />
            </label>
            <label className="text-sm font-medium text-[var(--bits-navy)] sm:col-span-2">
              Purpose
              <textarea
                name="purpose"
                required
                minLength={EQUIPMENT_CHECKOUT_PURPOSE_MIN}
                maxLength={EQUIPMENT_CHECKOUT_PURPOSE_MAX}
                rows={3}
                placeholder="Sunday service, event, repair, approved church use"
                className={fieldClass}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
              >
                Check out
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <form
        method="get"
        className="flex flex-wrap items-end gap-4 rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm"
      >
        <label className="text-sm font-medium text-[var(--bits-navy)]">
          View
          <select
            name="view"
            defaultValue={query.view ?? "current"}
            className={fieldClass}
          >
            <option value="current">Currently checked out</option>
            <option value="returned">Returned history</option>
          </select>
        </label>
        <button
          type="submit"
          className={`rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
        >
          Apply view
        </button>
      </form>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-[var(--bits-navy)]">
          {showingReturned ? "Returned history" : "Current check-outs"}
        </h2>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--bits-muted)]">
            {EQUIPMENT_CHECKOUT_EMPTY_COPY}
          </p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
              >
                <CheckoutSummary row={row} />
                {canManage && !showingReturned ? (
                  <ReturnForm row={row} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CheckoutSummary({ row }: { row: EquipmentCheckoutRow }) {
  return (
    <>
      <h3 className="text-lg font-semibold text-[var(--bits-navy)]">
        {row.equipmentName}
      </h3>
      <p className="mt-1 text-sm text-[var(--bits-muted)]">
        Qty {row.quantity} · {row.checkedOutToName}
      </p>
      <p className="mt-2 text-sm text-[var(--bits-navy)]">{row.purpose}</p>
      <p className="mt-2 text-sm text-[var(--bits-muted)]">
        Checked out {row.checkedOutOnLabel}
        {row.dueBackLabel ? ` · Due ${row.dueBackLabel}` : ""}
        {row.returnedOnLabel ? ` · Returned ${row.returnedOnLabel}` : ""}
      </p>
      {row.overdue ? (
        <p className="mt-2 text-sm font-semibold text-[var(--bits-gold-hover)]">
          Overdue
        </p>
      ) : null}
      {row.dueSoon && !row.overdue ? (
        <p className="mt-2 text-sm font-medium text-[var(--bits-navy)]">
          Due back soon
        </p>
      ) : null}
      {row.returnNote ? (
        <p className="mt-2 text-sm text-[var(--bits-navy)]">
          Return note: {row.returnNote}
        </p>
      ) : null}
    </>
  );
}

function ReturnForm({ row }: { row: EquipmentCheckoutRow }) {
  return (
    <form action={returnEquipmentCheckoutAction} className="mt-4 grid gap-2">
      <input type="hidden" name="checkoutId" value={row.id} />
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Return note (optional)
        <textarea
          name="returnNote"
          maxLength={EQUIPMENT_CHECKOUT_RETURN_NOTE_MAX}
          rows={2}
          className={fieldClass}
        />
      </label>
      <button
        type="submit"
        className={`w-fit rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white ${focusClass}`}
      >
        Return
        <span className="sr-only"> {row.equipmentName}</span>
      </button>
    </form>
  );
}
