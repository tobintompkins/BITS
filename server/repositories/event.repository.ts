import type {
  EventOrganizerRole,
  EventStatus,
  EventVisibility,
  Prisma,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { slugifyEventTitle } from "@/lib/events/recurrence";
import { countCapacityUsed } from "@/server/repositories/event-registration.repository";

const DEFAULT_PAGE_SIZE = 25;

const categorySelect = {
  id: true,
  name: true,
  color: true,
  icon: true,
  isActive: true,
} satisfies Prisma.EventCategorySelect;

const locationSelect = {
  id: true,
  name: true,
  roomName: true,
  isOnline: true,
  capacity: true,
  city: true,
  state: true,
} satisfies Prisma.EventLocationSelect;

const organizerSelect = {
  id: true,
  userId: true,
  memberId: true,
  organizerName: true,
  organizerEmail: true,
  organizerPhone: true,
  role: true,
  isPrimary: true,
  user: { select: { id: true, displayName: true, primaryEmail: true } },
  member: {
    select: { id: true, firstName: true, lastName: true, preferredName: true },
  },
} satisfies Prisma.EventOrganizerSelect;

const ministryLinkSelect = {
  id: true,
  ministryId: true,
  isPrimary: true,
  notes: true,
  ministry: { select: { id: true, name: true, ministryType: true } },
} satisfies Prisma.EventMinistrySelect;

const eventDirectorySelect = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  eventStatus: true,
  visibility: true,
  startDateTime: true,
  endDateTime: true,
  timezone: true,
  isAllDay: true,
  registrationRequired: true,
  registrationCapacity: true,
  registrationOpenDate: true,
  registrationCloseDate: true,
  isRecurring: true,
  parentEventId: true,
  featuredImageUrl: true,
  category: { select: categorySelect },
  location: { select: locationSelect },
  _count: { select: { organizers: true, ministries: true } },
} satisfies Prisma.EventSelect;

const eventDetailInclude = {
  category: true,
  location: true,
  organizers: { select: organizerSelect, orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
  ministries: { select: ministryLinkSelect, orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
  createdBy: { select: { id: true, displayName: true, primaryEmail: true } },
  updatedBy: { select: { id: true, displayName: true, primaryEmail: true } },
  parentEvent: { select: { id: true, title: true, slug: true } },
  _count: { select: { occurrences: true, attendances: true, organizers: true } },
} satisfies Prisma.EventInclude;

export type EventListFilters = {
  search?: string;
  status?: EventStatus | EventStatus[];
  categoryId?: string;
  locationId?: string;
  visibility?: EventVisibility | EventVisibility[];
  registrationRequired?: boolean;
  registrationOpen?: boolean;
  ministryId?: string;
  organizerUserId?: string;
  upcomingOnly?: boolean;
  pastOnly?: boolean;
  startFrom?: Date;
  startTo?: Date;
  parentEventId?: string | null;
  excludeArchived?: boolean;
  page?: number;
  pageSize?: number;
  sort?: "startAsc" | "startDesc" | "titleAsc";
};

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date = new Date()) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function buildEventWhere(
  organizationId: string,
  filters: EventListFilters = {},
): Prisma.EventWhereInput {
  const now = new Date();
  const and: Prisma.EventWhereInput[] = [{ organizationId }];

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { shortDescription: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { category: { name: { contains: q, mode: "insensitive" } } },
        { location: { name: { contains: q, mode: "insensitive" } } },
        {
          organizers: {
            some: {
              OR: [
                { organizerName: { contains: q, mode: "insensitive" } },
                { organizerEmail: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        },
        {
          ministries: {
            some: { ministry: { name: { contains: q, mode: "insensitive" } } },
          },
        },
      ],
    });
  }

  if (filters.status) {
    and.push({
      eventStatus: Array.isArray(filters.status)
        ? { in: filters.status }
        : filters.status,
    });
  } else if (filters.excludeArchived) {
    and.push({ eventStatus: { not: "ARCHIVED" } });
  }

  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.locationId) and.push({ locationId: filters.locationId });
  if (filters.visibility) {
    and.push({
      visibility: Array.isArray(filters.visibility)
        ? { in: filters.visibility }
        : filters.visibility,
    });
  }
  if (filters.registrationRequired !== undefined) {
    and.push({ registrationRequired: filters.registrationRequired });
  }
  if (filters.registrationOpen) {
    and.push({
      registrationRequired: true,
      eventStatus: "PUBLISHED",
      OR: [
        { registrationOpenDate: null },
        { registrationOpenDate: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { registrationCloseDate: null },
            { registrationCloseDate: { gte: now } },
          ],
        },
      ],
    });
  }
  if (filters.ministryId) {
    and.push({ ministries: { some: { ministryId: filters.ministryId } } });
  }
  if (filters.organizerUserId) {
    and.push({ organizers: { some: { userId: filters.organizerUserId } } });
  }
  if (filters.upcomingOnly) {
    and.push({ startDateTime: { gte: now } });
  }
  if (filters.pastOnly) {
    and.push({ endDateTime: { lt: now } });
  }
  if (filters.startFrom || filters.startTo) {
    and.push({
      startDateTime: {
        ...(filters.startFrom ? { gte: filters.startFrom } : {}),
        ...(filters.startTo ? { lte: filters.startTo } : {}),
      },
    });
  }
  if (filters.parentEventId !== undefined) {
    and.push(
      filters.parentEventId === null
        ? { parentEventId: null }
        : { parentEventId: filters.parentEventId },
    );
  }

  return { AND: and };
}

