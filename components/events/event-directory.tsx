"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  archiveEventAction,
  cancelEventAction,
  duplicateEventAction,
  publishEventAction,
} from "@/app/(staff)/events/actions";
import {
  EventStatusBadge,
  EventVisibilityBadge,
  RegistrationBadge,
} from "@/components/events/event-badges";
import {
  eventStatusOptions,
  eventVisibilityOptions,
} from "@/lib/constants/events";

type EventRow = {
  id: string;
  title: string;
  eventStatus: string;
  visibility: string;
  startDateTime: Date | string;
  endDateTime: Date | string;
  timezone: string;
  isAllDay: boolean;
  registrationRequired: boolean;
  registrationCapacity: number | null;
  isRecurring: boolean;
  category: { id: string; name: string; color: string | null } | null;
  location: { id: string; name: string; isOnline: boolean } | null;
};

type Option = { id: string; name: string };

type Access = {
  canCreate: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canCancel: boolean;
  canArchive: boolean;
};

type SummaryCounts = {
  upcoming: number;
  thisWeek: number;
  drafts: number;
  registrationOpen: number;
  cancelled: number;
};

function formatWhen(event: EventRow) {
  const start = new Date(event.startDateTime);
  if (event.isAllDay) {
    return start.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventDirectory({
  events,
  total,
  page,
  pageSize,
  counts,
  categories,
  locations,
  access,
}: {
  events: EventRow[];
  total: number;
  page: number;
  pageSize: number;
  counts: SummaryCounts;
  categories: Option[];
  locations: Option[];
  access: Access;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const locationId = searchParams.get("locationId") ?? "";
  const visibility = searchParams.get("visibility") ?? "";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function updateFilters(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    if (!("page" in next)) params.delete("page");
    startTransition(() => {
      router.push(`/events?${params.toString()}`);
    });
  }

  function runAction(action: () => Promise<{ status: string; message: string; id?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.status === "success" && result.id) {
        router.push(`/events/${result.id}`);
      }
      router.refresh();
    });
  }

  const cards = [
    { label: "Upcoming Events", count: counts.upcoming, href: "/events?upcomingOnly=1" },
    { label: "Events This Week", count: counts.thisWeek, href: "/events/calendar" },
    { label: "Draft Events", count: counts.drafts, href: "/events?status=DRAFT" },
    { label: "Registration Open", count: counts.registrationOpen, href: "/events?registrationOpen=1" },
    { label: "Cancelled Events", count: counts.cancelled, href: "/events?status=CANCELLED" },
  ];

  return (
    <div className={`space-y-6 ${isPending ? "opacity-70" : ""}`}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Events
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Directory of church events, drafts, and registration settings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/events/calendar"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Calendar View
          </Link>
          {access.canCreate ? (
            <Link
              href="/events/new"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Add Event
            </Link>
          ) : null}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {card.count}
            </p>
          </Link>
        ))}
      </section>

      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="block text-sm xl:col-span-2">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Search</span>
          <input
            type="search"
            defaultValue={search}
            placeholder="Title, category, location…"
            onChange={(e) => updateFilters({ search: e.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Status</span>
          <select
            value={status}
            onChange={(e) => updateFilters({ status: e.target.value })}
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
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Category</span>
          <select
            value={categoryId}
            onChange={(e) => updateFilters({ categoryId: e.target.value })}
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
            onChange={(e) => updateFilters({ locationId: e.target.value })}
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
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Visibility</span>
          <select
            value={visibility}
            onChange={(e) => updateFilters({ visibility: e.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {eventVisibilityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            No events found
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Adjust filters or create a new event.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Date and Time</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Registration</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className={`border-b border-zinc-100 dark:border-zinc-800 ${
                    event.eventStatus === "CANCELLED" ? "opacity-70" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/events/${event.id}`}
                      className={`font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100 ${
                        event.eventStatus === "CANCELLED" ? "line-through" : ""
                      }`}
                    >
                      {event.title}
                    </Link>
                    {event.isRecurring ? (
                      <span className="ml-2 text-xs text-zinc-500">Recurring</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {event.category?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {formatWhen(event)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {event.location?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <EventStatusBadge status={event.eventStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <EventVisibilityBadge visibility={event.visibility} />
                  </td>
                  <td className="px-4 py-3">
                    <RegistrationBadge
                      required={event.registrationRequired}
                      capacity={event.registrationCapacity}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Link href={`/events/${event.id}`} className="underline-offset-4 hover:underline">
                        View
                      </Link>
                      {access.canEdit ? (
                        <Link
                          href={`/events/${event.id}/edit`}
                          className="underline-offset-4 hover:underline"
                        >
                          Edit
                        </Link>
                      ) : null}
                      {access.canCreate ? (
                        <button
                          type="button"
                          className="underline-offset-4 hover:underline"
                          onClick={() =>
                            runAction(() => duplicateEventAction(event.id))
                          }
                        >
                          Duplicate
                        </button>
                      ) : null}
                      {access.canPublish && event.eventStatus === "DRAFT" ? (
                        <button
                          type="button"
                          className="underline-offset-4 hover:underline"
                          onClick={() =>
                            runAction(() => publishEventAction(event.id))
                          }
                        >
                          Publish
                        </button>
                      ) : null}
                      {access.canCancel &&
                      event.eventStatus !== "CANCELLED" &&
                      event.eventStatus !== "ARCHIVED" ? (
                        <button
                          type="button"
                          className="underline-offset-4 hover:underline"
                          onClick={() =>
                            runAction(() => cancelEventAction(event.id))
                          }
                        >
                          Cancel
                        </button>
                      ) : null}
                      {access.canArchive && event.eventStatus !== "ARCHIVED" ? (
                        <button
                          type="button"
                          className="underline-offset-4 hover:underline"
                          onClick={() =>
                            runAction(() => archiveEventAction(event.id))
                          }
                        >
                          Archive
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300">
          <p>
            Page {page} of {totalPages} · {total} events
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => updateFilters({ page: String(page - 1) })}
              className="rounded-md border border-zinc-300 px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => updateFilters({ page: String(page + 1) })}
              className="rounded-md border border-zinc-300 px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
