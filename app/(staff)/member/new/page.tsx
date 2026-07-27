import Link from "next/link";
import { redirect } from "next/navigation";

import { MemberForm } from "@/components/members/member-form";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import {
  getMemberHouseholdOptions,
  requireMemberViewAccess,
} from "@/app/(staff)/member/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function NewMemberPage() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  await requireMemberViewAccess(organization.id);
  const access = await getMemberAccess(organization.id);

  if (!access.canCreate) {
    redirect("/members");
  }

  const households = await getMemberHouseholdOptions();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/members"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Members
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Add Member
        </h1>
      </header>

      <MemberForm mode="create" households={households} canEdit={access.canCreate} />
    </div>
  );
}
