import Link from "next/link";
import { redirect } from "next/navigation";

import { getEventRegistrationsAction } from "@/app/(staff)/events/registration-actions";
import { EventAttendeesPanel } from "@/components/events/event-attendees-panel";
import { RegistrationSettingsPanel } from "@/components/events/registration-settings-panel";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EventRegistrationsPage({ params }: PageProps) {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const { id } = await params;

  let payload: Awaited<ReturnType<typeof getEventRegistrationsAction>>;
  try {
    payload = await getEventRegistrationsAction(id);
  } catch {
    redirect(`/events/${id}`);
  }

  const { event, registrations, summary, access } = payload;
  const settings = summary.settings
    ? { ...summary.settings, eventId: event.id }
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm text-zinc-500">
          <Link href={`/events/${event.id}`} className="hover:underline">
            ← {event.title}
          </Link>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Registrations
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Manage attendees, waitlist, check-in, and export for this event.
        </p>
      </header>

      <EventAttendeesPanel
        eventId={event.id}
        eventSlug={event.slug}
        registrations={registrations}
        summary={summary}
        access={{
          canManageRegistration: access.canManageRegistration,
          canCheckIn: access.canCheckIn,
          canExportRegistrations: access.canExportRegistrations,
          canManageQrPass:
            access.canOperateCheckIn ||
            access.canManageCheckIn ||
            access.canManageRegistration ||
            access.canCheckIn,
        }}
      />

      {settings && access.canManageRegistration ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Registration settings
          </h2>
          <RegistrationSettingsPanel settings={settings} />
        </section>
      ) : null}
    </div>
  );
}
