import Link from "next/link";
import { notFound } from "next/navigation";

import { AttendanceDashboard } from "@/components/events/attendance-dashboard";
import { getEventAccess } from "@/lib/auth/event-permissions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { findEventForCheckIn } from "@/server/repositories/event-check-in.repository";

export default async function EventAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();
  if (!organization) notFound();

  const access = await getEventAccess(organization.id);
  if (!access.canReadCheckIn && !access.canOperateCheckIn) notFound();

  const event = await findEventForCheckIn(organization.id, id);
  if (!event) notFound();

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/events/${event.id}`} className="underline">
          {event.title}
        </Link>
        <Link href={`/events/${event.id}/check-in`} className="underline">
          Check-in console
        </Link>
      </div>
      <AttendanceDashboard
        eventId={event.id}
        access={{
          canExportAttendance: access.canExportAttendance,
          canCorrectAttendance: access.canCorrectAttendance,
          canOperateCheckIn: access.canOperateCheckIn,
        }}
      />
    </main>
  );
}
