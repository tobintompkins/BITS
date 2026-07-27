import type {
  EventOrganizerRole,
  EventStatus,
  EventVisibility,
} from "@/app/generated/prisma/client";
import {
  canViewEventVisibility,
  getEventAccess,
  requireEventPermission,
  type EventAccess,
} from "@/lib/auth/event-permissions";
import { EVENT_OCCURRENCE_WINDOW_MONTHS } from "@/lib/constants/events";
import {
  buildRRule,
  generateOccurrences,
  previewOccurrences,
  type RecurrencePreset,
} from "@/lib/events/recurrence";
import {
  removeEventFeaturedImage,
  resolveEventImageAbsolutePath,
  saveEventFeaturedImage,
} from "@/lib/storage/event-image";
import {
  buildSafeAuditChanges,
  combineDateTime,
  type EventCategoryInput,
  type EventInput,
  type EventLocationInput,
  type EventOrganizerInput,
} from "@/lib/validation/events";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  assertCategoryInOrg,
  assertLocationInOrg,
  assertMinistriesInOrg,
  cancelOccurrences,
  createEventCategory,
  createEventLocation,
  createEventRecord,
  createOccurrenceEvents,
  deleteEventCategory,
  deleteEventLocation,
  deleteEventRecord,
  ensureUniqueEventSlug,
  findCalendarEvents,
  findEventAuditHistory,
  findEventById,
  findEventCategories,
  findEventCategoryById,
  findEventLean,
  findEventLocationById,
  findEventLocations,
  findEvents,
  findFutureOccurrences,
  findMembersForSelect,
  findMinistriesForSelect,
  findOccurrenceStartTimes,
  findStaffUsersForSelect,
  getEventDashboardCounts,
  replaceEventMinistries,
  replaceEventOrganizers,
  updateEventCategory,
  updateEventLocation,
  updateEventRecord,
  type EventListFilters,
} from "@/server/repositories/event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type Actor = { userAccountId: string | null; email: string | null };

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new Error("Organization not found.");
  return organization.id;
}

function requireUserId(actor: Actor) {
  if (!actor.userAccountId) {
    throw new Error("A signed-in user account is required.");
  }
  return actor.userAccountId;
}

async function audit(
  organizationId: string,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
) {
  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action,
    entityType,
    entityId,
    changes:
      changes.length > 0
        ? changes
        : [{ field: "actorEmail", oldValue: null, newValue: actor.email }],
  });
}

function filterVisibleEvents<
  T extends { visibility: string; eventStatus: string },
>(access: EventAccess, events: T[]) {
  return events.filter((event) =>
    canViewEventVisibility(access, event.visibility, event.eventStatus),
  );
}

function assertCanViewEvent(
  access: EventAccess,
  event: { visibility: string; eventStatus: string },
) {
  if (!canViewEventVisibility(access, event.visibility, event.eventStatus)) {
    throw new Error("Event not found.");
  }
}

function mapOrganizers(input: EventOrganizerInput[] | undefined) {
  const list = input ?? [];
  return list.map((o, index) => ({
    userId: o.userId ?? null,
    memberId: o.memberId ?? null,
    organizerName: o.organizerName ?? null,
    organizerEmail: o.organizerEmail?.toLowerCase() ?? null,
    organizerPhone: o.organizerPhone ?? null,
    role: (o.role ?? "OTHER") as EventOrganizerRole,
    isPrimary: Boolean(o.isPrimary) || (index === 0 && !list.some((x) => x.isPrimary)),
  }));
}

function mapMinistries(input: EventInput) {
  const ids = input.ministryIds ?? [];
  return ids.map((ministryId) => ({
    ministryId,
    isPrimary: input.primaryMinistryId
      ? ministryId === input.primaryMinistryId
      : ministryId === ids[0],
    notes: null as string | null,
  }));
}

function resolveRecurrenceRule(input: EventInput) {
  if (!input.isRecurring || !input.recurrencePreset || input.recurrencePreset === "NONE") {
    return { rule: null as string | null, endDate: null as Date | null };
  }
  const rule = buildRRule({
    preset: input.recurrencePreset as RecurrencePreset,
    byDay: input.recurrenceByDay,
    interval: input.recurrenceInterval,
    until: input.recurrenceEndDate ? new Date(input.recurrenceEndDate) : null,
    customRule: input.recurrenceCustomRule,
  });
  return {
    rule,
    endDate: input.recurrenceEndDate ? new Date(input.recurrenceEndDate) : null,
  };
}

