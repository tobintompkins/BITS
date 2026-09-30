import { formatVolunteerEventWhen } from "@/lib/validation/volunteer-service-schedule";

export const EVENT_LOCATION_CONFLICT_REVIEW_WINDOW_DAYS = 90;

export const EVENT_LOCATION_CONFLICT_ACTIVE_STATUSES = [
  "DRAFT",
  "PUBLISHED",
] as const;

export const EVENT_LOCATION_CONFLICTS_HREF = "/events/location-conflicts";
export const EVENT_LOCATION_CONFLICTS_CALENDAR_HREF = "/events/calendar";

export const EVENT_LOCATION_CONFLICTS_NOTICE =
  "This list highlights events scheduled in the same location at overlapping times. It does not change either event.";

export const EVENT_LOCATION_CONFLICTS_WINDOW_COPY =
  "Reviewing the next 90 days.";

export const EVENT_LOCATION_CONFLICTS_EMPTY_COPY =
  "No overlapping location bookings were found in this review window.";

export const EVENT_LOCATION_CONFLICT_EVENT_FIELDS = [
  "id",
  "title",
  "whenLabel",
  "href",
] as const;

export const EVENT_LOCATION_CONFLICT_PAIR_FIELDS = [
  "locationId",
  "locationName",
  "first",
  "second",
] as const;

export type EventLocationConflictEvent = {
  id: string;
  title: string;
  whenLabel: string;
  href: string;
};

export type EventLocationConflictPair = {
  locationId: string;
  locationName: string;
  first: EventLocationConflictEvent;
  second: EventLocationConflictEvent;
};

export function eventLocationConflictReviewWindow(now: Date) {
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(
    windowEnd.getUTCDate() + EVENT_LOCATION_CONFLICT_REVIEW_WINDOW_DAYS,
  );
  return { windowStart, windowEnd };
}

export function eventLocationConflictReviewWhere(
  organizationId: string,
  now: Date,
) {
  const { windowStart, windowEnd } = eventLocationConflictReviewWindow(now);
  return {
    organizationId,
    locationId: { not: null },
    eventStatus: { in: [...EVENT_LOCATION_CONFLICT_ACTIVE_STATUSES] },
    startDateTime: { lt: windowEnd },
    endDateTime: { gt: windowStart },
  };
}

export function eventTimesOverlap(
  first: { startDateTime: Date; endDateTime: Date },
  second: { startDateTime: Date; endDateTime: Date },
) {
  return (
    first.startDateTime.getTime() < second.endDateTime.getTime() &&
    second.startDateTime.getTime() < first.endDateTime.getTime()
  );
}

export function eventLocationConflictHref(eventId: string) {
  return `/events/${eventId}`;
}

export function formatEventLocationConflictWhen(input: {
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
}) {
  return formatVolunteerEventWhen(input);
}
