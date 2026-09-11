"use client";

import { useEffect, useState, useTransition } from "react";

import {
  correctAttendanceAction,
  exportAttendanceAction,
  finalizeNoShowsAction,
  getLiveSummaryAction,
  listAttendanceAction,
} from "@/app/(staff)/events/check-in-actions";
import { submitStaffAttendanceTransition } from "@/lib/api/staff-check-out-client";
import {
  eventAttendanceSourceOptions,
  eventAttendanceStatusOptions,
  formatCheckInEnumLabel,
} from "@/lib/constants/event-check-in";

const PAGE_SIZE = 25;

const summaryCards = [
  { key: "expected", label: "Expected", accent: "border-l-sky-500" },
  { key: "present", label: "Present Now", accent: "border-l-emerald-600" },
  { key: "checkedOut", label: "Checked Out", accent: "border-l-amber-500" },
  { key: "noShow", label: "No-Shows", accent: "border-l-rose-500" },
  { key: "walkIns", label: "Walk-In Guests", accent: "border-l-[var(--bits-gold)]" },
  {
    key: "totalCheckedInPeople",
    label: "Total Attended",
    accent: "border-l-[var(--bits-navy)]",
  },
] as const;

type Access = {
  canExportAttendance: boolean;
  canCorrectAttendance: boolean;
  canOperateCheckIn: boolean;
};

