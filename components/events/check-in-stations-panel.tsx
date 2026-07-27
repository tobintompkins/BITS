"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  closeCheckInStation,
  listCheckInStations,
  mapCheckInStationFailureMessage,
  openCheckInStation,
  type CheckInStationDto,
} from "@/lib/api/check-in-station-client";
import type { EventCheckInStationStatus } from "@/lib/constants/event-check-in-station";
import {
  canStartStationMutation,
  clampStationListPage,
  closeStationButtonLabel,
  closeStationConfirmCopy,
  closeStationSuccessMessage,
  emptyOpenStationForm,
  formatStationDateTime,
  hasOpenStationFieldErrors,
  nextStationListQueryOnFilterChange,
  normalizeOpenStationPayload,
  openStationSuccessMessage,
  parseStationListQuery,
  shouldApplyStationListResponse,
  stationStatusLabel,
  validateOpenStationForm,
  type OpenStationFieldErrors,
  type OpenStationFormValues,
  type StationListQueryState,
} from "@/lib/events/check-in-stations-ui";

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

function statusBadgeClass(status: EventCheckInStationStatus) {
  if (status === "ACTIVE") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function ConfirmCloseDialog({
  stationName,
  isPending,
  onCancel,
  onConfirm,
}: {
  stationName: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = closeStationConfirmCopy(stationName);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2
          id={titleId}
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          {copy.title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {copy.message}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isPending ? "Closing…" : copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CheckInStationsPanel({
  eventId,
  eventTitle,
  startLabel,
  timezone,
}: {
  eventId: string;
  eventTitle: string;
  startLabel: string;
  timezone: string | null;
}) {
  const headingId = useId();
  const feedbackId = useId();
  const nameId = useId();
  const deviceId = useId();
  const nameErrorId = useId();
  const deviceErrorId = useId();
  const nameHelpId = useId();
  const deviceHelpId = useId();
  const filterId = useId();

  const listAbortRef = useRef<AbortController | null>(null);
  const openAbortRef = useRef<AbortController | null>(null);
  const closeAbortRef = useRef<AbortController | null>(null);
  const listGenerationRef = useRef(0);
  const closeTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [query, setQuery] = useState<StationListQueryState>(() =>
    parseStationListQuery({}),
  );
  const [stations, setStations] = useState<CheckInStationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<OpenStationFormValues>(emptyOpenStationForm);
  const [fieldErrors, setFieldErrors] = useState<OpenStationFieldErrors>({});
  const [openPending, setOpenPending] = useState(false);
  const [closingStationId, setClosingStationId] = useState<string | null>(null);
  const [confirmStation, setConfirmStation] = useState<CheckInStationDto | null>(
    null,
  );
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function loadStations(nextQuery: StationListQueryState) {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;
    const generation = ++listGenerationRef.current;

    setListLoading(true);
    setListError(null);

    const result = await listCheckInStations({
      eventId,
      page: nextQuery.page,
      pageSize: nextQuery.pageSize,
      status: nextQuery.status,
      signal: controller.signal,
    });

    if (
      controller.signal.aborted ||
      !shouldApplyStationListResponse(generation, listGenerationRef.current)
    ) {
      return;
    }

    if (!result.ok) {
      setListLoading(false);
      setListError(mapCheckInStationFailureMessage(result));
      return;
    }

    const safePage = clampStationListPage({
      page: result.data.page,
      pageSize: result.data.pageSize,
      total: result.data.total,
    });

    if (safePage !== result.data.page && result.data.total > 0) {
      const adjusted = { ...nextQuery, page: safePage };
      setQuery(adjusted);
      setListLoading(false);
      await loadStations(adjusted);
      return;
    }

    setStations(result.data.items);
    setTotal(result.data.total);
    setQuery({
      page: result.data.page,
      pageSize: result.data.pageSize,
      status: nextQuery.status,
    });
    setListLoading(false);
  }

  useEffect(() => {
    void loadStations(query);
    return () => {
      listAbortRef.current?.abort();
      openAbortRef.current?.abort();
      closeAbortRef.current?.abort();
    };
    // Initial load only — subsequent loads are driven by user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bootstrap
  }, [eventId]);

  function updateForm<K extends keyof OpenStationFormValues>(
    key: K,
    value: OpenStationFormValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    setFeedback(null);
  }

  async function handleOpenSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!canStartStationMutation(openPending)) return;

    const errors = validateOpenStationForm(form);
    if (hasOpenStationFieldErrors(errors)) {
      setFieldErrors(errors);
      setFeedback(null);
      return;
    }

    const payload = normalizeOpenStationPayload(form);
    setOpenPending(true);
    setFeedback(null);
    setFieldErrors({});
    openAbortRef.current?.abort();
    const controller = new AbortController();
    openAbortRef.current = controller;

    const result = await openCheckInStation({
      eventId,
      name: payload.name,
      deviceLabel: payload.deviceLabel,
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    if (result.ok) {
      setFeedback({
        tone: "success",
        message: openStationSuccessMessage(result.data.name),
      });
      setForm(emptyOpenStationForm());
      setOpenPending(false);
      const refreshed = { ...query, page: 1 };
      setQuery(refreshed);
      await loadStations(refreshed);
      return;
    }

    if (result.status === 409 && result.code === "STATION_NAME_CONFLICT") {
      setFeedback({
        tone: "error",
        message: mapCheckInStationFailureMessage(result),
      });
      setOpenPending(false);
      return;
    }

    if (result.fieldErrors?.name?.[0]) {
      setFieldErrors({ name: result.fieldErrors.name[0] });
    }
    if (result.fieldErrors?.deviceLabel?.[0]) {
      setFieldErrors((prev) => ({
        ...prev,
        deviceLabel: result.fieldErrors?.deviceLabel?.[0],
      }));
    }

    setFeedback({
      tone: "error",
      message: mapCheckInStationFailureMessage(result),
    });
    setOpenPending(false);
  }

  function requestClose(
    station: CheckInStationDto,
    trigger: HTMLButtonElement | null,
  ) {
    closeTriggerRef.current = trigger;
    setConfirmStation(station);
  }

  async function confirmClose() {
    if (!confirmStation) return;
    if (!canStartStationMutation(Boolean(closingStationId))) return;

    const station = confirmStation;
    setClosingStationId(station.id);
    setFeedback(null);
    closeAbortRef.current?.abort();
    const controller = new AbortController();
    closeAbortRef.current = controller;

    const result = await closeCheckInStation({
      eventId,
      stationId: station.id,
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    setConfirmStation(null);
    setClosingStationId(null);
    closeTriggerRef.current?.focus();
    closeTriggerRef.current = null;

    if (result.ok) {
      const outcome =
        result.data.outcome === "ALREADY_CLOSED" ? "ALREADY_CLOSED" : "CLOSED";
      setFeedback({
        tone: outcome === "ALREADY_CLOSED" ? "info" : "success",
        message: closeStationSuccessMessage(result.data.name, outcome),
      });
      await loadStations(query);
      return;
    }

    setFeedback({
      tone: "error",
      message: mapCheckInStationFailureMessage(result),
    });
    await loadStations(query);
  }

  function cancelClose() {
    setConfirmStation(null);
    closeTriggerRef.current?.focus();
    closeTriggerRef.current = null;
  }

  function handleFilterChange(value: string) {
    const next = nextStationListQueryOnFilterChange(
      query,
      value === "ACTIVE" || value === "CLOSED" ? value : "",
    );
    setQuery(next);
    void loadStations(next);
  }

  function goToPage(page: number) {
    const next = { ...query, page };
    setQuery(next);
    void loadStations(next);
  }

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

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
            Check-in stations
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {eventTitle}
          </p>
          <p className="text-xs text-zinc-500">
            {startLabel}
            {timezone ? ` · ${timezone}` : ""}
          </p>
        </header>

        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Stations are administrative sessions for this event. They are not yet
          attached to check-in actions.
        </p>

        {feedback ? (
          <p
            id={feedbackId}
            role="status"
            aria-live="polite"
            className={`rounded-md border px-3 py-2 text-sm ${feedbackClass(feedback.tone)}`}
          >
            {feedback.message}
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={handleOpenSubmit} noValidate>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Open a station
          </h2>

          <div className="space-y-1">
            <label
              htmlFor={nameId}
              className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
            >
              Station name
            </label>
            <input
              id={nameId}
              name="name"
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              disabled={openPending}
              maxLength={80}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={
                fieldErrors.name
                  ? `${nameHelpId} ${nameErrorId}`
                  : nameHelpId
              }
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              autoComplete="off"
            />
            <p id={nameHelpId} className="text-xs text-zinc-500">
              Required. Up to 80 characters. Active names must be unique for
              this event.
            </p>
            {fieldErrors.name ? (
              <p
                id={nameErrorId}
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {fieldErrors.name}
              </p>
            ) : null}
          </div>

          <div className="space-y-1">
            <label
              htmlFor={deviceId}
              className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
            >
              Device label{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id={deviceId}
              name="deviceLabel"
              value={form.deviceLabel}
              onChange={(event) =>
                updateForm("deviceLabel", event.target.value)
              }
              disabled={openPending}
              maxLength={80}
              aria-invalid={Boolean(fieldErrors.deviceLabel)}
              aria-describedby={
                fieldErrors.deviceLabel
                  ? `${deviceHelpId} ${deviceErrorId}`
                  : deviceHelpId
              }
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              autoComplete="off"
            />
            <p id={deviceHelpId} className="text-xs text-zinc-500">
              Optional friendly label for the device or desk. Do not enter
              serial numbers or device identifiers.
            </p>
            {fieldErrors.deviceLabel ? (
              <p
                id={deviceErrorId}
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {fieldErrors.deviceLabel}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={openPending}
            aria-busy={openPending}
            aria-describedby={feedback ? feedbackId : undefined}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {openPending ? "Opening…" : "Open station"}
          </button>
        </form>
      </section>

      <section
        aria-labelledby={`${headingId}-list`}
        className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        aria-busy={listLoading}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2
            id={`${headingId}-list`}
            className="text-sm font-semibold text-zinc-800 dark:text-zinc-200"
          >
            Stations
          </h2>
          <div className="space-y-1">
            <label
              htmlFor={filterId}
              className="block text-xs font-medium text-zinc-600 dark:text-zinc-300"
            >
              Status filter
            </label>
            <select
              id={filterId}
              value={query.status ?? ""}
              onChange={(event) => handleFilterChange(event.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
        </div>

        {listError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {listError}
          </p>
        ) : null}

        {listLoading ? (
          <p role="status" className="text-sm text-zinc-500">
            Loading stations…
          </p>
        ) : null}

        {!listLoading && !listError && stations.length === 0 ? (
          <p role="status" className="text-sm text-zinc-500">
            No stations match this filter.
          </p>
        ) : null}

        {!listLoading && stations.length > 0 ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {stations.map((station) => {
              const isClosing = closingStationId === station.id;
              return (
                <li
                  key={station.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {station.name}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(station.status)}`}
                      >
                        {stationStatusLabel(station.status)}
                      </span>
                    </div>
                    {station.deviceLabel ? (
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">
                        Device: {station.deviceLabel}
                      </p>
                    ) : null}
                    <dl className="grid gap-1 text-xs text-zinc-500 sm:grid-cols-3">
                      <div>
                        <dt className="inline">Opened: </dt>
                        <dd className="inline">
                          {formatStationDateTime(station.openedAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Closed: </dt>
                        <dd className="inline">
                          {formatStationDateTime(station.closedAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Last activity: </dt>
                        <dd className="inline">
                          {formatStationDateTime(station.lastActivityAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  {station.status === "ACTIVE" ? (
                    <button
                      type="button"
                      aria-label={closeStationButtonLabel(station.name)}
                      disabled={
                        Boolean(closingStationId) || Boolean(confirmStation)
                      }
                      onClick={(event) =>
                        requestClose(station, event.currentTarget)
                      }
                      className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
                    >
                      {isClosing ? "Closing…" : "Close"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {!listLoading && total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600 dark:text-zinc-300">
            <p>
              Page {query.page} of {totalPages} · {total} stations
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={query.page <= 1 || listLoading}
                onClick={() => goToPage(query.page - 1)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 disabled:opacity-50 dark:border-zinc-700"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={query.page >= totalPages || listLoading}
                onClick={() => goToPage(query.page + 1)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 disabled:opacity-50 dark:border-zinc-700"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {confirmStation ? (
        <ConfirmCloseDialog
          stationName={confirmStation.name}
          isPending={closingStationId === confirmStation.id}
          onCancel={cancelClose}
          onConfirm={() => void confirmClose()}
        />
      ) : null}
    </div>
  );
}
