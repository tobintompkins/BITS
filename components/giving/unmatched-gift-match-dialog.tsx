"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  matchUnmatchedOnlineGiftAction,
  searchGiftMatchDonorsAction,
} from "@/app/(staff)/statements/unmatched/actions";

type Gift = {
  id: string;
  offeringDateLabel: string;
  totalAmountLabel: string;
  fund: string;
  environmentLabel: string;
  isTest: boolean;
};

type DonorOption = {
  id: string;
  name: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
  householdName: string | null;
  recommended: boolean;
};

export function UnmatchedGiftMatchDialog({ gift }: { gift: Gift }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [selectedDonorId, setSelectedDonorId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [matching, startMatch] = useTransition();

  const selected = donors.find((donor) => donor.id === selectedDonorId);

  function openDialog() {
    setQuery("");
    setDonors([]);
    setSelectedDonorId("");
    setConfirming(false);
    setMessage(null);
    setError(null);
    dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function runSearch() {
    startSearch(async () => {
      setError(null);
      const result = await searchGiftMatchDonorsAction(query);
      if (!result.ok) {
        setDonors([]);
        setError(result.error);
        return;
      }
      setDonors(result.donors);
      if (result.donors.length === 0) {
        setError("No active donors in this church matched that search.");
      }
    });
  }

  function runMatch() {
    if (!selected) return;
    startMatch(async () => {
      const result = await matchUnmatchedOnlineGiftAction({
        donationId: gift.id,
        donorId: selected.id,
        confirmed: true,
      });
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setMessage("The gift was matched and removed from the unmatched queue.");
      closeDialog();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="rounded-md bg-[var(--bits-navy)] px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
      >
        Review &amp; match
      </button>
      {message ? (
        <p role="status" className="mt-2 text-xs text-emerald-800">
          {message}
        </p>
      ) : null}

      <dialog
        ref={dialogRef}
        className="w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-[var(--bits-border)] bg-white p-0 shadow-xl"
        aria-labelledby={`${searchId}-title`}
      >
        <form
          method="dialog"
          className="flex items-start justify-between gap-4 border-b border-[var(--bits-border)] px-5 py-4"
        >
          <div>
            <h3
              id={`${searchId}-title`}
              className="text-lg font-semibold text-[var(--bits-navy)]"
            >
              Match unmatched gift
            </h3>
            <p className="mt-1 text-sm text-[var(--bits-muted)]">
              Search this church’s active donors, then confirm the match.
            </p>
          </div>
          <button
            type="submit"
            className="rounded-md px-2 py-1 text-sm font-semibold text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Close
          </button>
        </form>

        <div className="space-y-4 px-5 py-4">
          <dl className="grid gap-2 rounded-xl bg-[var(--bits-page)] px-4 py-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--bits-muted)]">Gift date</dt>
              <dd className="font-medium">{gift.offeringDateLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bits-muted)]">Amount</dt>
              <dd className="font-medium">{gift.totalAmountLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bits-muted)]">Fund</dt>
              <dd className="font-medium">{gift.fund}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bits-muted)]">Environment</dt>
              <dd className="font-medium">{gift.environmentLabel}</dd>
            </div>
          </dl>

          {!confirming ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid min-w-56 flex-1 gap-1 text-sm">
                  <span className="font-medium text-[var(--bits-navy)]">
                    Search donors
                  </span>
                  <input
                    id={searchId}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        runSearch();
                      }
                    }}
                    placeholder="Name or email"
                    className="rounded-xl border border-[var(--bits-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                  />
                </label>
                <button
                  type="button"
                  onClick={runSearch}
                  disabled={searching || query.trim().length === 0}
                  className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  {searching ? "Searching…" : "Search"}
                </button>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-[var(--bits-navy)]">
                  Donor candidates
                </legend>
                {donors.length === 0 ? (
                  <p className="text-sm text-[var(--bits-muted)]">
                    Search to see active donors from this church only.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--bits-border)] rounded-xl border border-[var(--bits-border)]">
                    {donors.map((donor) => (
                      <li key={donor.id}>
                        <label className="flex cursor-pointer items-start gap-3 px-3 py-3 focus-within:bg-[var(--bits-page)]">
                          <input
                            type="radio"
                            name={`donor-${gift.id}`}
                            value={donor.id}
                            checked={selectedDonorId === donor.id}
                            onChange={() => setSelectedDonorId(donor.id)}
                            className="mt-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                          />
                          <span>
                            <span className="block font-medium text-[var(--bits-navy)]">
                              {donor.name}
                              {donor.recommended ? (
                                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                                  Exact email recommendation
                                </span>
                              ) : null}
                            </span>
                            <span className="block text-xs text-[var(--bits-muted)]">
                              {[donor.maskedEmail, donor.maskedPhone, donor.householdName]
                                .filter(Boolean)
                                .join(" · ") || "No contact details"}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
            </>
          ) : selected ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
              <p className="font-semibold text-amber-950">Confirm this match</p>
              <p className="mt-2 leading-6 text-amber-950">
                Assign the {gift.isTest ? "Stripe test" : "live"} gift from{" "}
                {gift.offeringDateLabel} for {gift.totalAmountLabel} ({gift.fund})
                to {selected.name}? This cannot be undone from this screen.
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={runMatch}
                  disabled={matching}
                  className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
                >
                  {matching ? "Saving…" : "Confirm match"}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!selected}
                onClick={() => {
                  setError(null);
                  setConfirming(true);
                }}
                className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
              >
                Continue to confirmation
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