function toEventDates(input: EventInput) {
  const start = combineDateTime(
    input.startDate,
    input.isAllDay ? "00:00" : input.startTime,
  );
  const end = combineDateTime(
    input.endDate,
    input.isAllDay ? "23:59" : input.endTime,
  );
  if (!start || !end) throw new Error("Invalid start or end date/time.");
  return { start, end };
}

function parseOptionalDate(value?: string) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventPayloadFromInput(
  organizationId: string,
  input: EventInput,
  actorUserId: string,
  slug: string,
  options?: { publishNow?: boolean; updatedByUserId?: string },
) {
  const { start, end } = toEventDates(input);
  const { rule, endDate } = resolveRecurrenceRule(input);
  const publishNow = Boolean(options?.publishNow ?? input.publishNow);
  const status: EventStatus = publishNow
    ? "PUBLISHED"
    : ((input.eventStatus as EventStatus) ?? "DRAFT");

  return {
    organizationId,
    title: input.title.trim(),
    slug,
    description: input.description ?? null,
    shortDescription: input.shortDescription ?? null,
    categoryId: input.categoryId ?? null,
    locationId: input.locationId ?? null,
    eventStatus: status,
    visibility: (input.visibility as EventVisibility) ?? "STAFF_ONLY",
    startDateTime: start,
    endDateTime: end,
    timezone: input.timezone,
    isAllDay: Boolean(input.isAllDay),
    registrationRequired: Boolean(input.registrationRequired),
    registrationOpenDate: parseOptionalDate(input.registrationOpenDate),
    registrationCloseDate: parseOptionalDate(input.registrationCloseDate),
    registrationCapacity: input.registrationCapacity ?? null,
    waitlistEnabled: Boolean(input.waitlistEnabled),
    registrationFee: input.registrationFee ?? null,
    registrationInstructions: input.registrationInstructions ?? null,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail?.toLowerCase() ?? null,
    contactPhone: input.contactPhone ?? null,
    isRecurring: Boolean(input.isRecurring && rule),
    recurrenceRule: rule,
    recurrenceEndDate: endDate,
    createdByUserId: actorUserId,
    updatedByUserId: options?.updatedByUserId ?? null,
    publishedAt: status === "PUBLISHED" ? new Date() : null,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getEventAccessForOrg(organizationId?: string) {
  const orgId = organizationId ?? (await getOrganizationId());
  return getEventAccess(orgId);
}

export async function getEvents(filters: EventListFilters = {}) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canView,
    "You do not have permission to view events.",
  );

  const result = await findEvents(organizationId, {
    ...filters,
    excludeArchived: filters.status ? false : true,
  });

  const events = filterVisibleEvents(access, result.events);
  return {
    ...result,
    events,
    // Approximate total after visibility filter on the current page only;
    // full recount would require loading all rows. Directory uses page size 25.
    total: result.total,
    access,
  };
}

export async function getCalendarEvents(filters: {
  startFrom: Date;
  startTo: Date;
  search?: string;
  status?: EventStatus | EventStatus[];
  categoryId?: string;
  locationId?: string;
  ministryId?: string;
}) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canView,
    "You do not have permission to view events.",
  );

  const events = await findCalendarEvents(organizationId, {
    ...filters,
    excludeArchived: !filters.status,
  });

  return {
    events: filterVisibleEvents(access, events),
    access,
  };
}

export async function getEventById(id: string) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canView,
    "You do not have permission to view events.",
  );
  const event = await findEventById(organizationId, id);
  if (!event) throw new Error("Event not found.");
  assertCanViewEvent(access, event);
  const activity = await findEventAuditHistory(organizationId, id);
  return { event, access, activity };
}

export async function getEventFormOptions() {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canView || a.canCreate || a.canEdit,
    "You do not have permission to manage events.",
  );

  const [categories, locations, ministries, staffUsers, members] =
    await Promise.all([
      findEventCategories(organizationId, { activeOnly: true }),
      findEventLocations(organizationId, { activeOnly: true }),
      findMinistriesForSelect(organizationId),
      findStaffUsersForSelect(organizationId),
      findMembersForSelect(organizationId),
    ]);

  return { categories, locations, ministries, staffUsers, members };
}

