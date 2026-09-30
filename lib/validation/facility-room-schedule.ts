import { formatVolunteerEventWhen } from "@/lib/validation/volunteer-service-schedule";

export const FACILITY_ROOM_SCHEDULE_WINDOW_DAYS = 30;

export const FACILITY_ROOM_SCHEDULE_ACTIVE_EVENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
] as const;

export type FacilityRoomScheduleEventStatus =
  (typeof FACILITY_ROOM_SCHEDULE_ACTIVE_EVENT_STATUSES)[number];

export const FACILITY_ROOM_SCHEDULE_STATUS_LABELS: Record<
  FacilityRoomScheduleEventStatus,
  string
> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

export const FACILITY_ROOM_SCHEDULE_HREF = "/facilities/rooms";
export const FACILITY_ROOM_SCHEDULE_CALENDAR_HREF = "/events/calendar";
export const FACILITY_ROOM_SCHEDULE_CONFLICTS_HREF =
  "/events/location-conflicts";

export const FACILITY_ROOM_SCHEDULE_NOTICE =
  "See which church rooms and locations are scheduled during the next 30 days.";

export const FACILITY_ROOM_SCHEDULE_EMPTY_LOCATION_COPY =
  "No events scheduled in the next 30 days.";

export const FACILITY_ROOM_SCHEDULE_EVENT_FIELDS = [
  "id",
  "title",
  "startLabel",
  "endLabel",
  "whenLabel",
  "isAllDay",
  "status",
  "statusLabel",
  "href",
] as const;

export const FACILITY_ROOM_SCHEDULE_LOCATION_FIELDS = [
  "id",
  "name",
  "roomName",
  "capacity",
  "isOnline",
  "placeLabel",
  "events",
] as const;

export const FACILITY_ROOM_SCHEDULE_COUNT_FIELDS = [
  "activeLocations",
  "locationsWithUpcomingEvents",
  "eventsInWindow",
] as const;

export type FacilityRoomScheduleEvent = {
  id: string;
  title: string;
  startLabel: string;
  endLabel: string;
  whenLabel: string;
  isAllDay: boolean;
  status: FacilityRoomScheduleEventStatus;
  statusLabel: string;
  href: string;
};

export type FacilityRoomScheduleLocation = {
  id: string;
  name: string;
  roomName: string | null;
  capacity: number | null;
  isOnline: boolean;
  placeLabel: "On-site" | "Online";
  events: FacilityRoomScheduleEvent[];
};

export type FacilityRoomScheduleCounts = {
  activeLocations: number;
  locationsWithUpcomingEvents: number;
  eventsInWindow: number;
};

export function facilityRoomScheduleWindow(now: Date) {
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(
    windowEnd.getUTCDate() + FACILITY_ROOM_SCHEDULE_WINDOW_DAYS,
  );
  return { windowStart, windowEnd };
}

export function facilityRoomScheduleEventWhere(
  organizationId: string,
  locationIds: string[],
  now: Date,
) {
  const { windowStart, windowEnd } = facilityRoomScheduleWindow(now);
  return {
    organizationId,
    locationId: { in: locationIds },
    eventStatus: { in: [...FACILITY_ROOM_SCHEDULE_ACTIVE_EVENT_STATUSES] },
    cancelledAt: null,
    archivedAt: null,
    startDateTime: { gte: windowStart, lt: windowEnd },
  };
}

export function facilityRoomScheduleEventHref(eventId: string) {
  return `/events/${eventId}`;
}

export function formatFacilityRoomScheduleWhen(input: {
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
}) {
  return formatVolunteerEventWhen(input);
}

export function formatFacilityRoomScheduleInstant(
  value: Date,
  timezone: string,
  isAllDay: boolean,
) {
  if (isAllDay) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: timezone,
    }).format(value);
  }
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(value);
}
