"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import {
  confirmVerifiedChildCheckOutAction,
  listChildPickupApprovalsAction,
  searchVerifiedChildCheckOutAction,
} from "@/app/(staff)/events/child-pickup-checkout-actions";
import {
  CHILD_PICKUP_CHECKOUT_CONFIRM_LABEL,
  CHILD_PICKUP_CHECKOUT_SAFETY_NOTE,
  CHILD_PICKUP_CHECKOUT_TITLE,
  type ChildPickupApprovalRow,
  type ChildPickupSearchRow,
} from "@/lib/validation/child-pickup-checkout";

type ChildPickupCheckoutPanelProps = {
  eventId: string;
  eventTitle: string;
  allowCheckOut: boolean;
  staffCheckInHref: string;
};

const inputClassName =
  "w-full rounded-md border border-[var(--bits-border)] bg-white px-3 py-3 text-base text-[var(--bits-navy)] shadow-sm outline-none transition focus:border-[var(--bits-gold)] focus:ring-2 focus:ring-[var(--bits-gold)]/40";

export function ChildPickupCheckoutPanel({
  eventId,
  eventTitle,
  allowCheckOut,
  staffCheckInHref,
}: ChildPickupCheckoutPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<"success" | "error" | "info" | null>(
    null,
  );
  const [matches, setMatches] = useState<ChildPickupSearchRow[]>([]);
  const [selected, setSelected] = useState<ChildPickupSearchRow | null>(null);
  const [approvals, setApprovals] = useState<ChildPickupApprovalRow[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState<string | null>(null);
  const [completedLabel, setCompletedLabel] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLButtonElement>(null);
  const pickupRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  function resetAll() {
    setQuery("");
    setMatches([]);
    setSelected(null);
    setApprovals([]);
    setSelectedPickupId(null);
    setCompletedLabel(null);
    setHasSearched(false);
    setStatusMessage(null);
    setStatusKind(null);
    queueMicrotask(() => searchRef.current?.focus());
  }

  function search() {
    startTransition(async () => {
      const result = await searchVerifiedChildCheckOutAction(eventId, query);
      if (result.status !== "READY") {
        setStatusKind("error");
        setStatusMessage(
          result.status === "INVALID"
            ? result.message
            : "Unable to search right now.",
        );
        setMatches([]);
        return;
      }
      setMatches(result.rows);
      setSelected(null);
      setApprovals([]);
      setSelectedPickupId(null);
      setHasSearched(true);
      if (result.rows.length === 0) {
        setStatusKind("info");
        setStatusMessage("No checked-in children matched that search.");
        return;
      }
      setStatusKind("info");
      setStatusMessage(`${result.rows.length} checked-in ${result.rows.length === 1 ? "child" : "children"} found.`);
      queueMicrotask(() => resultRef.current?.focus());
    });
  }

  function selectChild(row: ChildPickupSearchRow) {
    startTransition(async () => {
      const result = await listChildPickupApprovalsAction(eventId, row.attendanceId);
      setSelected(row);
      setSelectedPickupId(null);
      if (result.status === "NO_APPROVALS") {
        setApprovals([]);
        setStatusKind("info");
        setStatusMessage(
          "This member has no active approved pickup person. An authorized leader can update the private member profile.",
        );
        return;
      }
      if (result.status !== "READY") {
        setApprovals([]);
        setStatusKind("error");
        setStatusMessage("Unable to load approved pickup people for that child.");
        return;
      }
      setApprovals(result.rows);
      setStatusKind("info");
      setStatusMessage(`Select the approved pickup person for ${result.displayLabel}.`);
      queueMicrotask(() => pickupRef.current?.focus());
    });
  }

  function confirmCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !selectedPickupId) return;
    const formData = new FormData();
    formData.set("eventId", eventId);
    formData.set("attendanceId", selected.attendanceId);
    formData.set("approvedPickupId", selectedPickupId);

    startTransition(async () => {
      const result = await confirmVerifiedChildCheckOutAction(formData);
      if (result.status !== "success") {
        setStatusKind("error");
        setStatusMessage(result.message);
        return;
      }
      setCompletedLabel(result.displayLabel);
      setStatusKind("success");
      setStatusMessage(`Checked out ${result.displayLabel}.`);
      setSelected(null);
      setApprovals([]);
      setSelectedPickupId(null);
      setMatches([]);
    });
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-[var(--bits-gold)]">{eventTitle}</p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">
          {CHILD_PICKUP_CHECKOUT_TITLE}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--bits-navy)]/80">
          {CHILD_PICKUP_CHECKOUT_SAFETY_NOTE}
        </p>
      </div>

      <div
        aria-live="polite"
        className={
          statusMessage
            ? statusKind === "success"
              ? "rounded-md border border-[var(--bits-gold)] bg-[var(--bits-gold)]/15 px-3 py-2 text-sm text-[var(--bits-navy)]"
              : statusKind === "error"
                ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                : "rounded-md border border-[var(--bits-border)] bg-[#f5f6f8] px-3 py-2 text-sm text-[var(--bits-navy)]"
            : "sr-only"
        }
      >
        {statusMessage ?? ""}
      </div>

      {completedLabel ? (
        <div className="rounded-xl border border-[var(--bits-border)] bg-white p-6 shadow-sm">
          <p className="text-base font-medium text-[var(--bits-navy)]">
            Check-out complete for {completedLabel}.
          </p>
          <button
            type="button"
            onClick={resetAll}
            className="mt-4 min-h-11 rounded-md bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Verify another pickup
          </button>
        </div>
      ) : null}

      {!allowCheckOut ? (
        <p className="rounded-xl border border-[var(--bits-border)] bg-[#f5f6f8] p-4 text-sm text-[var(--bits-navy)]">
          Check-out is not enabled for this event. Use the{" "}
          <Link href={staffCheckInHref} className="font-semibold underline">
            full staff check-in
          </Link>{" "}
          experience for other attendance work.
        </p>
      ) : null}

      {!completedLabel && allowCheckOut ? (
        <>
          <form
            className="rounded-xl border border-[var(--bits-border)] bg-white p-6 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              search();
            }}
          >
            <label className="block text-sm font-semibold text-[var(--bits-navy)]">
              Find checked-in child
              <input
                ref={searchRef}
                className={`${inputClassName} mt-2`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                aria-describedby="child-pickup-search-help"
              />
            </label>
            <p id="child-pickup-search-help" className="mt-2 text-sm text-[var(--bits-navy)]/75">
              Search currently checked-in members by name. Enter at least two letters.
            </p>
            <button
              type="submit"
              disabled={isPending}
              className="mt-4 min-h-11 rounded-md bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Search
            </button>
          </form>

          {hasSearched && matches.length === 0 && !selected ? (
            <p className="text-sm text-[var(--bits-navy)]/80">
              No eligible child is currently checked in for that search. Use the{" "}
              <Link href={staffCheckInHref} className="font-semibold underline">
                full staff check-in
              </Link>{" "}
              attendance experience.
            </p>
          ) : null}

          {matches.length > 0 ? (
            <ul className="space-y-2">
              {matches.map((row, index) => (
                <li key={row.attendanceId}>
                  <button
                    type="button"
                    ref={index === 0 ? resultRef : undefined}
                    onClick={() => selectChild(row)}
                    className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[var(--bits-border)] bg-white px-4 py-3 text-left text-[var(--bits-navy)] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                  >
                    <span className="font-medium">{row.displayLabel}</span>
                    <span className="text-sm font-semibold">Select</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selected && approvals.length > 0 ? (
            <form
              onSubmit={confirmCheckout}
              className="rounded-xl border border-[var(--bits-border)] bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
                Verify approved pickup for {selected.displayLabel}
              </h2>
              <fieldset className="mt-4 space-y-3">
                <legend className="text-sm font-medium text-[var(--bits-navy)]">
                  Approved pickup person
                </legend>
                {approvals.map((person, index) => (
                  <label
                    key={person.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[var(--bits-border)] bg-[#f5f6f8] px-3 py-2 text-[var(--bits-navy)]"
                  >
                    <input
                      ref={index === 0 ? pickupRef : undefined}
                      type="radio"
                      name="approvedPickup"
                      value={person.id}
                      checked={selectedPickupId === person.id}
                      onChange={() => setSelectedPickupId(person.id)}
                      className="h-4 w-4"
                    />
                    <span>
                      <span className="font-medium">
                        {person.firstName} {person.lastName}
                      </span>
                      <span className="block text-sm text-[var(--bits-navy)]/75">
                        {person.relationship}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button
                type="submit"
                disabled={isPending || !selectedPickupId}
                className="mt-5 min-h-11 rounded-md bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
              >
                {CHILD_PICKUP_CHECKOUT_CONFIRM_LABEL}
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