export async function getEventDirectorySummary() {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canView,
    "You do not have permission to view events.",
  );
  const counts = await getEventDashboardCounts(organizationId);
  return { counts, access };
}

export async function getEventDashboardWidgets() {
  const organizationId = await getOrganizationId();
  const access = await getEventAccess(organizationId);
  if (!access.canView) {
    return { access, widgets: [] as Array<{
      key: string;
      label: string;
      count: number;
      href: string;
    } | null> };
  }

  const counts = await getEventDashboardCounts(organizationId);
  return {
    access,
    widgets: [
      {
        key: "upcomingEvents",
        label: "Upcoming Events",
        count: counts.upcoming,
        href: "/events?upcomingOnly=1",
      },
      {
        key: "eventsThisWeek",
        label: "Events This Week",
        count: counts.thisWeek,
        href: "/events/calendar",
      },
      {
        key: "registrationOpen",
        label: "Registration Open",
        count: counts.registrationOpen,
        href: "/events?registrationOpen=1",
      },
      access.canViewDrafts
        ? {
            key: "draftEvents",
            label: "Draft Events",
            count: counts.drafts,
            href: "/events?status=DRAFT",
          }
        : null,
      {
        key: "eventsWithoutOrganizers",
        label: "Events Without Organizers",
        count: counts.withoutOrganizers,
        href: "/events",
      },
      {
        key: "eventsNearCapacity",
        label: "Events Near Capacity",
        count: counts.nearCapacity,
        href: "/events?registrationRequired=1",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createEvent(input: EventInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canCreate,
    "You do not have permission to create events.",
  );

  if (input.publishNow && !access.canPublish) {
    throw new Error("You do not have permission to publish events.");
  }

  const userId = requireUserId(actor);
  await assertCategoryInOrg(organizationId, input.categoryId);
  await assertLocationInOrg(organizationId, input.locationId);
  await assertMinistriesInOrg(organizationId, input.ministryIds ?? []);

  const slug = await ensureUniqueEventSlug(
    organizationId,
    input.slug || input.title,
  );
  const payload = eventPayloadFromInput(organizationId, input, userId, slug);
  const organizers = mapOrganizers(input.organizers);
  const ministries = mapMinistries(input);

  const event = await createEventRecord(payload, organizers, ministries);

  if (event.isRecurring && event.recurrenceRule) {
    await generateEventOccurrences(event.id, actor, { skipPermission: true });
  }

  await audit(
    organizationId,
    actor,
    "CREATE",
    "Event",
    event.id,
    buildSafeAuditChanges({
      title: event.title,
      slug: event.slug,
      eventStatus: event.eventStatus,
      visibility: event.visibility,
      isRecurring: event.isRecurring,
    }),
  );

  if (event.isRecurring) {
    await audit(
      organizationId,
      actor,
      "RECURRENCE_CREATED",
      "Event",
      event.id,
      buildSafeAuditChanges({ recurrenceRule: event.recurrenceRule }),
    );
  }

  return findEventById(organizationId, event.id);
}

export async function updateEvent(
  id: string,
  input: EventInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canEdit,
    "You do not have permission to edit events.",
  );

  const existing = await findEventById(organizationId, id);
  if (!existing) throw new Error("Event not found.");
  assertCanViewEvent(access, existing);

  const scope = input.recurrenceEditScope ?? "ENTIRE_SERIES";
  if (existing.parentEventId || existing.isRecurring) {
    if (scope === "THIS_OCCURRENCE") {
      return updateSingleOccurrence(existing.id, input, actor, access);
    }
    if (scope === "THIS_AND_FUTURE") {
      // Limitation: update parent rule + regenerate future when editing series parent;
      // when editing an occurrence, update that occurrence and document limitation.
      if (existing.parentEventId) {
        await updateSingleOccurrence(existing.id, input, actor, access);
        await audit(
          organizationId,
          actor,
          "UPDATE",
          "Event",
          existing.id,
          buildSafeAuditChanges({
            recurrenceEditScope: "THIS_AND_FUTURE",
            note: "THIS_AND_FUTURE on an occurrence updates this occurrence only in 7.1; full series split is deferred.",
          }),
        );
        return findEventById(organizationId, existing.id);
      }
      return updateRecurringEvent(existing.id, input, actor, {
        regenerateFuture: true,
      });
    }
  }

  return updateEntireEvent(existing.id, input, actor, access);
}

async function updateSingleOccurrence(
  id: string,
  input: EventInput,
  actor: Actor,
  access: EventAccess,
) {
  const organizationId = await getOrganizationId();
  const userId = requireUserId(actor);
  await assertCategoryInOrg(organizationId, input.categoryId);
  await assertLocationInOrg(organizationId, input.locationId);

  const { start, end } = toEventDates(input);
  const slug = input.slug
    ? await ensureUniqueEventSlug(organizationId, input.slug, id)
    : undefined;

  await updateEventRecord(id, organizationId, {
    title: input.title.trim(),
    ...(slug ? { slug } : {}),
    description: input.description ?? null,
    shortDescription: input.shortDescription ?? null,
    categoryId: input.categoryId ?? null,
    locationId: input.locationId ?? null,
    visibility: input.visibility as EventVisibility,
    startDateTime: start,
    endDateTime: end,
    timezone: input.timezone,
    isAllDay: Boolean(input.isAllDay),
    registrationRequired: Boolean(input.registrationRequired),
    registrationOpenDate: parseOptionalDate(input.registrationOpenDate),
    registrationCloseDate: parseOptionalDate(input.registrationCloseDate),
    registrationCapacity: input.registrationCapacity ?? null,
    waitlistEnabled: Boolean(input.waitlistEnabled),
    registrationFee: input.registrationFee ?? null,
    registrationInstructions: input.registrationInstructions ?? null,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail?.toLowerCase() ?? null,
    contactPhone: input.contactPhone ?? null,
    updatedByUserId: userId,
    // Detach from series schedule changes for this occurrence only
    isRecurring: false,
    recurrenceRule: null,
  });

  if (access.canManageOrganizers) {
    await replaceEventOrganizers(id, mapOrganizers(input.organizers));
  }
  if (access.canManageMinistries) {
    await assertMinistriesInOrg(organizationId, input.ministryIds ?? []);
    await replaceEventMinistries(id, mapMinistries(input));
  }

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "Event",
    id,
    buildSafeAuditChanges({
      title: input.title,
      recurrenceEditScope: "THIS_OCCURRENCE",
    }),
  );

  return findEventById(organizationId, id);
}

async function updateEntireEvent(
  id: string,
  input: EventInput,
  actor: Actor,
  access: EventAccess,
) {
  const organizationId = await getOrganizationId();
  const userId = requireUserId(actor);
  await assertCategoryInOrg(organizationId, input.categoryId);
  await assertLocationInOrg(organizationId, input.locationId);
  await assertMinistriesInOrg(organizationId, input.ministryIds ?? []);

  const existing = await findEventLean(organizationId, id);
  if (!existing) throw new Error("Event not found.");

  const slug = await ensureUniqueEventSlug(
    organizationId,
    input.slug || input.title,
    id,
  );
  const { start, end } = toEventDates(input);
  const { rule, endDate } = resolveRecurrenceRule(input);

  await updateEventRecord(id, organizationId, {
    title: input.title.trim(),
    slug,
    description: input.description ?? null,
    shortDescription: input.shortDescription ?? null,
    categoryId: input.categoryId ?? null,
    locationId: input.locationId ?? null,
    visibility: input.visibility as EventVisibility,
    startDateTime: start,
    endDateTime: end,
    timezone: input.timezone,
    isAllDay: Boolean(input.isAllDay),
    registrationRequired: Boolean(input.registrationRequired),
    registrationOpenDate: parseOptionalDate(input.registrationOpenDate),
    registrationCloseDate: parseOptionalDate(input.registrationCloseDate),
    registrationCapacity: input.registrationCapacity ?? null,
    waitlistEnabled: Boolean(input.waitlistEnabled),
    registrationFee: input.registrationFee ?? null,
    registrationInstructions: input.registrationInstructions ?? null,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail?.toLowerCase() ?? null,
    contactPhone: input.contactPhone ?? null,
    isRecurring: Boolean(input.isRecurring && rule),
    recurrenceRule: rule,
    recurrenceEndDate: endDate,
    updatedByUserId: userId,
  });

  if (access.canManageOrganizers) {
    await replaceEventOrganizers(id, mapOrganizers(input.organizers));
  }
  if (access.canManageMinistries) {
    await replaceEventMinistries(id, mapMinistries(input));
  }

  await audit(
    organizationId,
    actor,
    "UPDATE",
    "Event",
    id,
    buildSafeAuditChanges({
      title: input.title,
      slug,
      visibility: input.visibility,
      isRecurring: Boolean(input.isRecurring && rule),
    }),
  );

  return findEventById(organizationId, id);
}

export async function updateRecurringEvent(
  id: string,
  input: EventInput,
  actor: Actor,
  options?: { regenerateFuture?: boolean },
) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canEdit,
    "You do not have permission to edit events.",
  );
  const updated = await updateEntireEvent(id, input, actor, access);

  if (options?.regenerateFuture && updated?.isRecurring && updated.recurrenceRule) {
    await generateEventOccurrences(id, actor, {
      skipPermission: true,
      fromDate: new Date(),
    });
  }

  await audit(
    organizationId,
    actor,
    "RECURRENCE_UPDATED",
    "Event",
    id,
    buildSafeAuditChanges({
      recurrenceRule: updated?.recurrenceRule,
      regenerateFuture: Boolean(options?.regenerateFuture),
    }),
  );

  return updated;
}

