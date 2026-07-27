import { redirect } from "next/navigation";

import {
  getEventAccess,
  getEventCategories,
} from "@/app/(staff)/events/actions";
import { EventCategoryAdmin } from "@/components/events/event-category-admin";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function EventCategoriesSettingsPage() {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getEventAccess(organization.id);
  if (!access.canManageCategories && !access.canView) {
    redirect("/dashboard");
  }

  const categories = await getEventCategories();

  return (
    <EventCategoryAdmin
      categories={categories}
      canManage={access.canManageCategories}
    />
  );
}
