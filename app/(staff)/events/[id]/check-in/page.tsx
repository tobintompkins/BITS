import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckInConsole } from "@/components/events/check-in-console";
import { getCheckInOperationsBootstrap } from "@/server/services/event-check-in.service";

export default async function EventCheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let bootstrap: Awaited<ReturnType<typeof getCheckInOperationsBootstrap>>;
  try {
    bootstrap = await getCheckInOperationsBootstrap(id);
  } catch {
    notFound();
  }

  const { event, settings, stations, summary, access } = bootstrap;

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/events/${event.id}`} className="underline">
          Event detail
        </Link>
        <Link href={`/events/${event.id}/attendance`} className="underline">
          Attendance dashboard
        </Link>
        <Link href={`/events/${event.id}/registrations`} className="underline">
          Registrations
        </Link>
      </div>
      <CheckInConsole
        eventId={event.id}
        eventTitle={event.title}
        timezone={event.timezone}
        startLabel={new Date(event.startDateTime).toLocaleString()}
        settings={{
          checkInEnabled: settings.checkInEnabled,
          allowWalkIns: settings.allowWalkIns,
          allowSelfCheckIn: settings.allowSelfCheckIn,
          stationNameRequired: settings.stationNameRequired,
        }}
        initialStations={stations}
        initialSummary={summary}
        access={{
          canOperateCheckIn: access.canOperateCheckIn,
          canCreateWalkIn: access.canCreateWalkIn,
          canManageCheckIn: access.canManageCheckIn,
        }}
      />
    </main>
  );
}