export async function publishEvent(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canPublish,
    "You do not have permission to publish events.",
  );
  const existing = await findEventLean(organizationId, id);
  if (!existing) throw new Error("Event not found.");

  await updateEventRecord(id, organizationId, {
    eventStatus: "PUBLISHED",
    publishedAt: new Date(),
    cancelledAt: null,
    updatedByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    "PUBLISH",
    "Event",
    id,
    buildSafeAuditChanges({ eventStatus: "PUBLISHED" }),
  );

  return findEventById(organizationId, id);
}

export async function cancelEvent(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canCancel,
    "You do not have permission to cancel events.",
  );
  const existing = await findEventLean(organizationId, id);
  if (!existing) throw new Error("Event not found.");

  const cancelledAt = new Date();
  await updateEventRecord(id, organizationId, {
    eventStatus: "CANCELLED",
    cancelledAt,
    updatedByUserId: requireUserId(actor),
  });

  if (existing.isRecurring && !existing.parentEventId) {
    const future = await findFutureOccurrences(organizationId, id, cancelledAt);
    await cancelOccurrences(
      organizationId,
      future.map((f) => f.id),
      cancelledAt,
    );
  }

  await audit(
    organizationId,
    actor,
    "CANCEL",
    "Event",
    id,
    buildSafeAuditChanges({ eventStatus: "CANCELLED" }),
  );

  return findEventById(organizationId, id);
}

