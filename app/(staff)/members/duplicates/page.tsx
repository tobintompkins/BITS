import { Suspense } from "react";
import { redirect } from "next/navigation";

import { DuplicateReviewDirectory } from "@/components/members/duplicate-review-directory";
import {
  getDuplicateCandidatesForPage,
  getDuplicateReviewSummary,
  getMemberLifecycleAccessForOrg,
} from "@/app/(staff)/member-lifecycle/actions";
import type { DuplicateCandidateStatus } from "@/app/generated/prisma/client";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    search?: string;
    highConfidence?: string;
    page?: string;
  }>;
};

export default async function DuplicatesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getMemberLifecycleAccessForOrg();
  if (!access.canReviewDuplicates) redirect("/members");

  const statusValues = [
    "PENDING",
    "CONFIRMED_DUPLICATE",
    "NOT_DUPLICATE",
    "MERGED",
    "DISMISSED",
  ];
  const status = statusValues.includes(params.status ?? "")
    ? (params.status as DuplicateCandidateStatus)
    : undefined;

  const [{ records, total }, summary] = await Promise.all([
    getDuplicateCandidatesForPage({
      status,
      search: params.search,
      highConfidenceOnly: params.highConfidence === "1",
      page: params.page ? Number(params.page) : 1,
    }),
    getDuplicateReviewSummary(),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Member Management
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Duplicate Review
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Review possible duplicate member records. Nothing is merged
          automatically.
        </p>
      </header>

      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <DuplicateReviewDirectory
          candidates={records.map((record) => ({
            ...record,
            matchReasons: record.matchReasons,
          }))}
          total={total}
          summary={summary}
          access={access}
        />
      </Suspense>
    </div>
  );
}
