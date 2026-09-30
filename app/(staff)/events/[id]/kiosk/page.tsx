import { notFound } from "next/navigation";

import { CheckInKiosk } from "@/components/events/check-in-kiosk";
import { getEventAccess } from "@/lib/auth/event-permissions";
import { canUseCheckInKiosk } from "@/lib/events/check-in-kiosk-ui";
import { getCheckInSettingsDto } from "@/server/services/event-check-in.service";

export default async function EventCheckInKioskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getEventAccess();

  if (!canUseCheckInKiosk(access)) {
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
    <main className="px-4 py-8 sm:px-6">
      <CheckInKiosk
        key={dto.event.id}
        eventId={dto.event.id}
        eventTitle={dto.event.title}
        startLabel={formattedStart}
        timezone={dto.event.timezone}
        settings={{
          checkInEnabled: dto.settings.checkInEnabled,
          checkInOpensAt: dto.settings.checkInOpensAt,
          checkInClosesAt: dto.settings.checkInClosesAt,
          stationNameRequired: dto.settings.stationNameRequired,
        }}
      />
    </main>
  );
}
