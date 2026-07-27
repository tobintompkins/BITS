"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  mapStaffCheckInFailureMessage,
  submitStaffCheckIn,
} from "@/lib/api/staff-check-in-client";
import {
  getStaffCheckInAvailabilityState,
  staffCheckInAvailabilityLabel,
  type StaffCheckInAvailabilityState,
} from "@/lib/events/staff-check-in-availability";
import {
  isStationClosedCheckInFailure,
  singleCheckInSuccessMessage,
  STAFF_CHECK_IN_NO_STATION_VALUE,
  stationIdForCheckInRequest,
  type SelectableCheckInStation,
} from "@/lib/events/staff-check-in-station-selection";
import {
  EventAttendeeSearchSelect,
  type SelectableEventAttendee,
} from "@/components/events/event-attendee-search-select";
import { StaffCheckInStationSelect } from "@/components/events/staff-check-in-station-select";
import { StaffPartyCheckInPanel } from "@/components/events/staff-party-check-in-panel";
import { StaffQrCheckInPanel } from "@/components/events/staff-qr-check-in-panel";

type Feedback =
  | { tone: "success" | "info" | "error"; message: string }
  | null;

function feedbackClass(tone: NonNullable<Feedback>["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100";
  }
  if (tone === "info") {
    return "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100";
  }
  return "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100";
}

export function StaffCheckInPanel({
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
  };
}) {
  const headingId = useId();
  const feedbackId = useId();
  const selectionErrorId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const [selected, setSelected] = useState<SelectableEventAttendee | null>(
    null,
  );
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);
  const [stationId, setStationId] = useState(STAFF_CHECK_IN_NO_STATION_VALUE);
  const [stationError, setStationError] = useState<string | null>(null);
  const [stationRefreshToken, setStationRefreshToken] = useState(0);
  const [stations, setStations] = useState<SelectableCheckInStation[]>([]);
  const [availability, setAvailability] = useState<StaffCheckInAvailabilityState>(
    () => getStaffCheckInAvailabilityState(settings),
  );

  useEffect(() => {
    const sync = () =>
      setAvailability(getStaffCheckInAvailabilityState(settings, new Date()));
    sync();
    const id = window.setInterval(sync, 30_000);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [settings]);

  const checkInEnabled = availability === "open";
  const selectedStationName = stations.find(
    (row) => row.id === stationId,
  )?.name;

  function handleSelect(next: SelectableEventAttendee | null) {
    setSelected(next);
    setSelectionError(null);
    setFeedback(null);
  }

  function handleStationChange(next: string) {
    setStationId(next);
    setStationError(null);
  }

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (pending) return;

    if (!selected) {
      setSelectionError("Select an attendee before checking in.");
      setFeedback(null);
      return;
    }
    if (!checkInEnabled) {
      setFeedback({
        tone: "error",
        message: staffCheckInAvailabilityLabel(availability),
      });
      return;
    }

    setPending(true);
    setFeedback(null);
    setSelectionError(null);
    setStationError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const requestStationId = stationIdForCheckInRequest(stationId);
    const result = await submitStaffCheckIn({
      eventId,
      attendeeId: selected.id,
      idempotencyKey: crypto.randomUUID(),
      stationId: requestStationId,
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    if (result.ok) {
      const name = `${selected.lastName}, ${selected.firstName}`;
      setFeedback({
        tone: result.data.alreadyPresent ? "info" : "success",
        message: singleCheckInSuccessMessage({
          attendeeName: name,
          alreadyPresent: result.data.alreadyPresent,
          stationName: result.data.alreadyPresent
            ? null
            : selectedStationName,
        }),
      });
      setPending(false);
      return;
    }

    if (isStationClosedCheckInFailure(result)) {
      setStationError(mapStaffCheckInFailureMessage(result));
      setStationId(STAFF_CHECK_IN_NO_STATION_VALUE);
      setStationRefreshToken((token) => token + 1);
      setFeedback({
        tone: "error",
        message: mapStaffCheckInFailureMessage(result),
      });
      setPending(false);
      return;
    }

    setFeedback({
      tone: "error",
      message: mapStaffCheckInFailureMessage(result),
    });
    setPending(false);
  }

  return (
    <div className="space-y-6">
      <section
        aria-labelledby={headingId}
        className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header className="space-y-1">
          <h1
            id={headingId}
            className="text-xl font-semibold text-zinc-900 dark:text-zinc-100"
          >
            Staff check-in
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {eventTitle}
          </p>
          <p className="text-xs text-zinc-500">
            {startLabel}
            {timezone ? ` · ${timezone}` : ""}
          </p>
        </header>

        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            availability === "open"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
              : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          }`}
          role="status"
        >
          {staffCheckInAvailabilityLabel(availability)}
        </p>

        <StaffCheckInStationSelect
          key={`${eventId}-${stationRefreshToken}`}
          eventId={eventId}
          value={stationId}
          onChange={handleStationChange}
          disabled={pending}
          error={stationError}
          onStationsLoaded={setStations}
        />

        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Single attendee
          </h2>
          <EventAttendeeSearchSelect
            eventId={eventId}
            selected={selected}
            onSelect={handleSelect}
            disabled={pending}
          />
          {selectionError ? (
            <p
              id={selectionErrorId}
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              {selectionError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || !checkInEnabled}
            aria-busy={pending}
            aria-describedby={feedback ? feedbackId : undefined}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Checking in…" : "Check in"}
          </button>
        </form>

        <div
          id={feedbackId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="min-h-[1.5rem]"
        >
          {feedback ? (
            <p
              className={`rounded-md border px-3 py-2 text-sm ${feedbackClass(feedback.tone)}`}
            >
              {feedback.message}
            </p>
          ) : null}
        </div>
      </section>

      <StaffQrCheckInPanel
        key={`qr-${eventId}`}
        eventId={eventId}
        stationId={stationId}
        stationName={selectedStationName ?? null}
        onStationClosed={() => {
          setStationError("This check-in station is closed.");
          setStationId(STAFF_CHECK_IN_NO_STATION_VALUE);
          setStationRefreshToken((token) => token + 1);
        }}
      />

      <StaffPartyCheckInPanel
        eventId={eventId}
        settings={settings}
        stationId={stationId}
        stationName={selectedStationName ?? null}
        onStationClosed={() => {
          setStationError("This check-in station is closed.");
          setStationId(STAFF_CHECK_IN_NO_STATION_VALUE);
          setStationRefreshToken((token) => token + 1);
        }}
      />
    </div>
  );
}
