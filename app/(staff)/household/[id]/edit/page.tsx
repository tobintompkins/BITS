import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { HouseholdForm } from "@/components/households/household-form";
import {
  getHouseholdAccess,
  requireHouseholdEditAccess,
} from "@/lib/auth/household-permissions";
import { toHouseholdFormValues } from "@/lib/validation/household";
import {
  getHouseholdById,
  getMemberOptionsForHousehold,
} from "@/app/(staff)/household/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type EditHouseholdPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditHouseholdPage({ params }: EditHouseholdPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  await requireHouseholdEditAccess(organization.id);
  const access = await getHouseholdAccess(organization.id);
  const [household, members] = await Promise.all([
    getHouseholdById(id),
    getMemberOptionsForHousehold(),
  ]);

  if (!household) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/household/${household.id}`}
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Household
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Edit {household.householdName}
        </h1>
      </header>

      <HouseholdForm
        mode="edit"
        householdId={household.id}
        initialValues={toHouseholdFormValues(household)}
        members={members}
        canEdit={access.canEdit}
      />
    </div>
  );
}