function orderBy(
  sort?: EventListFilters["sort"],
): Prisma.EventOrderByWithRelationInput[] {
  if (sort === "titleAsc") return [{ title: "asc" }, { startDateTime: "asc" }];
  if (sort === "startDesc") return [{ startDateTime: "desc" }, { title: "asc" }];
  return [{ startDateTime: "asc" }, { title: "asc" }];
}

export async function findEvents(
  organizationId: string,
  filters: EventListFilters = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE));
  const where = buildEventWhere(organizationId, filters);

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      select: eventDirectorySelect,
      orderBy: orderBy(filters.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.event.count({ where }),
  ]);

  return { events, total, page, pageSize };
}

export async function findCalendarEvents(
  organizationId: string,
  filters: EventListFilters & { startFrom: Date; startTo: Date },
) {
  const where = buildEventWhere(organizationId, {
    ...filters,
    page: undefined,
    pageSize: undefined,
  });

  return prisma.event.findMany({
    where,
    select: {
      ...eventDirectorySelect,
      description: false,
    },
    orderBy: [{ startDateTime: "asc" }, { title: "asc" }],
    take: 500,
  });
}

export async function findEventById(organizationId: string, id: string) {
  return prisma.event.findFirst({
    where: { id, organizationId },
    include: eventDetailInclude,
  });
}

export async function findEventBySlug(organizationId: string, slug: string) {
  return prisma.event.findFirst({
    where: { organizationId, slug },
    include: eventDetailInclude,
  });
}

export async function findEventLean(organizationId: string, id: string) {
  return prisma.event.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      title: true,
      slug: true,
      eventStatus: true,
      visibility: true,
      startDateTime: true,
      endDateTime: true,
      timezone: true,
      isAllDay: true,
      isRecurring: true,
      recurrenceRule: true,
      recurrenceEndDate: true,
      parentEventId: true,
      featuredImageUrl: true,
      featuredImageKey: true,
      registrationRequired: true,
      registrationCapacity: true,
      categoryId: true,
      locationId: true,
      organizationId: true,
      createdByUserId: true,
    },
  });
}

export async function ensureUniqueEventSlug(
  organizationId: string,
  titleOrSlug: string,
  excludeEventId?: string,
) {
  const base = slugifyEventTitle(titleOrSlug);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await prisma.event.findFirst({
      where: {
        organizationId,
        slug: candidate,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
    if (suffix > 500) {
      candidate = `${base}-${Date.now()}`;
      break;
    }
  }
  return candidate;
}

export async function createEventRecord(
  data: Prisma.EventUncheckedCreateInput,
  organizers: Array<{
    userId?: string | null;
    memberId?: string | null;
    organizerName?: string | null;
    organizerEmail?: string | null;
    organizerPhone?: string | null;
    role: EventOrganizerRole;
    isPrimary: boolean;
  }>,
  ministries: Array<{
    ministryId: string;
    isPrimary: boolean;
    notes?: string | null;
  }>,
) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({ data });

    if (organizers.length > 0) {
      await tx.eventOrganizer.createMany({
        data: organizers.map((o) => ({
          eventId: event.id,
          userId: o.userId ?? null,
          memberId: o.memberId ?? null,
          organizerName: o.organizerName ?? null,
          organizerEmail: o.organizerEmail ?? null,
          organizerPhone: o.organizerPhone ?? null,
          role: o.role,
          isPrimary: o.isPrimary,
        })),
      });
    }

    if (ministries.length > 0) {
      await tx.eventMinistry.createMany({
        data: ministries.map((m) => ({
          eventId: event.id,
          ministryId: m.ministryId,
          isPrimary: m.isPrimary,
          notes: m.notes ?? null,
        })),
      });
    }

    return tx.event.findFirstOrThrow({
      where: { id: event.id },
      include: eventDetailInclude,
    });
  });
}