export async function cancelEventOccurrence(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canCancel,
    "You do not have permission to cancel events.",
  );
  const existing = await findEventLean(organizationId, id);
  if (!existing) throw new Error("Event not found.");

  await updateEventRecord(id, organizationId, {
    eventStatus: "CANCELLED",
    cancelledAt: new Date(),
    updatedByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    "OCCURRENCE_CANCELLED",
    "Event",
    id,
    buildSafeAuditChanges({ eventStatus: "CANCELLED" }),
  );

  return findEventById(organizationId, id);
}

export async function archiveEvent(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canArchive,
    "You do not have permission to archive events.",
  );
  const existing = await findEventLean(organizationId, id);
  if (!existing) throw new Error("Event not found.");

  await updateEventRecord(id, organizationId, {
    eventStatus: "ARCHIVED",
    archivedAt: new Date(),
    updatedByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    "ARCHIVE",
    "Event",
    id,
    buildSafeAuditChanges({ eventStatus: "ARCHIVED" }),
  );

  return findEventById(organizationId, id);
}

export async function duplicateEvent(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canCreate,
    "You do not have permission to create events.",
  );
  const existing = await findEventById(organizationId, id);
  if (!existing) throw new Error("Event not found.");
  assertCanViewEvent(access, existing);

  const userId = requireUserId(actor);
  const slug = await ensureUniqueEventSlug(
    organizationId,
    `${existing.slug}-copy`,
  );

  const duplicate = await createEventRecord(
    {
      organizationId,
      title: `${existing.title} (Copy)`,
      slug,
      description: existing.description,
      shortDescription: existing.shortDescription,
      categoryId: existing.categoryId,
      locationId: existing.locationId,
      eventStatus: "DRAFT",
      visibility: existing.visibility,
      startDateTime: existing.startDateTime,
      endDateTime: existing.endDateTime,
      timezone: existing.timezone,
      isAllDay: existing.isAllDay,
      registrationRequired: existing.registrationRequired,
      registrationOpenDate: existing.registrationOpenDate,
      registrationCloseDate: existing.registrationCloseDate,
      registrationCapacity: existing.registrationCapacity,
      waitlistEnabled: existing.waitlistEnabled,
      registrationFee: existing.registrationFee,
      registrationInstructions: existing.registrationInstructions,
      contactName: existing.contactName,
      contactEmail: existing.contactEmail,
      contactPhone: existing.contactPhone,
      isRecurring: false,
      recurrenceRule: null,
      recurrenceEndDate: null,
      parentEventId: null,
      createdByUserId: userId,
      publishedAt: null,
    },
    existing.organizers.map((o) => ({
      userId: o.userId,
      memberId: o.memberId,
      organizerName: o.organizerName,
      organizerEmail: o.organizerEmail,
      organizerPhone: o.organizerPhone,
      role: o.role,
      isPrimary: o.isPrimary,
    })),
    existing.ministries.map((m) => ({
      ministryId: m.ministryId,
      isPrimary: m.isPrimary,
      notes: m.notes,
    })),
  );

  await audit(
    organizationId,
    actor,
    "DUPLICATE",
    "Event",
    duplicate.id,
    buildSafeAuditChanges({
      sourceEventId: id,
      title: duplicate.title,
      eventStatus: "DRAFT",
    }),
  );

  return duplicate;
}

