import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DuplicateComparison } from "@/components/members/duplicate-comparison";
import {
  getDuplicateCandidateById,
  getMemberLifecycleAccessForOrg,
} from "@/app/(staff)/member-lifecycle/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DuplicateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getMemberLifecycleAccessForOrg();
  if (!access.canReviewDuplicates) redirect("/members");

  const detail = await getDuplicateCandidateById(id);
  if (!detail || !detail.memberA || !detail.memberB) notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/members/duplicates"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Duplicate Review
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Compare Possible Duplicates
        </h1>
      </header>

      <DuplicateComparison
        candidateId={detail.candidate.id}
        matchScore={detail.candidate.matchScore}
        matchReasons={detail.candidate.matchReasons}
        status={detail.candidate.status}
        memberA={detail.memberA}
        memberB={detail.memberB}
        access={access}
      />
    </div>
  );
}
