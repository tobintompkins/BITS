import { redirect } from "next/navigation";

import {
  getEventAccess,
  getEventFormOptions,
} from "@/app/(staff)/events/actions";
import { EventForm } from "@/components/events/event-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function NewEventPage() {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getEventAccess(organization.id);
  if (!access.canCreate) redirect("/events");

  const options = await getEventFormOptions();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          New Event
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Create a draft or publish immediately when permitted.
        </p>
      </header>
      <EventForm
        mode="create"
        canPublish={access.canPublish}
        categories={options.categories.map((c) => ({ id: c.id, name: c.name }))}
        locations={options.locations.map((l) => ({ id: l.id, name: l.name }))}
        ministries={options.ministries}
        staffUsers={options.staffUsers}
        members={options.members}
        initialValues={{
          title: "",
          slug: "",
          shortDescription: "",
          description: "",
          categoryId: "",
          locationId: "",
          visibility: "STAFF_ONLY",
          startDate: "",
          startTime: "10:00",
          endDate: "",
          endTime: "11:00",
          timezone: organization.timeZone || "America/Chicago",
          isAllDay: false,
          registrationRequired: false,
          registrationOpenDate: "",
          registrationCloseDate: "",
          registrationCapacity: "",
          waitlistEnabled: false,
          registrationFee: "",
          registrationInstructions: "",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          isRecurring: false,
          recurrencePreset: "NONE",
          recurrenceByDay: "",
          recurrenceInterval: "1",
          recurrenceEndDate: "",
          recurrenceCustomRule: "",
          ministryIds: [],
          primaryMinistryId: "",
          organizers: [],
        }}
      />
    </div>
  );
}
