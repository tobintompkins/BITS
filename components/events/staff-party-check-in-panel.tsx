"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { getStaffCheckInPartyAttendeesAction } from "@/app/(staff)/events/check-in-actions";
import {
  EventAttendeeSearchSelect,
  type SelectableEventAttendee,
} from "@/components/events/event-attendee-search-select";
import {
  mapStaffPartyCheckInFailureMessage,
  submitStaffPartyCheckIn,
  type StaffPartyCheckInApiSuccess,
} from "@/lib/api/staff-party-check-in-client";
import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";
import {
  isStaffPartyAttendeeSelectable,
  mapStaffPartyOutcomeLabel,
  staffPartyAttendanceLabel,
  toggleStaffPartyAttendeeSelection,
  validateStaffPartySelection,
} from "@/lib/events/staff-party-check-in-selection";
import {
  getStaffCheckInAvailabilityState,
  staffCheckInAvailabilityLabel,
  type StaffCheckInAvailabilityState,
} from "@/lib/events/staff-check-in-availability";
import {
  isStationClosedCheckInFailure,
  partyCheckInSuccessMessage,
  stationIdForCheckInRequest,
} from "@/lib/events/staff-check-in-station-selection";

type PartyAttendee = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  attendanceStatus: string;
};

type PartyState = {
  registrationId: string;
  confirmationCode: string;
  registrationStatus: string;
  attendees: PartyAttendee[];
};

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

