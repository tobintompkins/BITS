"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import {
  kioskCheckInAttendeeAction,
  searchKioskCheckInAttendeesAction,
} from "@/app/(staff)/events/kiosk-check-in-actions";
import {
  KIOSK_CHURCH_NAME,
  kioskCheckInWindowLabel,
  kioskCheckInWindowState,
  kioskQueryIsReady,
  kioskShowsCheckInButton,
  type KioskCheckInResult,
} from "@/lib/events/check-in-kiosk-ui";
import type { StaffCheckInAvailabilityState } from "@/lib/events/staff-check-in-availability";

const focusClass =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]";

function windowBadgeClass(state: StaffCheckInAvailabilityState) {
  if (state === "open") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  return "border-amber-200 bg-amber-50 text-amber-950";
}

export function CheckInKiosk({
  eventId,
  eventTitle,
  startLabel,
  timezone,
  settings,
}: {
  eventId: string;
  eventTitle: string;
  startLabel: string;
  timezone: string | null;
  settings: {
    checkInEnabled: boolean;
    checkInOpensAt: Date | string | null;
    checkInClosesAt: Date | string | null;
    stationNameRequired: boolean;
  };
}) {
  const headingId = useId();
  const inputId = useId();
  const helpId = useId();
  const liveId = useId();
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<KioskCheckInResult[]>([]);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [isSearching, startSearch] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (confirmation) return;
    if (!kioskQueryIsReady(query)) return;

    const handle = window.setTimeout(() => {
      startSearch(async () => {
        const formData = new FormData();
        formData.set("eventId", eventId);
        formData.set("query", query);
        formData.set("page", "1");
        formData.set("pageSize", "8");
        const result = await searchKioskCheckInAttendeesAction(formData);
        if (result.status !== "success") {
          setItems([]);
          setMessage(result.message);
          return;
        }
        setItems(result.items);
        setMessage(
          result.items.length === 0
            ? "No registered guests matched that search."
            : `${result.items.length} registered guest${result.items.length === 1 ? "" : "s"} found.`,
        );
      });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [confirmation, eventId, query]);

  const availability = kioskCheckInWindowState(settings, now);
  const checkInOpen = availability === "open" && !settings.stationNameRequired;
  const windowLabel = settings.stationNameRequired
    ? "Check-in unavailable"
    : kioskCheckInWindowLabel(availability);
  const queryReady = kioskQueryIsReady(query);
  const visibleItems = confirmation || !queryReady ? [] : items;
  const liveMessage = confirmation
    ? confirmation
    : !queryReady && query.trim()
      ? "Enter at least two characters to search."
      : message;

  async function handleCheckIn(result: KioskCheckInResult) {
    if (pendingId || !checkInOpen || !kioskShowsCheckInButton(result)) return;
    setPendingId(result.id);
    const formData = new FormData();
    formData.set("eventId", eventId);
    formData.set("attendeeId", result.id);
    formData.set("operationKey", crypto.randomUUID());
    const outcome = await kioskCheckInAttendeeAction(formData);
    setPendingId(null);
    if (outcome.status !== "success") {
      setMessage(outcome.message);
      return;
    }
    setConfirmation(
      outcome.alreadyPresent
        ? `${result.displayName} is already checked in.`
        : `${result.displayName} is checked in.`,
    );
    setItems([]);
    setQuery("");
    setMessage(outcome.message);
  }

  function checkInAnotherPerson() {
    setConfirmation(null);
    setItems([]);
    setQuery("");
    setMessage("");
    setPendingId(null);
    searchRef.current?.focus();
  }

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-xl space-y-6 rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm sm:p-8"
    >
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
          {KIOSK_CHURCH_NAME}
        </p>
        <h1
          id={headingId}
          className="text-2xl font-semibold text-[var(--bits-navy)]"
        >
          Event Check-In Kiosk
        </h1>
        <p className="text-base font-medium text-[var(--bits-navy)]">
          {eventTitle}
        </p>
        <p className="text-sm text-[var(--bits-muted)]">
          {startLabel}
          {timezone ? ` · ${timezone}` : ""}
        </p>
        <p
          className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${windowBadgeClass(
            settings.stationNameRequired ? "disabled" : availability,
          )}`}
          role="status"
        >
          {windowLabel}
        </p>
        {settings.stationNameRequired ? (
          <p className="text-sm text-[var(--bits-muted)]">
            This event requires a named station. Use full staff check-in.
          </p>
        ) : null}
      </header>

      <div
        id={liveId}
        aria-live="polite"
        aria-atomic="true"
        className="min-h-[1.5rem] text-sm text-[var(--bits-navy)]"
      >
        {liveMessage}
        {isSearching && !confirmation && queryReady ? " Searching…" : null}
      </div>

      {confirmation ? (
        <div className="space-y-4 rounded-2xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-5">
          <p className="text-lg font-semibold text-[var(--bits-navy)]">
            {confirmation}
          </p>
          <button
            type="button"
            onClick={checkInAnotherPerson}
            className={`min-h-12 w-full rounded-xl bg-[var(--bits-navy)] px-4 py-3 text-base font-semibold text-white ${focusClass}`}
          >
            Check in another person
          </button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          <div>
            <label
              htmlFor={inputId}
              className="block text-base font-semibold text-[var(--bits-navy)]"
            >
              Find a registered guest or member
            </label>
            <p id={helpId} className="mt-1 text-sm text-[var(--bits-muted)]">
              Search by name or confirmation code.
            </p>
            <input
              ref={searchRef}
              id={inputId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-describedby={`${helpId} ${liveId}`}
              aria-controls={listId}
              autoComplete="off"
              className={`mt-3 min-h-12 w-full rounded-xl border border-[var(--bits-border)] bg-white px-4 py-3 text-lg text-[var(--bits-navy)] ${focusClass}`}
              placeholder="Name or confirmation code"
            />
          </div>

          <ul id={listId} className="space-y-3">
            {visibleItems.map((item) => {
              const showButton =
                checkInOpen && kioskShowsCheckInButton(item);
              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-4"
                >
                  <p className="text-xl font-semibold text-[var(--bits-navy)]">
                    {item.displayName}
                  </p>
                  <p className="mt-1 text-sm text-[var(--bits-muted)]">
                    {item.statusLabel}
                  </p>
                  {showButton ? (
                    <button
                      type="button"
                      disabled={pendingId != null}
                      onClick={() => handleCheckIn(item)}
                      className={`mt-4 min-h-12 w-full rounded-xl bg-[var(--bits-gold)] px-4 py-3 text-base font-bold text-[var(--bits-navy-deep)] ${focusClass} disabled:opacity-60`}
                    >
                      {pendingId === item.id ? "Checking in…" : "Check in"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </form>
      )}

      <p className="border-t border-[var(--bits-border)] pt-4 text-sm">
        <span className="font-semibold text-[var(--bits-navy)]">Need help?</span>{" "}
        <Link
          href={`/events/${eventId}/staff-check-in`}
          className={`font-semibold text-[var(--bits-navy)] underline ${focusClass}`}
        >
          Use full staff check-in
        </Link>
        {" · "}
        <Link
          href={`/events/${eventId}`}
          className={`text-[var(--bits-muted)] underline ${focusClass}`}
        >
          Event detail
        </Link>
      </p>
    </section>
  );
}
