import { redirect } from "next/navigation";

import { MinistryDirectory } from "@/components/ministries/ministry-directory";
import {
  getMemberEngagementAccess,
  getMinistries,
} from "@/app/(staff)/member-engagement/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type MinistriesPageProps = {
  searchParams: Promise<{ search?: string }>;
};

export default async function MinistriesPage({ searchParams }: MinistriesPageProps) {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canViewMinistries) {
    redirect("/dashboard");
  }

  const { search } = await searchParams;
  const ministries = await getMinistries({ search });

  return (
    <MinistryDirectory
      ministries={ministries}
      canCreate={access.canManageMinistries}
    />
  );
}
