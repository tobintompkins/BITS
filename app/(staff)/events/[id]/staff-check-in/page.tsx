import Link from "next/link";
import { notFound } from "next/navigation";

import { StaffCheckInPanel } from "@/components/events/staff-check-in-panel";
import { getEventAccess } from "@/lib/auth/event-permissions";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import { canAccessVerifiedChildCheckOut } from "@/lib/validation/child-pickup-checkout";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { getCheckInSettingsDto } from "@/server/services/event-check-in.service";

export default async function EventStaffCheckInPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();
  const access = await getEventAccess();
  const memberAccess = organization
    ? await getMemberAccess(organization.id)
    : { canView: false, canEdit: false };
  const showVerifiedChildCheckOut = canAccessVerifiedChildCheckOut({
    canViewMembers: memberAccess.canView,
    canEditMembers: memberAccess.canEdit,
    canManageCheckIn: access.canManageCheckIn,
  });

  // Server-side guard — nav visibility is not authorization.
  if (!access.canOperateCheckIn) {
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
        <Link href={`/events/${dto.event.id}/check-in`} className="underline">
          Full check-in console
        </Link>
        <Link href={`/events/${dto.event.id}/kiosk`} className="underline">
          Check-in kiosk
        </Link>
        <Link
          href={`/events/${dto.event.id}/registrations`}
          className="underline"
        >
          Registrations
        </Link>
        <Link
          href={`/events/${dto.event.id}/attendance`}
          className="underline"
        >
          Check-out &amp; re-entry
        </Link>
        {showVerifiedChildCheckOut ? (
          <Link
            href={`/events/${dto.event.id}/child-check-out`}
            className="underline"
          >
            Verified child check-out
          </Link>
        ) : null}
      </nav>

      <StaffCheckInPanel
        key={dto.event.id}
        eventId={dto.event.id}
        eventTitle={dto.event.title}
        startLabel={formattedStart}
        timezone={dto.event.timezone}
        settings={{
          checkInEnabled: dto.settings.checkInEnabled,
          checkInOpensAt: dto.settings.checkInOpensAt,
          checkInClosesAt: dto.settings.checkInClosesAt,
        }}
      />
    </main>
  );
}
