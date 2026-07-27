"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  eventCategorySchema,
  eventLocationSchema,
  eventSchema,
} from "@/lib/validation/events";
import {
  archiveEvent,
  cancelEvent,
  cancelEventOccurrence,
  createEvent,
  createEventCategoryRecord,
  createEventLocationRecord,
  deleteDraftEvent,
  deleteEventCategoryRecord,
  deleteEventLocationRecord,
  duplicateEvent,
  generateEventOccurrences,
  getCalendarEvents,
  getEventAccessForOrg,
  getEventById,
  getEventCategories,
  getEventDashboardWidgets,
  getEventDirectorySummary,
  getEventFormOptions,
  getEventLocations,
  getEvents,
  previewEventRecurrence,
  publishEvent,
  removeEventFeaturedImageRecord,
  setEventCategoryActive,
  setEventLocationActive,
  updateEvent,
  updateEventCategoryRecord,
  updateEventLocationRecord,
  uploadEventFeaturedImage,
} from "@/server/services/event.service";

async function getActor() {
  const userAccount = await getOrCreateUserAccount();
  const clerkUser = await currentUser();
  return {
    userAccountId: userAccount?.id ?? null,
    email:
      clerkUser?.primaryEmailAddress?.emailAddress ??
      userAccount?.primaryEmail ??
      null,
  };
}

async function requireAuth() {
  const { userId } = await auth();
  if (!userId) throw new Error("You must be signed in.");
}