export function StaffPartyCheckInPanel({
  eventId,
  settings,
  stationId = "",
  stationName = null,
  onStationClosed,
}: {
  eventId: string;
  settings: {
    checkInEnabled: boolean;
    checkInOpensAt: Date | string | null;
    checkInClosesAt: Date | string | null;
  };
  /** Shared optional station from the parent staff check-in screen. */
  stationId?: string;
  stationName?: string | null;
  onStationClosed?: () => void;
}) {
  const headingId = useId();
  const legendId = useId();
  const countId = useId();
  const feedbackId = useId();
  const selectionErrorId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const [seedAttendee, setSeedAttendee] =
    useState<SelectableEventAttendee | null>(null);
  const [party, setParty] = useState<PartyState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [result, setResult] = useState<StaffPartyCheckInApiSuccess | null>(null);
  const [pending, setPending] = useState(false);
  const [loadingParty, startLoadParty] = useTransition();
  const [availability, setAvailability] =
    useState<StaffCheckInAvailabilityState>(() =>
      getStaffCheckInAvailabilityState(settings),
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

  function clearPartyState() {
    setParty(null);
    setSelectedIds([]);
    setSelectionError(null);
    setFeedback(null);
    setResult(null);
  }

  function handleSeedSelect(next: SelectableEventAttendee | null) {
    setSeedAttendee(next);
    clearPartyState();
    if (!next?.registrationId) return;

    startLoadParty(async () => {
      const response = await getStaffCheckInPartyAttendeesAction(
        eventId,
        next.registrationId,
      );
      if (response.status !== "success" || !("party" in response)) {
        setFeedback({
          tone: "error",
          message:
            "message" in response
              ? response.message
              : "Unable to load registration attendees.",
        });
        return;
      }
      setParty({
        registrationId: response.party.registrationId,
        confirmationCode: response.party.confirmationCode,
        registrationStatus: response.party.registrationStatus,
        attendees: response.party.attendees,
      });
    });
  }

  function handleToggle(attendeeId: string, checked: boolean) {
    setSelectedIds((prev) =>
      toggleStaffPartyAttendeeSelection(prev, attendeeId, checked),
    );
    setSelectionError(null);
    setFeedback(null);
    setResult(null);
  }

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (pending) return;

    const validation = validateStaffPartySelection({
      registrationId: party?.registrationId ?? null,
      selectedIds,
    });
    if (!validation.ok) {
      setSelectionError(validation.message);
      setFeedback(null);
      setResult(null);
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
    setResult(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const apiResult = await submitStaffPartyCheckIn({
      eventId,
      registrationId: party!.registrationId,
      attendeeIds: validation.attendeeIds,
      idempotencyKey: crypto.randomUUID(),
      stationId: stationIdForCheckInRequest(stationId),
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    if (apiResult.ok) {
      setResult(apiResult.data);
      setFeedback({
        tone:
          apiResult.data.newlyCheckedInCount > 0 ? "success" : "info",
        message: partyCheckInSuccessMessage({
          newlyCheckedInCount: apiResult.data.newlyCheckedInCount,
          alreadyPresentCount: apiResult.data.alreadyPresentCount,
          requestedCount: apiResult.data.requestedCount,
          stationName:
            apiResult.data.newlyCheckedInCount > 0 ? stationName : null,
        }),
      });
      // Clear only successfully processed selections.
      setSelectedIds([]);
      // Refresh attendance labels for the same registration.
      if (party) {
        const refreshed = await getStaffCheckInPartyAttendeesAction(
          eventId,
          party.registrationId,
        );
        if (refreshed.status === "success" && "party" in refreshed) {
          setParty({
            registrationId: refreshed.party.registrationId,
            confirmationCode: refreshed.party.confirmationCode,
            registrationStatus: refreshed.party.registrationStatus,
            attendees: refreshed.party.attendees,
          });
        }
      }
      setPending(false);
      return;
    }

    if (isStationClosedCheckInFailure(apiResult)) {
      onStationClosed?.();
      setFeedback({
        tone: "error",
        message: mapStaffPartyCheckInFailureMessage(apiResult),
      });
      setPending(false);
      return;
    }

    setFeedback({
      tone: "error",
      message: mapStaffPartyCheckInFailureMessage(apiResult),
    });
    setPending(false);
  }

  const selectedCount = selectedIds.length;
  const controlsDisabled = pending || loadingParty;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <header className="space-y-1">
        <h2
          id={headingId}
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Selected party check-in
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Choose one registration, explicitly select attendees, then check in
          the selected people only. Uses the optional station selected above.
        </p>
      </header>

      <EventAttendeeSearchSelect
        eventId={eventId}
        selected={seedAttendee}
        onSelect={handleSeedSelect}
        disabled={controlsDisabled}
        label="Find registration by attendee"
        helpText="Search by name or confirmation code. Selecting a match loads that registration’s party for this event."
      />

      {loadingParty ? (
        <p role="status" className="text-sm text-zinc-500">
          Loading party…
        </p>
      ) : null}

      {party ? (
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="font-medium">
              Registration {party.confirmationCode}
            </p>
            <p className="text-xs text-zinc-500">
              Status: {party.registrationStatus}
            </p>
          </div>

          <fieldset disabled={controlsDisabled} className="space-y-3">
            <legend id={legendId} className="text-sm font-medium">
              Select attendees to check in
            </legend>
            <p id={countId} className="text-xs text-zinc-500" aria-live="polite">
              {selectedCount} selected · maximum {STAFF_PARTY_CHECK_IN_MAX_ATTENDEES}
            </p>
            <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {party.attendees.map((attendee) => {
                const selectable = isStaffPartyAttendeeSelectable({
                  attendeeStatus: attendee.status,
                  attendanceStatus: attendee.attendanceStatus,
                });
                const checkboxId = `party-attendee-${attendee.id}`;
                const checked = selectedIds.includes(attendee.id);
                const outcome = result?.attendees.find(
                  (row) => row.attendeeId === attendee.id,
                );
                return (
                  <li key={attendee.id} className="px-3 py-2">
                    <div className="flex items-start gap-3">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        disabled={!selectable || controlsDisabled}
                        onChange={(event) =>
                          handleToggle(attendee.id, event.target.checked)
                        }
                      />
                      <label htmlFor={checkboxId} className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">
                          {attendee.lastName}, {attendee.firstName}
                        </span>
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {staffPartyAttendanceLabel(attendee.attendanceStatus)}
                          {!selectable ? " · ineligible" : ""}
                          {outcome
                            ? ` · ${mapStaffPartyOutcomeLabel(outcome.outcome)}`
                            : ""}
                        </span>
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>

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
            disabled={controlsDisabled || !checkInEnabled}
            aria-describedby={`${countId}${feedback ? ` ${feedbackId}` : ""}`}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Checking in selected…" : "Check in selected"}
          </button>
        </form>
      ) : null}

      {result ? (
        <div className="space-y-2 text-sm" aria-label="Party check-in results">
          <p>
            Requested {result.requestedCount} · newly checked in{" "}
            {result.newlyCheckedInCount} · already present{" "}
            {result.alreadyPresentCount}
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {result.attendees.map((row) => {
              const name =
                party?.attendees.find((a) => a.id === row.attendeeId) ?? null;
              return (
                <li key={row.attendeeId}>
                  {name
                    ? `${name.lastName}, ${name.firstName}`
                    : "Selected attendee"}{" "}
                  — {mapStaffPartyOutcomeLabel(row.outcome)}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

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
  );
}
