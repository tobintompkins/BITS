import { redirect } from "next/navigation";

import { MemberMergeWizard } from "@/components/members/member-merge-wizard";
import {
  getDuplicateCandidateById,
  getMemberLifecycleAccessForOrg,
  prepareMemberMerge,
} from "@/app/(staff)/member-lifecycle/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { orderMemberPairIds } from "@/lib/members/duplicate-scoring";

type PageProps = {
  searchParams: Promise<{
    primary?: string;
    duplicate?: string;
    candidate?: string;
  }>;
};

export default async function MemberMergePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getMemberLifecycleAccessForOrg();
  if (!access.canMergeMembers) redirect("/members");

  let primaryId = params.primary;
  let duplicateId = params.duplicate;

  if (params.candidate) {
    const detail = await getDuplicateCandidateById(params.candidate);
    if (detail) {
      primaryId = detail.candidate ? detail.memberA?.member.id : primaryId;
      duplicateId = detail.memberB?.member.id;
      // Prefer recommended ordering later in prepare
      if (detail.memberA && detail.memberB) {
        const [a, b] = orderMemberPairIds(
          detail.memberA.member.id,
          detail.memberB.member.id,
        );
        primaryId = a;
        duplicateId = b;
      }
    }
  }

  let initialPrepare = null;
  if (primaryId && duplicateId) {
    try {
      initialPrepare = await prepareMemberMerge(primaryId, duplicateId);
    } catch {
      initialPrepare = null;
    }
  }

  const memberOptions = await getMemberSelectOptions();

  const serializedPrepare = initialPrepare
    ? {
        primary: {
          ...initialPrepare.primary,
          dateOfBirth: initialPrepare.primary.dateOfBirth,
        },
        duplicate: {
          ...initialPrepare.duplicate,
          dateOfBirth: initialPrepare.duplicate.dateOfBirth,
        },
        primaryCounts: initialPrepare.primaryCounts,
        duplicateCounts: initialPrepare.duplicateCounts,
        recommendedPrimaryId: initialPrepare.recommendedPrimaryId,
        recommendationReasons: initialPrepare.recommendationReasons,
        fieldComparisons: initialPrepare.fieldComparisons,
        requiresArchivedConfirmation:
          initialPrepare.requiresArchivedConfirmation,
      }
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Member Management
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Merge Members
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Safely merge a duplicate record into a primary member. Type MERGE to
          confirm before executing.
        </p>
      </header>

      <MemberMergeWizard
        initialPrepare={serializedPrepare}
        memberOptions={memberOptions}
      />
    </div>
  );
}
