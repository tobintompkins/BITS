import { redirect } from "next/navigation";
import type { EventStatus, EventVisibility } from "@/app/generated/prisma/client";

import {
  getEventAccess,
  getEventCategories,
  getEventDirectorySummary,
  getEventLocations,
  getEvents,
} from "@/app/(staff)/events/actions";
import { EventDirectory } from "@/components/events/event-directory";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PageProps = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    categoryId?: string;
    locationId?: string;
    visibility?: string;
    registrationRequired?: string;
    registrationOpen?: string;
    upcomingOnly?: string;
    pastOnly?: string;
    ministryId?: string;
    page?: string;
  }>;
};

export default async function EventsPage({ searchParams }: PageProps) {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getEventAccess(organization.id);
  if (!access.canView) redirect("/dashboard");

  const params = await searchParams;
  const page = Math.max(1, Number(params.page || "1") || 1);

  const [list, summary, categories, locations] = await Promise.all([
    getEvents({
      search: params.search,
      status: params.status as EventStatus | undefined,
      categoryId: params.categoryId,
      locationId: params.locationId,
      visibility: params.visibility as EventVisibility | undefined,
      registrationRequired:
        params.registrationRequired === "1" ? true : undefined,
      registrationOpen: params.registrationOpen === "1",
      upcomingOnly: params.upcomingOnly === "1",
      pastOnly: params.pastOnly === "1",
      ministryId: params.ministryId,
      page,
      pageSize: 25,
    }),
    getEventDirectorySummary(),
    getEventCategories({ activeOnly: true }),
    getEventLocations({ activeOnly: true }),
  ]);

  return (
    <EventDirectory
      events={list.events}
      total={list.total}
      page={list.page}
      pageSize={list.pageSize}
      counts={summary.counts}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      access={{
        canCreate: access.canCreate,
        canEdit: access.canEdit,
        canPublish: access.canPublish,
        canCancel: access.canCancel,
        canArchive: access.canArchive,
      }}
    />
  );
}
