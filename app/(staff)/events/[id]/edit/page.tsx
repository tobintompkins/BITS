import { redirect } from "next/navigation";

import {
  getEventAccess,
  getEventById,
  getEventFormOptions,
} from "@/app/(staff)/events/actions";
import { EventForm } from "@/components/events/event-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PageProps = {
  params: Promise<{ id: string }>;
};

function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toTimeInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 16);
}

function toDateTimeLocal(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

export default async function EditEventPage({ params }: PageProps) {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getEventAccess(organization.id);
  if (!access.canEdit) redirect("/events");

  const { id } = await params;

  let event: Awaited<ReturnType<typeof getEventById>>["event"];
  let options: Awaited<ReturnType<typeof getEventFormOptions>>;
  try {
    const result = await Promise.all([getEventById(id), getEventFormOptions()]);
    event = result[0].event;
    options = result[1];
  } catch {
    redirect("/events");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Edit Event
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {event.title}
        </p>
      </header>
      <EventForm
        mode="edit"
        eventId={event.id}
        canPublish={access.canPublish}
        categories={options.categories.map((c) => ({ id: c.id, name: c.name }))}
        locations={options.locations.map((l) => ({ id: l.id, name: l.name }))}
        ministries={options.ministries}
        staffUsers={options.staffUsers}
        members={options.members}
        initialValues={{
          title: event.title,
          slug: event.slug,
          shortDescription: event.shortDescription ?? "",
          description: event.description ?? "",
          categoryId: event.categoryId ?? "",
          locationId: event.locationId ?? "",
          visibility: event.visibility,
          startDate: toDateInput(event.startDateTime),
          startTime: toTimeInput(event.startDateTime),
          endDate: toDateInput(event.endDateTime),
          endTime: toTimeInput(event.endDateTime),
          timezone: event.timezone,
          isAllDay: event.isAllDay,
          registrationRequired: event.registrationRequired,
          registrationOpenDate: toDateTimeLocal(event.registrationOpenDate),
          registrationCloseDate: toDateTimeLocal(event.registrationCloseDate),
          registrationCapacity:
            event.registrationCapacity != null
              ? String(event.registrationCapacity)
              : "",
          waitlistEnabled: event.waitlistEnabled,
          registrationFee:
            event.registrationFee != null ? String(event.registrationFee) : "",
          registrationInstructions: event.registrationInstructions ?? "",
          contactName: event.contactName ?? "",
          contactEmail: event.contactEmail ?? "",
          contactPhone: event.contactPhone ?? "",
          isRecurring: event.isRecurring,
          recurrencePreset: event.recurrenceRule ? "CUSTOM" : "NONE",
          recurrenceByDay: "",
          recurrenceInterval: "1",
          recurrenceEndDate: toDateInput(event.recurrenceEndDate),
          recurrenceCustomRule: event.recurrenceRule ?? "",
          ministryIds: event.ministries.map((m) => m.ministryId),
          primaryMinistryId:
            event.ministries.find((m) => m.isPrimary)?.ministryId ?? "",
          organizers: event.organizers.map((o) => ({
            userId: o.userId ?? "",
            memberId: o.memberId ?? "",
            organizerName: o.organizerName ?? "",
            organizerEmail: o.organizerEmail ?? "",
            role: o.role,
            isPrimary: o.isPrimary,
          })),
          featuredImageUrl: event.featuredImageUrl,
          isRecurringSeries: event.isRecurring,
          parentEventId: event.parentEventId,
        }}
      />
    </div>
  );
}
