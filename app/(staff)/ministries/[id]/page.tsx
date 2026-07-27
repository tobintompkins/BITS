import { notFound, redirect } from "next/navigation";

import { MinistryProfile } from "@/components/ministries/ministry-profile";
import {
  getMemberEngagementAccess,
  getMinistryById,
} from "@/app/(staff)/member-engagement/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type MinistryDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MinistryDetailPage({ params }: MinistryDetailPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canViewMinistries) {
    redirect("/dashboard");
  }

  const [ministry, members] = await Promise.all([
    getMinistryById(id),
    getMemberSelectOptions(),
  ]);

  if (!ministry) notFound();

  return (
    <MinistryProfile
      ministry={ministry}
      members={members}
      canManage={access.canManageMinistries}
      canManageRoster={access.canManageMinistryRosters || access.canManageMinistries}
    />
  );
}
