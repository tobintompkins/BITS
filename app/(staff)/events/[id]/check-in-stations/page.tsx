import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckInStationsPanel } from "@/components/events/check-in-stations-panel";
import { getEventAccess } from "@/lib/auth/event-permissions";
import { getCheckInSettingsDto } from "@/server/services/event-check-in.service";

export default async function EventCheckInStationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getEventAccess();

  // Server-side guard — nav visibility is not authorization.
  // Operate-only roles (e.g. TREASURER) must not access station management.
  if (!access.canManageCheckIn) {
    notFound();
  }

  let dto: Awaited<ReturnType<typeof getCheckInSettingsDto>>;
  try {
    dto = await getCheckInSettingsDto(id);
  } catch {
    notFound();
  }

  const formattedStart = new Date(dto.event.startDateTime).toLocaleString(
    undefined,
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <nav className="flex flex-wrap gap-3 text-sm" aria-label="Event links">
        <Link href={`/events/${dto.event.id}`} className="underline">
          Event detail
        </Link>
        {access.canOperateCheckIn ? (
          <Link
            href={`/events/${dto.event.id}/staff-check-in`}
            className="underline"
          >
            Staff check-in
          </Link>
        ) : null}
        <Link href={`/events/${dto.event.id}/check-in`} className="underline">
          Full check-in console
        </Link>
      </nav>

      <CheckInStationsPanel
        eventId={dto.event.id}
        eventTitle={dto.event.title}
        startLabel={formattedStart}
        timezone={dto.event.timezone}
      />
    </main>
  );
}
