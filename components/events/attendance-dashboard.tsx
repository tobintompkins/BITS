"use client";

import { useEffect, useState, useTransition } from "react";

import {
  checkOutAction,
  correctAttendanceAction,
  exportAttendanceAction,
  finalizeNoShowsAction,
  getLiveSummaryAction,
  listAttendanceAction,
} from "@/app/(staff)/events/check-in-actions";
import {
  eventAttendanceStatusOptions,
  formatCheckInEnumLabel,
} from "@/lib/constants/event-check-in";

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
  const [reason, setReason] = useState("");

  function load() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("eventId", eventId);
      formData.set("query", query);
      formData.set("status", status);
      formData.set("page", "1");
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
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return (
    <div className={`space-y-4 ${isPending ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-zinc-500">{total} record(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.canExportAttendance ? (
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
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
              Export CSV
            </button>
          ) : null}
          {access.canCorrectAttendance ? (
            <button
              type="button"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
              onClick={() =>
                startTransition(async () => {
                  const result = await finalizeNoShowsAction(eventId);
                  setMessage(result.message);
                  load();
                })
              }
            >
              Finalize no-shows
            </button>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(summary).map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <p className="text-xs text-zinc-500">{key}</p>
              <p className="font-semibold">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {message ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
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
        <button
          type="button"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
          onClick={load}
        >
          Apply
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No attendance records yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Attendee</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Station</th>
                <th className="px-3 py-2">Last in</th>
                <th className="px-3 py-2">Actions</th>
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
                    <td className="px-3 py-2">{row.source}</td>
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
                            className="text-xs underline"
                            onClick={() =>
                              startTransition(async () => {
                                const formData = new FormData();
                                formData.set("eventId", eventId);
                                formData.set("attendanceId", row.id);
                                const result = await checkOutAction(formData);
                                setMessage(result.message);
                                load();
                              })
                            }
                          >
                            Check out
                          </button>
                        ) : null}
                        {access.canCorrectAttendance ? (
                          <button
                            type="button"
                            className="text-xs underline"
                            onClick={() => setCorrectId(row.id)}
                          >
                            Correct
                          </button>
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

      {correctId ? (
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Correct attendance</h2>
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
                  setCorrectId(null);
                  setReason("");
                  load();
                }
              });
            }}
          >
            <select
              name="status"
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {eventAttendanceStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <textarea
              name="reason"
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for correction (required)"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Save correction
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                onClick={() => setCorrectId(null)}
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
