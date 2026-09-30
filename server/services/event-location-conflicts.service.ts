import { getEventAccess } from "@/lib/auth/event-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  EVENT_LOCATION_CONFLICT_REVIEW_WINDOW_DAYS,
  eventLocationConflictHref,
  eventLocationConflictReviewWhere,
  eventTimesOverlap,
  formatEventLocationConflictWhen,
  type EventLocationConflictPair,
} from "@/lib/validation/event-location-conflicts";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type EventLocationConflictsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | {
      status: "READY";
      windowDays: number;
      pairs: EventLocationConflictPair[];
    };

const eventSelect = {
  id: true,
  title: true,
  startDateTime: true,
  endDateTime: true,
  timezone: true,
  isAllDay: true,
  locationId: true,
  location: {
    select: {
      id: true,
      name: true,
      organizationId: true,
    },
  },
} as const;

type LoadedEvent = {
  id: string;
  title: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
  locationId: string;
  locationName: string;
};

function toSummary(event: LoadedEvent) {
  return {
    id: event.id,
    title: event.title,
    whenLabel: formatEventLocationConflictWhen(event),
    href: eventLocationConflictHref(event.id),
  };
}

/**
 * Read-only location overlap review for authorized event viewers.
 * Organization is resolved server-side. This never mutates events.
 */
export async function getEventLocationConflicts(
  now = new Date(),
): Promise<EventLocationConflictsView> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const access = await getEventAccess(organization.id);
  if (!access.canView) return { status: "UNAUTHORIZED" };

  const records = await prisma.event.findMany({
    where: eventLocationConflictReviewWhere(organization.id, now),
    orderBy: [{ startDateTime: "asc" }, { title: "asc" }],
    select: eventSelect,
  });

  const usable: LoadedEvent[] = [];
  for (const event of records) {
    if (!event.locationId || !event.location) continue;
    if (event.location.organizationId !== organization.id) continue;
    if (event.location.id !== event.locationId) continue;
    if (event.startDateTime.getTime() >= event.endDateTime.getTime()) continue;
    usable.push({
      id: event.id,
      title: event.title,
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      timezone: event.timezone,
      isAllDay: event.isAllDay,
      locationId: event.locationId,
      locationName: event.location.name,
    });
  }

  const byLocation = new Map<string, LoadedEvent[]>();
  for (const event of usable) {
    const list = byLocation.get(event.locationId) ?? [];
    list.push(event);
    byLocation.set(event.locationId, list);
  }

  const found: Array<{ first: LoadedEvent; second: LoadedEvent }> = [];
  for (const events of byLocation.values()) {
    const ordered = [...events].sort((left, right) => {
      const startDiff =
        left.startDateTime.getTime() - right.startDateTime.getTime();
      if (startDiff !== 0) return startDiff;
      return left.id.localeCompare(right.id);
    });

    for (let i = 0; i < ordered.length; i += 1) {
      const first = ordered[i]!;
      for (let j = i + 1; j < ordered.length; j += 1) {
        const second = ordered[j]!;
        if (second.startDateTime.getTime() >= first.endDateTime.getTime()) {
          break;
        }
        if (first.id === second.id) continue;
        if (!eventTimesOverlap(first, second)) continue;
        found.push({ first, second });
      }
    }
  }

  found.sort((left, right) => {
    const startDiff =
      left.first.startDateTime.getTime() - right.first.startDateTime.getTime();
    if (startDiff !== 0) return startDiff;
    const locationDiff = left.first.locationName.localeCompare(
      right.first.locationName,
    );
    if (locationDiff !== 0) return locationDiff;
    return left.first.title.localeCompare(right.first.title);
  });

  const pairs: EventLocationConflictPair[] = found.map(({ first, second }) => ({
    locationId: first.locationId,
    locationName: first.locationName,
    first: toSummary(first),
    second: toSummary(second),
  }));

  return {
    status: "READY",
    windowDays: EVENT_LOCATION_CONFLICT_REVIEW_WINDOW_DAYS,
    pairs,
  };
}