export function AttendanceDashboard({
  eventId,
  access,
}: {
  eventId: string;
  access: Access;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [rows, setRows] = useState<
    Array<{
      id: string;
      status: string;
      source: string;
      checkInCount: number;
      firstCheckedInAt: Date | string | null;
      lastCheckedInAt: Date | string | null;
      checkedOutAt: Date | string | null;
      attendee: {
        id: string;
        firstName: string;
        lastName: string;
        isGuest: boolean;
        memberId: string | null;
      } | null;
      walkInFirstName: string | null;
      walkInLastName: string | null;
      registration: { confirmationCode: string } | null;
      station: { name: string } | null;
    }>
  >([]);
  const [total, setTotal] = useState(0);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState("EXPECTED");
  const [reason, setReason] = useState("");

  function getAttendanceName(row: (typeof rows)[number]) {
    return row.attendee
      ? `${row.attendee.firstName} ${row.attendee.lastName}`
      : `${row.walkInFirstName ?? ""} ${row.walkInLastName ?? ""}`.trim() ||
          "Walk-in guest";
  }

  function openCorrection(
    attendanceId: string,
    nextStatus: string,
    defaultReason = "",
  ) {
    setCorrectId(attendanceId);
    setCorrectionStatus(nextStatus);
    setReason(defaultReason);
  }

  function closeCorrection() {
    setCorrectId(null);
    setCorrectionStatus("EXPECTED");
    setReason("");
  }

  function load(requestedPage = page) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("eventId", eventId);
      formData.set("query", query);
      formData.set("status", status);
      formData.set("source", source);
      formData.set("page", String(requestedPage));
      formData.set("pageSize", String(PAGE_SIZE));
      const [list, live] = await Promise.all([
        listAttendanceAction(formData),
        getLiveSummaryAction(eventId),
      ]);
      setSummary(live);
      if (list.status === "success") {
        setRows(list.items as typeof rows);
        setTotal(list.total);
        setPage(list.page);
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(page * PAGE_SIZE, total);

  return (
    <div className={`space-y-4 ${isPending ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">
            Event reporting
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--bits-navy)] dark:text-zinc-100">
            Attendance Dashboard
          </h1>
          <p className="text-sm text-zinc-500">
            Live totals, attendee records, corrections, and export
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.canExportAttendance ? (
            <button
              type="button"
              disabled={isPending}
              className="rounded-md bg-[var(--bits-navy)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() =>
                startTransition(async () => {
                  const result = await exportAttendanceAction(eventId);
                  if (result.status !== "success" || !("csv" in result) || !result.csv) {
                    setMessage(result.message ?? "Export failed.");
                    return;
                  }
                  const blob = new Blob([result.csv], {
                    type: "text/csv;charset=utf-8",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = result.filename ?? "attendance.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                  setMessage("Attendance CSV downloaded.");
                })
              }
            >
              {isPending ? "Preparing…" : "Download Attendance CSV"}
            </button>
          ) : null}
          {access.canCorrectAttendance ? (
            <button
              type="button"
              disabled={isPending}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700"
              onClick={() =>
                startTransition(async () => {
                  const confirmed = window.confirm(
                    "Finalize no-shows for every eligible person who did not check in? You can correct an individual record afterward if needed.",
                  );
                  if (!confirmed) return;
                  const result = await finalizeNoShowsAction(eventId);
                  setMessage(result.message);
                  load();
                })
              }
            >
              Finalize All No-Shows
            </button>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {summaryCards.map((card) => (
            <div
              key={card.key}
              className={`rounded-lg border border-l-4 border-zinc-200 bg-white px-3 py-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${card.accent}`}
            >
              <p className="text-xs font-medium text-zinc-500">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--bits-navy)] dark:text-zinc-100">
                {summary[card.key] ?? 0}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          {message}
        </p>
      ) : null}

      <form
        className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] dark:border-zinc-800 dark:bg-zinc-900"
        onSubmit={(event) => {
          event.preventDefault();
          load(1);
        }}
      >
        <label htmlFor="attendance-search" className="sr-only">
          Search attendance by name or confirmation code
        </label>
        <input
          id="attendance-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or confirmation code"
          className="min-w-[14rem] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {eventAttendanceStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          aria-label="Filter by check-in source"
        >
          <option value="">All sources</option>
          {eventAttendanceSourceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-[var(--bits-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Apply Filters
        </button>
        <button
          type="button"
          disabled={isPending || (!query && !status && !source)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-zinc-700"
          onClick={() => {
            setQuery("");
            setStatus("");
            setSource("");
            setPage(1);
            startTransition(async () => {
              const formData = new FormData();
              formData.set("eventId", eventId);
              formData.set("page", "1");
              formData.set("pageSize", String(PAGE_SIZE));
              const [list, live] = await Promise.all([
                listAttendanceAction(formData),
                getLiveSummaryAction(eventId),
              ]);
              setSummary(live);
              if (list.status === "success") {
                setRows(list.items as typeof rows);
                setTotal(list.total);
              }
            });
          }}
        >
          Clear
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No attendance records yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">
              Event attendance records and staff actions
            </caption>
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th scope="col" className="px-3 py-2">Attendee</th>
                <th scope="col" className="px-3 py-2">Code</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">Source</th>
                <th scope="col" className="px-3 py-2">Station</th>
                <th scope="col" className="px-3 py-2">Last in</th>
                <th scope="col" className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const name = row.attendee
                  ? `${row.attendee.lastName}, ${row.attendee.firstName}`
                  : `${row.walkInLastName ?? ""}, ${row.walkInFirstName ?? ""}`;
                return (
                  <tr
                    key={row.id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="px-3 py-2">{name}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.registration?.confirmationCode ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {formatCheckInEnumLabel(
                        eventAttendanceStatusOptions,
                        row.status,
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {formatCheckInEnumLabel(
                        eventAttendanceSourceOptions,
                        row.source,
                      )}
                    </td>
                    <td className="px-3 py-2">{row.station?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.lastCheckedInAt
                        ? new Date(row.lastCheckedInAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {access.canOperateCheckIn && row.status === "PRESENT" ? (
                          <button
                            type="button"
                            disabled={isPending || !row.attendee}
                            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            onClick={() =>
                              startTransition(async () => {
                                if (!row.attendee) return;
                                const result =
                                  await submitStaffAttendanceTransition({
                                    action: "check-out",
                                    eventId,
                                    attendeeId: row.attendee.id,
                                  });
                                setMessage(
                                  result.ok
                                    ? result.data.outcome === "ALREADY_CHECKED_OUT"
                                      ? "This attendee was already checked out."
                                      : "Attendee checked out."
                                    : result.message,
                                );
                                load();
                              })
                            }
                          >
                            Check out
                          </button>
                        ) : null}
                        {access.canOperateCheckIn &&
                        row.status === "CHECKED_OUT" &&
                        row.attendee ? (
                          <button
                            type="button"
                            disabled={isPending}
                            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            onClick={() =>
                              startTransition(async () => {
                                if (!row.attendee) return;
                                const result =
                                  await submitStaffAttendanceTransition({
                                    action: "re-entry",
                                    eventId,
                                    attendeeId: row.attendee.id,
                                  });
                                setMessage(
                                  result.ok
                                    ? result.data.outcome === "ALREADY_PRESENT"
                                      ? "This attendee was already present."
                                      : "Attendee re-entered."
                                    : result.message,
                                );
                                load();
                              })
                            }
                          >
                            Re-enter
                          </button>
                        ) : null}
                        {access.canCorrectAttendance ? (
                          <>
                            {row.status !== "EXPECTED" ? (
                              <button
                                type="button"
                                disabled={isPending}
                                className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
                                onClick={() =>
                                  openCorrection(
                                    row.id,
                                    "EXPECTED",
                                    "Undo the previous attendance action",
                                  )
                                }
                              >
                                Undo
                              </button>
                            ) : null}
                            {row.status !== "NO_SHOW" ? (
                              <button
                                type="button"
                                disabled={isPending}
                                className="rounded-md border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300"
                                onClick={() =>
                                  openCorrection(
                                    row.id,
                                    "NO_SHOW",
                                    "Attendee did not attend this event",
                                  )
                                }
                              >
                                Mark No-Show
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={isPending}
                              className="text-xs underline disabled:opacity-50"
                              onClick={() =>
                                openCorrection(row.id, row.status)
                              }
                            >
                              Correct
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-zinc-500">
            Showing {firstResult}–{lastResult} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPending || page <= 1}
              className="rounded-md border border-zinc-300 px-3 py-2 disabled:opacity-40 dark:border-zinc-700"
              onClick={() => load(page - 1)}
            >
              Previous
            </button>
            <span className="min-w-24 text-center">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={isPending || page >= totalPages}
              className="rounded-md border border-zinc-300 px-3 py-2 disabled:opacity-40 dark:border-zinc-700"
              onClick={() => load(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {correctId ? (
        <div
          className="rounded-xl border border-[var(--bits-gold)] bg-amber-50/40 p-4 dark:bg-zinc-900"
          aria-labelledby="attendance-correction-title"
        >
          <h2
            id="attendance-correction-title"
            className="text-base font-semibold text-[var(--bits-navy)] dark:text-zinc-100"
          >
            Correct attendance
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {getAttendanceName(
              rows.find((row) => row.id === correctId) ?? rows[0],
            )}
          </p>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              formData.set("eventId", eventId);
              formData.set("attendanceId", correctId);
              startTransition(async () => {
                const result = await correctAttendanceAction(formData);
                setMessage(result.message);
                if (result.status === "success") {
                  closeCorrection();
                  load();
                }
              });
            }}
          >
            <label className="block space-y-1">
              <span className="text-sm font-medium">Correct status</span>
            <select
              name="status"
              required
              value={correctionStatus}
              onChange={(event) => setCorrectionStatus(event.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {eventAttendanceStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Reason for this change
              </span>
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              placeholder="Explain why this attendance record is changing"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-[var(--bits-navy)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {isPending ? "Saving…" : "Save Correction"}
              </button>
              <button
                type="button"
                disabled={isPending}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                onClick={closeCorrection}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