function revalidateEvents(eventId?: string) {
  revalidatePath("/events");
  revalidatePath("/events/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/settings/event-categories");
  revalidatePath("/settings/event-locations");
  if (eventId) {
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/edit`);
  }
}

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "true" || value === "on" || value === "1";
}

function parseOrganizers(formData: FormData) {
  const raw = String(formData.get("organizersJson") ?? "[]");
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseMinistryIds(formData: FormData) {
  const multi = formData.getAll("ministryIds").map(String).filter(Boolean);
  if (multi.length > 0) return multi;
  const raw = String(formData.get("ministryIdsJson") ?? "[]");
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseEventForm(formData: FormData) {
  return eventSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    shortDescription: String(formData.get("shortDescription") ?? ""),
    description: String(formData.get("description") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    locationId: String(formData.get("locationId") ?? ""),
    eventStatus: String(formData.get("eventStatus") ?? "DRAFT"),
    visibility: String(formData.get("visibility") ?? "STAFF_ONLY"),
    startDate: String(formData.get("startDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    endTime: String(formData.get("endTime") ?? ""),
    timezone: String(formData.get("timezone") ?? "America/Chicago"),
    isAllDay: parseBoolean(formData.get("isAllDay")),
    registrationRequired: parseBoolean(formData.get("registrationRequired")),
    registrationOpenDate: String(formData.get("registrationOpenDate") ?? ""),
    registrationCloseDate: String(formData.get("registrationCloseDate") ?? ""),
    registrationCapacity: String(formData.get("registrationCapacity") ?? ""),
    waitlistEnabled: parseBoolean(formData.get("waitlistEnabled")),
    registrationFee: String(formData.get("registrationFee") ?? ""),
    registrationInstructions: String(
      formData.get("registrationInstructions") ?? "",
    ),
    contactName: String(formData.get("contactName") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    contactPhone: String(formData.get("contactPhone") ?? ""),
    isRecurring: parseBoolean(formData.get("isRecurring")),
    recurrencePreset: String(formData.get("recurrencePreset") ?? "NONE"),
    recurrenceByDay: String(formData.get("recurrenceByDay") ?? ""),
    recurrenceInterval: String(formData.get("recurrenceInterval") ?? ""),
    recurrenceEndDate: String(formData.get("recurrenceEndDate") ?? ""),
    recurrenceCustomRule: String(formData.get("recurrenceCustomRule") ?? ""),
    ministryIds: parseMinistryIds(formData),
    primaryMinistryId: String(formData.get("primaryMinistryId") ?? ""),
    organizers: parseOrganizers(formData),
    publishNow: parseBoolean(formData.get("publishNow")),
    recurrenceEditScope: String(formData.get("recurrenceEditScope") ?? "") || undefined,
  });
}

export async function createEventAction(formData: FormData) {
  await requireAuth();
  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const actor = await getActor();
    const record = await createEvent(parsed.data, actor);
    revalidateEvents(record?.id);
    return {
      status: "success" as const,
      message: parsed.data.publishNow ? "Event published." : "Draft saved.",
      id: record?.id,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to create event.",
    };
  }
}

export async function updateEventAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = parseEventForm(formData);
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const actor = await getActor();
    await updateEvent(id, parsed.data, actor);
    revalidateEvents(id);
    return { status: "success" as const, message: "Event updated." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update event.",
    };
  }
}

export async function publishEventAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    await publishEvent(id, actor);
    revalidateEvents(id);
    return { status: "success" as const, message: "Event published." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to publish.",
    };
  }
}

export async function cancelEventAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    await cancelEvent(id, actor);
    revalidateEvents(id);
    return { status: "success" as const, message: "Event cancelled." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to cancel.",
    };
  }
}

export async function cancelEventOccurrenceAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    await cancelEventOccurrence(id, actor);
    revalidateEvents(id);
    return { status: "success" as const, message: "Occurrence cancelled." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to cancel occurrence.",
    };
  }
}

export async function archiveEventAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    await archiveEvent(id, actor);
    revalidateEvents(id);
    return { status: "success" as const, message: "Event archived." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to archive.",
    };
  }
}

export async function duplicateEventAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    const copy = await duplicateEvent(id, actor);
    revalidateEvents(copy.id);
    return {
      status: "success" as const,
      message: "Event duplicated as draft.",
      id: copy.id,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to duplicate.",
    };
  }
}

export async function deleteDraftEventAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    await deleteDraftEvent(id, actor);
    revalidateEvents();
    return { status: "success" as const, message: "Draft deleted." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to delete draft.",
    };
  }
}

export async function uploadEventImageAction(id: string, formData: FormData) {
  await requireAuth();
  const file = formData.get("featuredImage");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error" as const, message: "Choose an image file." };
  }
  try {
    const actor = await getActor();
    await uploadEventFeaturedImage(id, file, actor);
    revalidateEvents(id);
    return { status: "success" as const, message: "Featured image uploaded." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to upload image.",
    };
  }
}

export async function removeEventImageAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    await removeEventFeaturedImageRecord(id, actor);
    revalidateEvents(id);
    return { status: "success" as const, message: "Featured image removed." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to remove image.",
    };
  }
}

export async function previewRecurrenceAction(formData: FormData) {
  await requireAuth();
  try {
    const result = await previewEventRecurrence({
      startDate: String(formData.get("startDate") ?? ""),
      startTime: String(formData.get("startTime") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      endTime: String(formData.get("endTime") ?? ""),
      isAllDay: parseBoolean(formData.get("isAllDay")),
      recurrencePreset: String(formData.get("recurrencePreset") ?? "NONE"),
      recurrenceByDay: String(formData.get("recurrenceByDay") ?? ""),
      recurrenceInterval: Number(formData.get("recurrenceInterval") || 1),
      recurrenceEndDate: String(formData.get("recurrenceEndDate") ?? ""),
      recurrenceCustomRule: String(formData.get("recurrenceCustomRule") ?? ""),
    });
    return { status: "success" as const, ...result };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to preview.",
    };
  }
}

export async function generateOccurrencesAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    const result = await generateEventOccurrences(id, actor);
    revalidateEvents(id);
    return {
      status: "success" as const,
      message: `Generated ${result.createdCount} occurrence(s).`,
      createdCount: result.createdCount,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error ? error.message : "Unable to generate occurrences.",
    };
  }
}

export async function createEventCategoryAction(formData: FormData) {
  await requireAuth();
  const parsed = eventCategorySchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    color: String(formData.get("color") ?? ""),
    icon: String(formData.get("icon") ?? ""),
    isActive: parseBoolean(formData.get("isActive") ?? "true"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const actor = await getActor();
    await createEventCategoryRecord(parsed.data, actor);
    revalidateEvents();
    return { status: "success" as const, message: "Category created." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to create category.",
    };
  }
}

export async function updateEventCategoryAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = eventCategorySchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    color: String(formData.get("color") ?? ""),
    icon: String(formData.get("icon") ?? ""),
    isActive: parseBoolean(formData.get("isActive") ?? "true"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const actor = await getActor();
    await updateEventCategoryRecord(id, parsed.data, actor);
    revalidateEvents();
    return { status: "success" as const, message: "Category updated." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update category.",
    };
  }
}

export async function toggleEventCategoryActiveAction(
  id: string,
  isActive: boolean,
) {
  await requireAuth();
  try {
    const actor = await getActor();
    await setEventCategoryActive(id, isActive, actor);
    revalidateEvents();
    return {
      status: "success" as const,
      message: isActive ? "Category activated." : "Category deactivated.",
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update category.",
    };
  }
}

export async function deleteEventCategoryAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    await deleteEventCategoryRecord(id, actor);
    revalidateEvents();
    return { status: "success" as const, message: "Category deleted." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to delete category.",
    };
  }
}

export async function createEventLocationAction(formData: FormData) {
  await requireAuth();
  const parsed = eventLocationSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    address1: String(formData.get("address1") ?? ""),
    address2: String(formData.get("address2") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    zip: String(formData.get("zip") ?? ""),
    country: String(formData.get("country") ?? "US"),
    roomName: String(formData.get("roomName") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
    isOnline: parseBoolean(formData.get("isOnline")),
    onlineMeetingUrl: String(formData.get("onlineMeetingUrl") ?? ""),
    isActive: parseBoolean(formData.get("isActive") ?? "true"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const actor = await getActor();
    await createEventLocationRecord(parsed.data, actor);
    revalidateEvents();
    return { status: "success" as const, message: "Location created." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to create location.",
    };
  }
}

export async function updateEventLocationAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = eventLocationSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    address1: String(formData.get("address1") ?? ""),
    address2: String(formData.get("address2") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    zip: String(formData.get("zip") ?? ""),
    country: String(formData.get("country") ?? "US"),
    roomName: String(formData.get("roomName") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
    isOnline: parseBoolean(formData.get("isOnline")),
    onlineMeetingUrl: String(formData.get("onlineMeetingUrl") ?? ""),
    isActive: parseBoolean(formData.get("isActive") ?? "true"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const actor = await getActor();
    await updateEventLocationRecord(id, parsed.data, actor);
    revalidateEvents();
    return { status: "success" as const, message: "Location updated." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update location.",
    };
  }
}

export async function toggleEventLocationActiveAction(
  id: string,
  isActive: boolean,
) {
  await requireAuth();
  try {
    const actor = await getActor();
    await setEventLocationActive(id, isActive, actor);
    revalidateEvents();
    return {
      status: "success" as const,
      message: isActive ? "Location activated." : "Location deactivated.",
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update location.",
    };
  }
}

export async function deleteEventLocationAction(id: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    await deleteEventLocationRecord(id, actor);
    revalidateEvents();
    return { status: "success" as const, message: "Location deleted." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to delete location.",
    };
  }
}

// Query re-exports (no type exports from this module)
export {
  getCalendarEvents,
  getEventAccessForOrg as getEventAccess,
  getEventById,
  getEventCategories,
  getEventDashboardWidgets,
  getEventDirectorySummary,
  getEventFormOptions,
  getEventLocations,
  getEvents,
};
