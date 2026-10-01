import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckInConsole } from "@/components/events/check-in-console";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import { canAccessVerifiedChildCheckOut } from "@/lib/validation/child-pickup-checkout";
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
  const memberAccess = await getMemberAccess();
  const showVerifiedChildCheckOut = canAccessVerifiedChildCheckOut({
    canViewMembers: memberAccess.canView,
    canEditMembers: memberAccess.canEdit,
    canManageCheckIn: access.canManageCheckIn,
  });

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/events/${event.id}`} className="underline">
          Event detail
        </Link>
        <Link href={`/events/${event.id}/attendance`} className="underline">
          Attendance dashboard
        </Link>
        {access.canOperateCheckIn ? (
          <Link href={`/events/${event.id}/kiosk`} className="underline">
            Check-in kiosk
          </Link>
        ) : null}
        {showVerifiedChildCheckOut ? (
          <Link href={`/events/${event.id}/child-check-out`} className="underline">
            Verified child check-out
          </Link>
        ) : null}
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
