import { redirect } from "next/navigation";

import { MemberImportForm } from "@/components/members/member-import-export";
import {
  getMemberAccess,
  requireMemberViewAccess,
} from "@/lib/auth/member-permissions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function MemberImportPage() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  await requireMemberViewAccess(organization.id);
  const access = await getMemberAccess(organization.id);

  if (!access.canImportExport) {
    redirect("/members");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Member Management
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Import Members
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Upload a CSV file, preview validation results, and import valid member
          rows.
        </p>
      </header>

      <MemberImportForm />
    </div>
  );
}
