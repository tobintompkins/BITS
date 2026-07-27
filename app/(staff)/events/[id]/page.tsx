import { redirect } from "next/navigation";

import { getEventById } from "@/app/(staff)/events/actions";
import { getCheckInSettingsAction } from "@/app/(staff)/events/check-in-actions";
import {
  getEventRegistrationsAction,
  getRegistrationSettingsAction,
  getRegistrationSummaryAction,
} from "@/app/(staff)/events/registration-actions";
import { EventDetail } from "@/components/events/event-detail";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EventDetailPage({ params }: PageProps) {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const { id } = await params;

  let payload: Awaited<ReturnType<typeof getEventById>>;
  try {
    payload = await getEventById(id);
  } catch {
    redirect("/events");
  }

  const { event, access, activity } = payload;

  let registration:
    | {
        settings: Awaited<ReturnType<typeof getRegistrationSettingsAction>>;
        registrations: Awaited<
          ReturnType<typeof getEventRegistrationsAction>
        >["registrations"];
        summary: Awaited<ReturnType<typeof getRegistrationSummaryAction>>;
      }
    | undefined;

  let checkInSettings:
    | Awaited<ReturnType<typeof getCheckInSettingsAction>>
    | null
    | undefined;

  if (access.canManageRegistration || access.canCheckIn) {
    try {
      const [settings, summary, checkIn] = await Promise.all([
        getRegistrationSettingsAction(id),
        getRegistrationSummaryAction(id),
        getCheckInSettingsAction(id).catch(() => null),
      ]);
      checkInSettings = checkIn;
      let registrations: Awaited<
        ReturnType<typeof getEventRegistrationsAction>
      >["registrations"] = [];
      if (access.canManageRegistration) {
        const list = await getEventRegistrationsAction(id);
        registrations = list.registrations;
      }
      registration = { settings, registrations, summary };
    } catch {
      registration = undefined;
    }
  }

  return (
    <EventDetail
      event={event}
      activity={activity}
      access={{
        canEdit: access.canEdit,
        canPublish: access.canPublish,
        canCancel: access.canCancel,
        canArchive: access.canArchive,
        canDeleteDraft: access.canDeleteDraft,
        canCreate: access.canCreate,
        canManageRegistration: access.canManageRegistration,
        canCheckIn: access.canCheckIn,
        canManageCheckIn: access.canManageCheckIn,
        canExportRegistrations: access.canExportRegistrations,
      }}
      registration={registration}
      checkInSettings={
        checkInSettings
          ? {
              eventId: id,
              checkInEnabled: checkInSettings.checkInEnabled,
              checkInOpensAt: checkInSettings.checkInOpensAt,
              checkInClosesAt: checkInSettings.checkInClosesAt,
              allowSelfCheckIn: checkInSettings.allowSelfCheckIn,
              allowWalkIns: checkInSettings.allowWalkIns,
              allowCheckOut: checkInSettings.allowCheckOut,
              allowReentry: checkInSettings.allowReentry,
              requireRegistration: checkInSettings.requireRegistration,
              qrPassEnabled: checkInSettings.qrPassEnabled,
              stationNameRequired: checkInSettings.stationNameRequired,
            }
          : null
      }
    />
  );
}