export async function updateEventRecord(
  id: string,
  organizationId: string,
  data: Prisma.EventUncheckedUpdateInput,
) {
  const result = await prisma.event.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Event not found.");
  return findEventById(organizationId, id);
}

export async function replaceEventOrganizers(
  eventId: string,
  organizers: Array<{
    userId?: string | null;
    memberId?: string | null;
    organizerName?: string | null;
    organizerEmail?: string | null;
    organizerPhone?: string | null;
    role: EventOrganizerRole;
    isPrimary: boolean;
  }>,
) {
  await prisma.$transaction(async (tx) => {
    await tx.eventOrganizer.deleteMany({ where: { eventId } });
    if (organizers.length > 0) {
      await tx.eventOrganizer.createMany({
        data: organizers.map((o) => ({
          eventId,
          userId: o.userId ?? null,
          memberId: o.memberId ?? null,
          organizerName: o.organizerName ?? null,
          organizerEmail: o.organizerEmail ?? null,
          organizerPhone: o.organizerPhone ?? null,
          role: o.role,
          isPrimary: o.isPrimary,
        })),
      });
    }
  });
}

export async function replaceEventMinistries(
  eventId: string,
  ministries: Array<{
    ministryId: string;
    isPrimary: boolean;
    notes?: string | null;
  }>,
) {
  await prisma.$transaction(async (tx) => {
    await tx.eventMinistry.deleteMany({ where: { eventId } });
    if (ministries.length > 0) {
      await tx.eventMinistry.createMany({
        data: ministries.map((m) => ({
          eventId,
          ministryId: m.ministryId,
          isPrimary: m.isPrimary,
          notes: m.notes ?? null,
        })),
      });
    }
  });
}

export async function deleteEventRecord(id: string, organizationId: string) {
  const result = await prisma.event.deleteMany({
    where: { id, organizationId },
  });
  if (result.count === 0) throw new Error("Event not found.");
}

export async function findOccurrenceStartTimes(
  organizationId: string,
  parentEventId: string,
) {
  const rows = await prisma.event.findMany({
    where: { organizationId, parentEventId },
    select: { startDateTime: true },
  });
  return new Set(rows.map((r) => r.startDateTime.toISOString()));
}

export async function createOccurrenceEvents(
  parent: {
    id: string;
    organizationId: string;
    title: string;
    slug: string;
    description: string | null;
    shortDescription: string | null;
    categoryId: string | null;
    locationId: string | null;
    eventStatus: EventStatus;
    visibility: EventVisibility;
    timezone: string;
    isAllDay: boolean;
    registrationRequired: boolean;
    registrationOpenDate: Date | null;
    registrationCloseDate: Date | null;
    registrationCapacity: number | null;
    waitlistEnabled: boolean;
    registrationFee: Prisma.Decimal | null;
    registrationInstructions: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    featuredImageUrl: string | null;
    featuredImageKey: string | null;
    createdByUserId: string;
  },
  occurrences: Array<{ start: Date; end: Date }>,
  existingStarts: Set<string>,
) {
  const toCreate = occurrences.filter(
    (o) => !existingStarts.has(o.start.toISOString()),
  );
  if (toCreate.length === 0) return [];

  const createdIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < toCreate.length; i += 1) {
      const occ = toCreate[i];
      const slug = `${parent.slug}-occ-${occ.start.toISOString().slice(0, 10)}-${i + 1}`;
      const uniqueSlug = await ensureUniqueSlugInTx(
        tx,
        parent.organizationId,
        slug,
      );
      const created = await tx.event.create({
        data: {
          organizationId: parent.organizationId,
          title: parent.title,
          slug: uniqueSlug,
          description: parent.description,
          shortDescription: parent.shortDescription,
          categoryId: parent.categoryId,
          locationId: parent.locationId,
          eventStatus: parent.eventStatus,
          visibility: parent.visibility,
          startDateTime: occ.start,
          endDateTime: occ.end,
          timezone: parent.timezone,
          isAllDay: parent.isAllDay,
          registrationRequired: parent.registrationRequired,
          registrationOpenDate: parent.registrationOpenDate,
          registrationCloseDate: parent.registrationCloseDate,
          registrationCapacity: parent.registrationCapacity,
          waitlistEnabled: parent.waitlistEnabled,
          registrationFee: parent.registrationFee,
          registrationInstructions: parent.registrationInstructions,
          contactName: parent.contactName,
          contactEmail: parent.contactEmail,
          contactPhone: parent.contactPhone,
          featuredImageUrl: parent.featuredImageUrl,
          featuredImageKey: parent.featuredImageKey,
          isRecurring: false,
          recurrenceRule: null,
          parentEventId: parent.id,
          createdByUserId: parent.createdByUserId,
          publishedAt: parent.eventStatus === "PUBLISHED" ? new Date() : null,
        },
      });
      createdIds.push(created.id);
    }
  });

  return createdIds;
}

