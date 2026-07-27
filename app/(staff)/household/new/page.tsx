import Link from "next/link";
import { redirect } from "next/navigation";

import { HouseholdForm } from "@/components/households/household-form";
import {
  getHouseholdAccess,
  requireHouseholdCreateAccess,
} from "@/lib/auth/household-permissions";
import { getMemberOptionsForHousehold } from "@/app/(staff)/household/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function NewHouseholdPage() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  await requireHouseholdCreateAccess(organization.id);
  const access = await getHouseholdAccess(organization.id);
  const members = await getMemberOptionsForHousehold();

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/households"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Households
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Add Household
        </h1>
      </header>

      <HouseholdForm mode="create" members={members} canEdit={access.canCreate} />
    </div>
  );
}
