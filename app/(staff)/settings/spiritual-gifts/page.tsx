import { redirect } from "next/navigation";

import { SpiritualGiftsAdmin } from "@/components/settings/spiritual-gifts-admin";
import {
  getMemberEngagementAccess,
  getSpiritualGifts,
} from "@/app/(staff)/member-engagement/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function SpiritualGiftsSettingsPage() {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canManageSpiritualGiftCatalog && !access.canViewSpiritualGifts) {
    redirect("/dashboard");
  }

  const gifts = await getSpiritualGifts();

  return (
    <SpiritualGiftsAdmin
      gifts={gifts}
      canManage={access.canManageSpiritualGiftCatalog}
      canDelete={access.canDeleteCatalog}
    />
  );
}