async function ensureUniqueSlugInTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  baseSlug: string,
) {
  const base = slugifyEventTitle(baseSlug);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await tx.event.findFirst({
      where: { organizationId, slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function findFutureOccurrences(
  organizationId: string,
  parentEventId: string,
  from: Date,
) {
  return prisma.event.findMany({
    where: {
      organizationId,
      parentEventId,
      startDateTime: { gte: from },
    },
    select: { id: true, startDateTime: true, eventStatus: true },
    orderBy: { startDateTime: "asc" },
  });
}

export async function cancelOccurrences(
  organizationId: string,
  ids: string[],
  cancelledAt: Date,
) {
  if (ids.length === 0) return;
  await prisma.event.updateMany({
    where: { organizationId, id: { in: ids } },
    data: {
      eventStatus: "CANCELLED",
      cancelledAt,
    },
  });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function findEventCategories(
  organizationId: string,
  options?: { activeOnly?: boolean },
) {
  return prisma.eventCategory.findMany({
    where: {
      organizationId,
      ...(options?.activeOnly ? { isActive: true } : {}),
    },
    include: { _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });
}

export async function findEventCategoryById(
  organizationId: string,
  id: string,
) {
  return prisma.eventCategory.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { events: true } } },
  });
}

export async function createEventCategory(
  data: Prisma.EventCategoryUncheckedCreateInput,
) {
  return prisma.eventCategory.create({ data });
}

export async function updateEventCategory(
  id: string,
  organizationId: string,
  data: Prisma.EventCategoryUncheckedUpdateInput,
) {
  const result = await prisma.eventCategory.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Category not found.");
  return findEventCategoryById(organizationId, id);
}

export async function deleteEventCategory(id: string, organizationId: string) {
  const category = await findEventCategoryById(organizationId, id);
  if (!category) throw new Error("Category not found.");
  if (category._count.events > 0) {
    throw new Error(
      "Cannot delete a category that is linked to events. Deactivate it instead.",
    );
  }
  await prisma.eventCategory.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export async function findEventLocations(
  organizationId: string,
  options?: { activeOnly?: boolean },
) {
  return prisma.eventLocation.findMany({
    where: {
      organizationId,
      ...(options?.activeOnly ? { isActive: true } : {}),
    },
    include: { _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });
}

export async function findEventLocationById(
  organizationId: string,
  id: string,
) {
  return prisma.eventLocation.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { events: true } } },
  });
}

export async function createEventLocation(
  data: Prisma.EventLocationUncheckedCreateInput,
) {
  return prisma.eventLocation.create({ data });
}

export async function updateEventLocation(
  id: string,
  organizationId: string,
  data: Prisma.EventLocationUncheckedUpdateInput,
) {
  const result = await prisma.eventLocation.updateMany({
    where: { id, organizationId },
    data,
  });
  if (result.count === 0) throw new Error("Location not found.");
  return findEventLocationById(organizationId, id);
}

export async function deleteEventLocation(id: string, organizationId: string) {
  const location = await findEventLocationById(organizationId, id);
  if (!location) throw new Error("Location not found.");
  if (location._count.events > 0) {
    throw new Error(
      "Cannot delete a location that is linked to events. Deactivate it instead.",
    );
  }
  await prisma.eventLocation.delete({ where: { id } });
}

