import { getEventAccess } from "@/lib/auth/event-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  FACILITY_ROOM_SCHEDULE_STATUS_LABELS,
  FACILITY_ROOM_SCHEDULE_WINDOW_DAYS,
  facilityRoomScheduleEventHref,
  facilityRoomScheduleEventWhere,
  formatFacilityRoomScheduleInstant,
  formatFacilityRoomScheduleWhen,
  type FacilityRoomScheduleCounts,
  type FacilityRoomScheduleEvent,
  type FacilityRoomScheduleEventStatus,
  type FacilityRoomScheduleLocation,
} from "@/lib/validation/facility-room-schedule";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type FacilityRoomScheduleView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | {
      status: "READY";
      windowDays: number;
      counts: FacilityRoomScheduleCounts;
      locations: FacilityRoomScheduleLocation[];
    };

const locationSelect = {
  id: true,
  name: true,
  roomName: true,
  capacity: true,
  isOnline: true,
} as const;

const eventSelect = {
  id: true,
  title: true,
  startDateTime: true,
  endDateTime: true,
  timezone: true,
  isAllDay: true,
  eventStatus: true,
  locationId: true,
} as const;

function toEvent(row: {
  id: string;
  title: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
  eventStatus: FacilityRoomScheduleEventStatus;
}): FacilityRoomScheduleEvent {
  return {
    id: row.id,
    title: row.title,
    startLabel: formatFacilityRoomScheduleInstant(
      row.startDateTime,
      row.timezone,
      row.isAllDay,
    ),
    endLabel: formatFacilityRoomScheduleInstant(
      row.endDateTime,
      row.timezone,
      row.isAllDay,
    ),
    whenLabel: formatFacilityRoomScheduleWhen(row),
    isAllDay: row.isAllDay,
    status: row.eventStatus,
    statusLabel: FACILITY_ROOM_SCHEDULE_STATUS_LABELS[row.eventStatus],
    href: facilityRoomScheduleEventHref(row.id),
  };
}

/**
 * Read-only facility and room schedule for authorized event viewers.
 * Organization is resolved server-side. This never mutates rooms or events.
 */
export async function getFacilityRoomSchedule(
  now = new Date(),
): Promise<FacilityRoomScheduleView> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const access = await getEventAccess(organization.id);
  if (!access.canView) return { status: "UNAUTHORIZED" };

  const locations = await prisma.eventLocation.findMany({
    where: {
      organizationId: organization.id,
      isActive: true,
    },
    orderBy: { name: "asc" },
    select: locationSelect,
  });

  const locationIds = locations.map((location) => location.id);
  const events =
    locationIds.length === 0
      ? []
      : await prisma.event.findMany({
          where: facilityRoomScheduleEventWhere(
            organization.id,
            locationIds,
            now,
          ),
          orderBy: [{ startDateTime: "asc" }, { title: "asc" }],
          select: eventSelect,
        });

  const eventsByLocation = new Map<string, FacilityRoomScheduleEvent[]>();
  for (const event of events) {
    if (!event.locationId) continue;
    if (!locationIds.includes(event.locationId)) continue;
    if (event.eventStatus !== "DRAFT" && event.eventStatus !== "PUBLISHED") {
      continue;
    }
    const list = eventsByLocation.get(event.locationId) ?? [];
    list.push(
      toEvent({
        ...event,
        eventStatus: event.eventStatus,
      }),
    );
    eventsByLocation.set(event.locationId, list);
  }

  const cards: FacilityRoomScheduleLocation[] = locations.map((location) => ({
    id: location.id,
    name: location.name,
    roomName: location.roomName,
    capacity: location.capacity,
    isOnline: location.isOnline,
    placeLabel: location.isOnline ? "Online" : "On-site",
    events: eventsByLocation.get(location.id) ?? [],
  }));

  return {
    status: "READY",
    windowDays: FACILITY_ROOM_SCHEDULE_WINDOW_DAYS,
    counts: {
      activeLocations: cards.length,
      locationsWithUpcomingEvents: cards.filter(
        (location) => location.events.length > 0,
      ).length,
      eventsInWindow: cards.reduce(
        (sum, location) => sum + location.events.length,
        0,
      ),
    },
    locations: cards,
  };
}
