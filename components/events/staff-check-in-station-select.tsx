"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  listAllActiveCheckInStations,
  mapCheckInStationFailureMessage,
} from "@/lib/api/check-in-station-client";
import {
  reconcileStationSelection,
  STAFF_CHECK_IN_NO_STATION_VALUE,
  stationOptionLabel,
  toSelectableCheckInStations,
  type SelectableCheckInStation,
} from "@/lib/events/staff-check-in-station-selection";

/**
 * Remount with a new `key` when eventId or refreshToken changes so loading
 * state resets without setState-in-effect cascades.
 */
export function StaffCheckInStationSelect({
  eventId,
  value,
  onChange,
  disabled,
  error,
  onStationsLoaded,
}: {
  eventId: string;
  value: string;
  onChange: (stationId: string) => void;
  disabled?: boolean;
  error?: string | null;
  onStationsLoaded?: (stations: SelectableCheckInStation[]) => void;
}) {
  const selectId = useId();
  const helpId = useId();
  const errorId = useId();
  const statusId = useId();
  const onChangeRef = useRef(onChange);
  const onLoadedRef = useRef(onStationsLoaded);
  const valueRef = useRef(value);

  const [stations, setStations] = useState<SelectableCheckInStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    onLoadedRef.current = onStationsLoaded;
    valueRef.current = value;
  }, [onChange, onStationsLoaded, value]);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const result = await listAllActiveCheckInStations({
        eventId,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      if (!result.ok) {
        setStations([]);
        setListError(mapCheckInStationFailureMessage(result));
        setLoading(false);
        onChangeRef.current(STAFF_CHECK_IN_NO_STATION_VALUE);
        onLoadedRef.current?.([]);
        return;
      }

      const next = toSelectableCheckInStations(result.stations);
      const reconciled = reconcileStationSelection(valueRef.current, next);
      setStations(next);
      setListError(null);
      setLoading(false);
      if (reconciled.clearedStale) {
        onChangeRef.current(STAFF_CHECK_IN_NO_STATION_VALUE);
        setStaleNotice(
          "The previously selected station is no longer available. Choose another station or continue without one.",
        );
      }
      onLoadedRef.current?.(next);
    })();

    return () => {
      controller.abort();
    };
  }, [eventId]);

  function handleChange(next: string) {
    onChange(next);
    setStaleNotice(null);
  }

  const statusMessage = loading
    ? "Loading active stations…"
    : listError
      ? null
      : stations.length === 0
        ? "No active stations for this event. You can still check in without a station."
        : null;

  return (
    <div className="space-y-1">
      <label
        htmlFor={selectId}
        className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
      >
        Check-in station{" "}
        <span className="font-normal text-zinc-500">(optional)</span>
      </label>
      <select
        id={selectId}
        value={value || STAFF_CHECK_IN_NO_STATION_VALUE}
        onChange={(event) => handleChange(event.target.value)}
        disabled={disabled || loading}
        aria-invalid={Boolean(error || staleNotice)}
        aria-describedby={[
          helpId,
          statusId,
          error || staleNotice ? errorId : null,
        ]
          .filter(Boolean)
          .join(" ")}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      >
        <option value={STAFF_CHECK_IN_NO_STATION_VALUE}>No station</option>
        {stations.map((station) => (
          <option key={station.id} value={station.id}>
            {stationOptionLabel(station)}
          </option>
        ))}
      </select>
      <p id={helpId} className="text-xs text-zinc-500">
        Optional. Active stations for this event only. Selection is not saved
        after you leave this screen.
      </p>
      <p id={statusId} role="status" className="text-xs text-zinc-500">
        {statusMessage}
      </p>
      {listError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {listError}
        </p>
      ) : null}
      {error || staleNotice ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {error || staleNotice}
        </p>
      ) : null}
    </div>
  );
}