export async function assertCategoryInOrg(
  organizationId: string,
  categoryId: string | null | undefined,
) {
  if (!categoryId) return;
  const row = await prisma.eventCategory.findFirst({
    where: { id: categoryId, organizationId },
    select: { id: true },
  });
  if (!row) throw new Error("Category not found in this organization.");
}

export async function assertLocationInOrg(
  organizationId: string,
  locationId: string | null | undefined,
) {
  if (!locationId) return;
  const row = await prisma.eventLocation.findFirst({
    where: { id: locationId, organizationId },
    select: { id: true },
  });
  if (!row) throw new Error("Location not found in this organization.");
}

export async function assertMinistriesInOrg(
  organizationId: string,
  ministryIds: string[],
) {
  if (ministryIds.length === 0) return;
  const count = await prisma.ministry.count({
    where: { organizationId, id: { in: ministryIds } },
  });
  if (count !== ministryIds.length) {
    throw new Error("One or more ministries are not in this organization.");
  }
}

export async function getEventDashboardCounts(organizationId: string) {
  const now = new Date();
  const weekEnd = endOfWeek(now);
  const weekStart = startOfWeek(now);

  const [
    upcoming,
    thisWeek,
    drafts,
    registrationOpen,
    cancelled,
    withoutOrganizers,
    nearCapacityCandidates,
  ] = await Promise.all([
    prisma.event.count({
      where: {
        organizationId,
        eventStatus: "PUBLISHED",
        startDateTime: { gte: now },
        parentEventId: null,
      },
    }),
    prisma.event.count({
      where: {
        organizationId,
        eventStatus: "PUBLISHED",
        startDateTime: { gte: weekStart, lte: weekEnd },
      },
    }),
    prisma.event.count({
      where: { organizationId, eventStatus: "DRAFT", parentEventId: null },
    }),
    prisma.event.count({
      where: {
        organizationId,
        registrationRequired: true,
        eventStatus: "PUBLISHED",
        OR: [
          { registrationOpenDate: null },
          { registrationOpenDate: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { registrationCloseDate: null },
              { registrationCloseDate: { gte: now } },
            ],
          },
        ],
      },
    }),
    prisma.event.count({
      where: { organizationId, eventStatus: "CANCELLED" },
    }),
    prisma.event.count({
      where: {
        organizationId,
        eventStatus: { in: ["DRAFT", "PUBLISHED"] },
        parentEventId: null,
        organizers: { none: {} },
      },
    }),
    prisma.event.findMany({
      where: {
        organizationId,
        eventStatus: "PUBLISHED",
        startDateTime: { gte: now },
        OR: [
          { registrationRequired: true, registrationCapacity: { not: null } },
          {
            registrationSettings: {
              isEnabled: true,
              capacity: { not: null },
            },
          },
        ],
      },
      select: {
        id: true,
        registrationCapacity: true,
        registrationSettings: { select: { capacity: true, isEnabled: true } },
      },
      take: 200,
    }),
  ]);

  let nearCapacity = 0;
  for (const event of nearCapacityCandidates) {
    const capacity =
      event.registrationSettings?.capacity ?? event.registrationCapacity ?? 0;
    if (capacity <= 0) continue;
    const used = await countCapacityUsed(organizationId, event.id);
    if (used / capacity >= 0.8) nearCapacity += 1;
  }

  return {
    upcoming,
    thisWeek,
    drafts,
    registrationOpen,
    cancelled,
    withoutOrganizers,
    nearCapacity,
  };
}

export async function findMinistriesForSelect(organizationId: string) {
  return prisma.ministry.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function findStaffUsersForSelect(organizationId: string) {
  return prisma.userAccount.findMany({
    where: {
      memberships: { some: { organizationId, active: true } },
    },
    select: { id: true, displayName: true, primaryEmail: true },
    orderBy: { displayName: "asc" },
    take: 200,
  });
}

export async function findMembersForSelect(organizationId: string) {
  return prisma.member.findMany({
    where: { organizationId, recordStatus: "ACTIVE" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      email: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 300,
  });
}

export async function findEventAuditHistory(
  organizationId: string,
  eventId: string,
) {
  return prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType: "Event",
      entityId: eventId,
    },
    include: {
      actor: {
        select: { displayName: true, primaryEmail: true },
      },
    },
    orderBy: { occurredAt: "desc" },
    take: 30,
  });
}