export async function deleteDraftEvent(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canDeleteDraft,
    "You do not have permission to delete draft events.",
  );
  const existing = await findEventLean(organizationId, id);
  if (!existing) throw new Error("Event not found.");
  if (existing.eventStatus !== "DRAFT") {
    throw new Error("Only draft events can be deleted.");
  }

  if (existing.featuredImageKey) {
    await removeEventFeaturedImage(existing.featuredImageKey);
  }

  await deleteEventRecord(id, organizationId);

  await audit(
    organizationId,
    actor,
    "DELETE",
    "Event",
    id,
    buildSafeAuditChanges({ deleted: true, title: existing.title }),
  );
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

export async function previewEventRecurrence(input: {
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  isAllDay?: boolean;
  recurrencePreset?: string;
  recurrenceByDay?: string;
  recurrenceInterval?: number;
  recurrenceEndDate?: string;
  recurrenceCustomRule?: string;
}) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canView || a.canCreate || a.canEdit,
    "You do not have permission to preview recurrence.",
  );

  const start = combineDateTime(
    input.startDate,
    input.isAllDay ? "00:00" : input.startTime,
  );
  const end = combineDateTime(
    input.endDate,
    input.isAllDay ? "23:59" : input.endTime,
  );
  if (!start || !end) throw new Error("Invalid dates for recurrence preview.");

  const rule = buildRRule({
    preset: (input.recurrencePreset as RecurrencePreset) || "NONE",
    byDay: input.recurrenceByDay,
    interval: input.recurrenceInterval,
    until: input.recurrenceEndDate ? new Date(input.recurrenceEndDate) : null,
    customRule: input.recurrenceCustomRule,
  });

  const items = previewOccurrences(start, end, rule, {
    windowMonths: EVENT_OCCURRENCE_WINDOW_MONTHS,
    maxOccurrences: 24,
  });

  return {
    rule,
    occurrences: items.map((item) => ({
      start: item.start.toISOString(),
      end: item.end.toISOString(),
    })),
  };
}

