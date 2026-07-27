import { redirect } from "next/navigation";
import type { EventStatus } from "@/app/generated/prisma/client";

import {
  getCalendarEvents,
  getEventAccess,
  getEventCategories,
  getEventFormOptions,
  getEventLocations,
} from "@/app/(staff)/events/actions";
import { EventCalendar } from "@/components/events/event-calendar";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PageProps = {
  searchParams: Promise<{
    view?: string;
    date?: string;
    search?: string;
    status?: string;
    categoryId?: string;
    locationId?: string;
    ministryId?: string;
  }>;
};

function parseAnchor(value?: string) {
  if (!value) return new Date();
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function rangeForView(view: string, anchor: Date) {
  if (view === "day") {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(anchor);
    end.setHours(23, 59, 59, 999);
    return { startFrom: start, startTo: end };
  }
  if (view === "week" || view === "agenda") {
    const day = anchor.getDay();
    const start = new Date(anchor);
    start.setDate(anchor.getDate() + (day === 0 ? -6 : 1 - day));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + (view === "agenda" ? 30 : 6));
    end.setHours(23, 59, 59, 999);
    return { startFrom: start, startTo: end };
  }
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  // Include leading/trailing week days for month grid
  const gridStart = new Date(start);
  const startDay = gridStart.getDay();
  gridStart.setDate(gridStart.getDate() + (startDay === 0 ? -6 : 1 - startDay));
  const end = new Date(gridStart);
  end.setDate(gridStart.getDate() + 41);
  end.setHours(23, 59, 59, 999);
  return { startFrom: gridStart, startTo: end };
}

export default async function EventsCalendarPage({ searchParams }: PageProps) {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getEventAccess(organization.id);
  if (!access.canView) redirect("/dashboard");

  const params = await searchParams;
  const view = params.view || "month";
  const anchor = parseAnchor(params.date);
  const range = rangeForView(view, anchor);

  const [calendar, categories, locations, options] = await Promise.all([
    getCalendarEvents({
      ...range,
      search: params.search,
      status: params.status as EventStatus | undefined,
      categoryId: params.categoryId,
      locationId: params.locationId,
      ministryId: params.ministryId,
    }),
    getEventCategories({ activeOnly: true }),
    getEventLocations({ activeOnly: true }),
    getEventFormOptions(),
  ]);

  return (
    <EventCalendar
      events={calendar.events}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      ministries={options.ministries}
      canCreate={access.canCreate}
    />
  );
}
