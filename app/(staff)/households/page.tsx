import { redirect } from "next/navigation";

import { HouseholdDirectory } from "@/components/households/household-directory";
import {
  getHouseholdAccess,
  requireHouseholdViewAccess,
} from "@/lib/auth/household-permissions";
import { getHouseholds } from "@/app/(staff)/household/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type HouseholdsPageProps = {
  searchParams: Promise<{ search?: string }>;
};

export default async function HouseholdsPage({
  searchParams,
}: HouseholdsPageProps) {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  await requireHouseholdViewAccess(organization.id);
  const access = await getHouseholdAccess(organization.id);
  const { search } = await searchParams;
  const households = await getHouseholds({ search });

  return (
    <HouseholdDirectory households={households} canCreate={access.canCreate} />
  );
}