export async function generateEventOccurrences(
  eventId: string,
  actor: Actor,
  options?: { skipPermission?: boolean; fromDate?: Date },
) {
  const organizationId = await getOrganizationId();
  if (!options?.skipPermission) {
    await requireEventPermission(
      organizationId,
      (a) => a.canEdit,
      "You do not have permission to generate occurrences.",
    );
  }

  const parent = await findEventById(organizationId, eventId);
  if (!parent) throw new Error("Event not found.");
  if (!parent.isRecurring || !parent.recurrenceRule) {
    throw new Error("Event is not recurring.");
  }

  const all = generateOccurrences(
    parent.startDateTime,
    parent.endDateTime,
    parent.recurrenceRule,
    {
      windowMonths: EVENT_OCCURRENCE_WINDOW_MONTHS,
      maxOccurrences: 60,
    },
  );

  // Skip the parent start itself; create child rows for subsequent starts
  const from = options?.fromDate ?? parent.startDateTime;
  const candidates = all.filter(
    (o) =>
      o.start.getTime() > parent.startDateTime.getTime() &&
      o.start.getTime() >= from.getTime(),
  );

  const existing = await findOccurrenceStartTimes(organizationId, parent.id);
  const createdIds = await createOccurrenceEvents(
    {
      id: parent.id,
      organizationId: parent.organizationId,
      title: parent.title,
      slug: parent.slug,
      description: parent.description,
      shortDescription: parent.shortDescription,
      categoryId: parent.categoryId,
      locationId: parent.locationId,
      eventStatus: parent.eventStatus,
      visibility: parent.visibility,
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
      createdByUserId: parent.createdByUserId,
    },
    candidates,
    existing,
  );

  await audit(
    organizationId,
    actor,
    "OCCURRENCES_GENERATED",
    "Event",
    eventId,
    buildSafeAuditChanges({ createdCount: createdIds.length }),
  );

  return { createdCount: createdIds.length, createdIds };
}

// ---------------------------------------------------------------------------
// Featured image
// ---------------------------------------------------------------------------

export async function uploadEventFeaturedImage(
  eventId: string,
  file: File,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canEdit,
    "You do not have permission to edit events.",
  );
  const existing = await findEventLean(organizationId, eventId);
  if (!existing) throw new Error("Event not found.");

  const isPrivate = existing.visibility === "PRIVATE";
  if (existing.featuredImageKey) {
    await removeEventFeaturedImage(existing.featuredImageKey);
  }

  const saved = await saveEventFeaturedImage(
    organizationId,
    eventId,
    file,
    { isPrivate },
  );

  await updateEventRecord(eventId, organizationId, {
    featuredImageUrl: saved.publicUrl,
    featuredImageKey: saved.storageKey,
    updatedByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    existing.featuredImageKey ? "FEATURED_IMAGE_REPLACED" : "FEATURED_IMAGE_UPLOADED",
    "Event",
    eventId,
    buildSafeAuditChanges({ featuredImageKey: saved.storageKey }),
  );

  return findEventById(organizationId, eventId);
}

export async function removeEventFeaturedImageRecord(
  eventId: string,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canEdit,
    "You do not have permission to edit events.",
  );
  const existing = await findEventLean(organizationId, eventId);
  if (!existing) throw new Error("Event not found.");

  await removeEventFeaturedImage(existing.featuredImageKey);
  await updateEventRecord(eventId, organizationId, {
    featuredImageUrl: null,
    featuredImageKey: null,
    updatedByUserId: requireUserId(actor),
  });

  await audit(
    organizationId,
    actor,
    "FEATURED_IMAGE_REMOVED",
    "Event",
    eventId,
    buildSafeAuditChanges({ featuredImageRemoved: true }),
  );

  return findEventById(organizationId, eventId);
}

export async function getProtectedEventImage(eventId: string) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canView,
    "You do not have permission to view events.",
  );
  const event = await findEventLean(organizationId, eventId);
  if (!event) throw new Error("Event not found.");
  assertCanViewEvent(access, event);
  if (!event.featuredImageKey) throw new Error("No featured image.");

  const absolutePath = resolveEventImageAbsolutePath(event.featuredImageKey);
  const fileName = event.featuredImageKey.split("/").pop() || "featured.jpg";
  const ext = fileName.split(".").pop()?.toLowerCase();
  const mimeType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : "image/jpeg";

  return { absolutePath, fileName, mimeType };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function getEventCategories(options?: { activeOnly?: boolean }) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canView || a.canManageCategories,
    "You do not have permission to view categories.",
  );
  return findEventCategories(organizationId, options);
}

