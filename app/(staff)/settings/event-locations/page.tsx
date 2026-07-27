import { redirect } from "next/navigation";

import {
  getEventAccess,
  getEventLocations,
} from "@/app/(staff)/events/actions";
import { EventLocationAdmin } from "@/components/events/event-location-admin";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function EventLocationsSettingsPage() {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getEventAccess(organization.id);
  if (!access.canManageLocations && !access.canView) {
    redirect("/dashboard");
  }

  const locations = await getEventLocations();

  return (
    <EventLocationAdmin
      locations={locations}
      canManage={access.canManageLocations}
    />
  );
}
