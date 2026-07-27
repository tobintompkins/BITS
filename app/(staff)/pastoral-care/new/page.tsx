import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCareAccess,
  getStaffUserOptions,
} from "@/app/(staff)/care/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import {
  PastoralCareForm,
  emptyPastoralCareFormValues,
} from "@/components/care/pastoral-care-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type NewPastoralCarePageProps = {
  searchParams: Promise<{ memberId?: string }>;
};

export default async function NewPastoralCarePage({
  searchParams,
}: NewPastoralCarePageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canManagePastoralCare) {
    redirect("/dashboard");
  }

  const [members, staffUsers] = await Promise.all([
    getMemberSelectOptions(),
    getStaffUserOptions(),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/pastoral-care"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Pastoral Care
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Add Pastoral Care Note
        </h1>
      </header>

      <PastoralCareForm
        mode="create"
        members={members}
        staffUsers={staffUsers}
        initialValues={{
          ...emptyPastoralCareFormValues,
          memberId: params.memberId ?? "",
        }}
        canEdit
        canMarkConfidential={access.canViewConfidentialPastoralCare}
        lockMember={Boolean(params.memberId)}
      />
    </div>
  );
}