export async function createEventCategoryRecord(
  input: EventCategoryInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageCategories,
    "You do not have permission to manage categories.",
  );
  const record = await createEventCategory({
    organizationId,
    name: input.name,
    description: input.description ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    isActive: input.isActive ?? true,
  });
  await audit(
    organizationId,
    actor,
    "CREATE",
    "EventCategory",
    record.id,
    buildSafeAuditChanges({ name: record.name }),
  );
  return record;
}

export async function updateEventCategoryRecord(
  id: string,
  input: EventCategoryInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageCategories,
    "You do not have permission to manage categories.",
  );
  const record = await updateEventCategory(id, organizationId, {
    name: input.name,
    description: input.description ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    isActive: input.isActive ?? true,
  });
  await audit(
    organizationId,
    actor,
    "UPDATE",
    "EventCategory",
    id,
    buildSafeAuditChanges({ name: input.name, isActive: input.isActive }),
  );
  return record;
}

export async function setEventCategoryActive(
  id: string,
  isActive: boolean,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageCategories,
    "You do not have permission to manage categories.",
  );
  const record = await updateEventCategory(id, organizationId, { isActive });
  await audit(
    organizationId,
    actor,
    isActive ? "ACTIVATE" : "DEACTIVATE",
    "EventCategory",
    id,
    buildSafeAuditChanges({ isActive }),
  );
  return record;
}

export async function deleteEventCategoryRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageCategories,
    "You do not have permission to manage categories.",
  );
  const existing = await findEventCategoryById(organizationId, id);
  if (!existing) throw new Error("Category not found.");
  await deleteEventCategory(id, organizationId);
  await audit(
    organizationId,
    actor,
    "DELETE",
    "EventCategory",
    id,
    buildSafeAuditChanges({ name: existing.name, deleted: true }),
  );
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export async function getEventLocations(options?: { activeOnly?: boolean }) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canView || a.canManageLocations,
    "You do not have permission to view locations.",
  );
  return findEventLocations(organizationId, options);
}

export async function createEventLocationRecord(
  input: EventLocationInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageLocations,
    "You do not have permission to manage locations.",
  );
  const record = await createEventLocation({
    organizationId,
    name: input.name,
    description: input.description ?? null,
    address1: input.address1 ?? null,
    address2: input.address2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    country: input.country ?? "US",
    roomName: input.roomName ?? null,
    capacity: input.capacity ?? null,
    isOnline: Boolean(input.isOnline),
    onlineMeetingUrl: input.onlineMeetingUrl ?? null,
    isActive: input.isActive ?? true,
  });
  await audit(
    organizationId,
    actor,
    "CREATE",
    "EventLocation",
    record.id,
    buildSafeAuditChanges({ name: record.name, isOnline: record.isOnline }),
  );
  return record;
}

export async function updateEventLocationRecord(
  id: string,
  input: EventLocationInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageLocations,
    "You do not have permission to manage locations.",
  );
  const record = await updateEventLocation(id, organizationId, {
    name: input.name,
    description: input.description ?? null,
    address1: input.address1 ?? null,
    address2: input.address2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    country: input.country ?? "US",
    roomName: input.roomName ?? null,
    capacity: input.capacity ?? null,
    isOnline: Boolean(input.isOnline),
    onlineMeetingUrl: input.onlineMeetingUrl ?? null,
    isActive: input.isActive ?? true,
  });
  await audit(
    organizationId,
    actor,
    "UPDATE",
    "EventLocation",
    id,
    buildSafeAuditChanges({ name: input.name, isActive: input.isActive }),
  );
  return record;
}

export async function setEventLocationActive(
  id: string,
  isActive: boolean,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageLocations,
    "You do not have permission to manage locations.",
  );
  const record = await updateEventLocation(id, organizationId, { isActive });
  await audit(
    organizationId,
    actor,
    isActive ? "ACTIVATE" : "DEACTIVATE",
    "EventLocation",
    id,
    buildSafeAuditChanges({ isActive }),
  );
  return record;
}

export async function deleteEventLocationRecord(id: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageLocations,
    "You do not have permission to manage locations.",
  );
  const existing = await findEventLocationById(organizationId, id);
  if (!existing) throw new Error("Location not found.");
  await deleteEventLocation(id, organizationId);
  await audit(
    organizationId,
    actor,
    "DELETE",
    "EventLocation",
    id,
    buildSafeAuditChanges({ name: existing.name, deleted: true }),
  );
}

export { getEventAccess };
