import { redirect } from "next/navigation";

import { SkillSearchDirectory } from "@/components/members/skill-search-directory";
import {
  getMemberEngagementAccess,
  searchMembersBySkillQuery,
} from "@/app/(staff)/member-engagement/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type SkillsPageProps = {
  searchParams: Promise<{ search?: string; available?: string }>;
};

export default async function MemberSkillsPage({ searchParams }: SkillsPageProps) {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canViewSkillsInterests) {
    redirect("/dashboard");
  }

  const { search, available } = await searchParams;
  const rows = await searchMembersBySkillQuery({
    search,
    availableToServeOnly: available === "1",
  });

  return (
    <SkillSearchDirectory
      rows={rows}
      canViewContact={access.canViewContactInSkillSearch}
      canExport={access.canExport}
    />
  );
}
