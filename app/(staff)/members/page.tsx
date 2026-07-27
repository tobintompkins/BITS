import { Suspense } from "react";
import { redirect } from "next/navigation";

import { MemberDirectory } from "@/components/members/member-directory";
import {
  MemberRecordStatus,
  MembershipStatus,
} from "@/app/generated/prisma/client";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import { getMemberLifecycleAccess } from "@/lib/auth/member-lifecycle-permissions";
import {
  getMemberHouseholdOptions,
  getMembersDirectoryPage,
} from "@/app/(staff)/member/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type MembersPageProps = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    householdId?: string;
    recordStatus?: string;
    doNotContact?: string;
    directoryOptOut?: string;
    allowEmail?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getMemberAccess(organization.id);
  const lifecycleAccess = await getMemberLifecycleAccess(organization.id);

  if (!access.canView) {
    redirect("/dashboard");
  }

  const membershipStatus = Object.values(MembershipStatus).includes(
    params.status as MembershipStatus,
  )
    ? (params.status as MembershipStatus)
    : undefined;

  const recordStatus = Object.values(MemberRecordStatus).includes(
    params.recordStatus as MemberRecordStatus,
  )
    ? (params.recordStatus as MemberRecordStatus)
    : undefined;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(params.pageSize ?? "25", 10) || 25),
  );

  const [directory, households] = await Promise.all([
    getMembersDirectoryPage({
      search: params.search,
      membershipStatus,
      householdId: params.householdId,
      recordStatus,
      includeArchived:
        recordStatus === "ARCHIVED" || lifecycleAccess.canViewArchived
          ? recordStatus === "ARCHIVED"
          : false,
      includeDeceased: recordStatus === "DECEASED",
      doNotContact: params.doNotContact === "1",
      directoryOptOut: params.directoryOptOut === "1",
      allowEmail: params.allowEmail === "0" ? false : undefined,
      page,
      pageSize,
    }),
    getMemberHouseholdOptions(),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Member Management
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Members
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Search, filter, and manage church members. Merged records are hidden
          from the default directory.
        </p>
      </header>

      <Suspense fallback={<p className="text-sm text-zinc-500">Loading members...</p>}>
        <MemberDirectory
          members={directory.members}
          total={directory.total}
          page={directory.page}
          pageSize={directory.pageSize}
          households={households}
          canCreate={access.canCreate}
          canImportExport={access.canImportExport}
          canReviewDuplicates={lifecycleAccess.canReviewDuplicates}
          membershipStatuses={Object.values(MembershipStatus)}
        />
      </Suspense>
    </div>
  );
}
