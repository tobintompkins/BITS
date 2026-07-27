import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCareAccess,
  getFollowUpById,
} from "@/app/(staff)/care/actions";
import { FollowUpDetailActions } from "@/components/care/follow-up-detail-actions";
import {
  FollowUpPriorityBadge,
  FollowUpStatusBadge,
} from "@/components/care/status-badges";
import { formatStaffLabel } from "@/components/care/care-form-utils";
import {
  followUpTypeOptions,
  formatEnumLabel,
} from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type FollowUpDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function FollowUpDetailPage({ params }: FollowUpDetailPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewFollowUps) {
    redirect("/dashboard");
  }

  const followUp = await getFollowUpById(id);

  if (!followUp) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/follow-ups"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Follow-Ups
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            {followUp.subject}
          </h1>
          <FollowUpStatusBadge status={followUp.status} />
          <FollowUpPriorityBadge priority={followUp.priority} />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          <Link
            href={`/member/${followUp.member.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {getMemberDisplayName(followUp.member)}
          </Link>
          {" · "}
          {formatEnumLabel(followUpTypeOptions, followUp.followUpType)}
        </p>
      </header>

      <FollowUpDetailActions
        followUpId={followUp.id}
        memberId={followUp.memberId}
        status={followUp.status}
        canManage={access.canManageFollowUps}
        canDelete={access.canDelete}
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Due Date
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {followUp.dueDate ? followUp.dueDate.toISOString().slice(0, 10) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Assigned To
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {followUp.assignedTo ? formatStaffLabel(followUp.assignedTo) : "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Created By
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {formatStaffLabel(followUp.createdBy)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Completed
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {followUp.completedAt
                ? followUp.completedAt.toISOString().slice(0, 10)
                : "—"}
            </dd>
          </div>
        </dl>

        {followUp.notes ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {followUp.notes}
            </p>
          </div>
        ) : null}

        {followUp.outcome ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Outcome</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {followUp.outcome}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
