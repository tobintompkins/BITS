"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

import { EventStatusBadge } from "@/components/events/event-badges";
import { eventStatusOptions } from "@/lib/constants/events";

type CalendarEvent = {
  id: string;
  title: string;
  eventStatus: string;
  visibility: string;
  startDateTime: Date | string;
  endDateTime: Date | string;
  isAllDay: boolean;
  category: { id: string; name: string; color: string | null } | null;
  location: { id: string; name: string } | null;
};

type Option = { id: string; name: string };

type ViewMode = "month" | "week" | "day" | "agenda";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  return addDays(d, day === 0 ? -6 : 1 - day);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseAnchor(value: string | null) {
  if (!value) return startOfDay(new Date());
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? startOfDay(new Date()) : parsed;
}

function toDateParam(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function EventCalendar({
  events,
  categories,
  locations,
  ministries,
  canCreate,
}: {
  events: CalendarEvent[];
  categories: Option[];
  locations: Option[];
  ministries: Option[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const view = (searchParams.get("view") as ViewMode) || "month";
  const anchor = parseAnchor(searchParams.get("date"));
  const categoryId = searchParams.get("categoryId") ?? "";
  const locationId = searchParams.get("locationId") ?? "";
  const ministryId = searchParams.get("ministryId") ?? "";
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";

  function update(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    startTransition(() => {
      router.push(`/events/calendar?${params.toString()}`);
    });
  }

  const rangeLabel = useMemo(() => {
    if (view === "day") {
      return anchor.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    if (view === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    }
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [anchor, view]);

  function shift(delta: number) {
    let next = anchor;
    if (view === "day" || view === "agenda") next = addDays(anchor, delta);
    else if (view === "week") next = addDays(anchor, delta * 7);
    else next = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    update({ date: toDateParam(next) });
  }

  const monthCells = useMemo(() => {
    const monthStart = startOfMonth(anchor);
    const gridStart = startOfWeek(monthStart);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [anchor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  function eventsOn(day: Date) {
    return events.filter((event) => sameDay(new Date(event.startDateTime), day));
  }

  function EventChip({ event }: { event: CalendarEvent }) {
    const cancelled = event.eventStatus === "CANCELLED";
    return (
      <Link
        href={`/events/${event.id}`}
        className={`block truncate rounded px-1.5 py-0.5 text-xs ${
          cancelled
            ? "bg-red-100 text-red-800 line-through dark:bg-red-950 dark:text-red-200"
            : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        }`}
        title={event.title}
      >
        {event.title}
      </Link>
    );
  }

  return (
    <div className={`space-y-6 ${isPending ? "opacity-70" : ""}`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Calendar
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{rangeLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => update({ date: toDateParam(new Date()) })}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Next
          </button>
          {canCreate ? (
            <Link
              href="/events/new"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Add Event
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {(["month", "week", "day", "agenda"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => update({ view: mode })}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${
              view === mode
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-sm lg:col-span-2">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Search</span>
          <input
            type="search"
            defaultValue={search}
            onChange={(e) => update({ search: e.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Category</span>
          <select
            value={categoryId}
            onChange={(e) => update({ categoryId: e.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Location</span>
          <select
            value={locationId}
            onChange={(e) => update({ locationId: e.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Status</span>
          <select
            value={status}
            onChange={(e) => update({ status: e.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {eventStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2 lg:col-span-1">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Ministry</span>
          <select
            value={ministryId}
            onChange={(e) => update({ ministryId: e.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {ministries.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {view === "month" ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid min-w-[640px] grid-cols-7 border-b border-zinc-200 text-center text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid min-w-[640px] grid-cols-7">
            {monthCells.map((day) => {
              const inMonth = day.getMonth() === anchor.getMonth();
              const dayEvents = eventsOn(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-24 border-b border-r border-zinc-100 p-2 dark:border-zinc-800 ${
                    inMonth ? "" : "bg-zinc-50 dark:bg-zinc-950/40"
                  }`}
                >
                  <p
                    className={`text-xs ${
                      sameDay(day, new Date())
                        ? "font-semibold text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-500"
                    }`}
                  >
                    {day.getDate()}
                  </p>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <EventChip key={event.id} event={event} />
                    ))}
                    {dayEvents.length > 3 ? (
                      <p className="text-[10px] text-zinc-500">
                        +{dayEvents.length - 3} more
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "week" ? (
        <div className="grid gap-3 md:grid-cols-7">
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="text-xs font-medium uppercase text-zinc-500">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </p>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {day.getDate()}
              </p>
              <div className="mt-2 space-y-1">
                {eventsOn(day).map((event) => (
                  <EventChip key={event.id} event={event} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {view === "day" ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-3">
            {eventsOn(anchor).length === 0 ? (
              <p className="text-sm text-zinc-500">No events this day.</p>
            ) : (
              eventsOn(anchor).map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className={`flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800 ${
                    event.eventStatus === "CANCELLED" ? "opacity-70" : ""
                  }`}
                >
                  <div>
                    <p
                      className={`font-medium text-zinc-900 dark:text-zinc-100 ${
                        event.eventStatus === "CANCELLED" ? "line-through" : ""
                      }`}
                    >
                      {event.title}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {event.location?.name ?? "No location"} ·{" "}
                      {event.category?.name ?? "Uncategorized"}
                    </p>
                  </div>
                  <EventStatusBadge status={event.eventStatus} />
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}

      {view === "agenda" ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                    No events in this range.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr
                    key={event.id}
                    className={`border-b border-zinc-100 dark:border-zinc-800 ${
                      event.eventStatus === "CANCELLED" ? "opacity-70" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {new Date(event.startDateTime).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/events/${event.id}`}
                        className={`font-medium underline-offset-4 hover:underline ${
                          event.eventStatus === "CANCELLED" ? "line-through" : ""
                        }`}
                      >
                        {event.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {event.location?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <EventStatusBadge status={event.eventStatus} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
