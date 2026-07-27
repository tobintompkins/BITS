import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCareAccess,
  getPrayerRequestById,
} from "@/app/(staff)/care/actions";
import { PrayerRequestDetailActions } from "@/components/care/prayer-request-detail-actions";
import {
  PrayerPrivacyBadge,
  PrayerStatusBadge,
} from "@/components/care/status-badges";
import { formatStaffLabel } from "@/components/care/care-form-utils";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PrayerRequestDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PrayerRequestDetailPage({
  params,
}: PrayerRequestDetailPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewPrayerRequests) {
    redirect("/dashboard");
  }

  let request;
  try {
    request = await getPrayerRequestById(id);
  } catch {
    redirect("/prayer-requests");
  }

  if (!request) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/prayer-requests"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Prayer Requests
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Prayer Request
          </h1>
          <PrayerStatusBadge status={request.status} />
          <PrayerPrivacyBadge privacyLevel={request.privacyLevel} />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {request.member ? (
            <Link
              href={`/member/${request.member.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {getMemberDisplayName(request.member)}
            </Link>
          ) : (
            request.requesterName || "Anonymous requester"
          )}
        </p>
      </header>

      <PrayerRequestDetailActions
        prayerRequestId={request.id}
        memberId={request.memberId}
        status={request.status}
        canManage={access.canManagePrayerRequests}
        canDelete={access.canDelete}
        isPublic={request.isPublic}
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Assigned To
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {request.assignedTo ? formatStaffLabel(request.assignedTo) : "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Created By
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {request.createdBy
                ? formatStaffLabel(request.createdBy)
                : "Submitted from public guest page"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Answered
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {request.answeredAt ? request.answeredAt.toISOString().slice(0, 10) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Created
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {request.createdAt.toISOString().slice(0, 10)}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Request</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {request.request}
          </p>
        </div>

        {request.answerNotes ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Answer Notes
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {request.answerNotes}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
