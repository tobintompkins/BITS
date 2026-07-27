import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCareAccess,
  getPastoralCareNoteById,
} from "@/app/(staff)/care/actions";
import { PastoralCareDetailActions } from "@/components/care/pastoral-care-detail-actions";
import { formatStaffLabel } from "@/components/care/care-form-utils";
import {
  formatEnumLabel,
  pastoralCareCategoryOptions,
} from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PastoralCareDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PastoralCareDetailPage({
  params,
}: PastoralCareDetailPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewPastoralCare) {
    redirect("/dashboard");
  }

  let note;
  try {
    note = await getPastoralCareNoteById(id);
  } catch {
    redirect("/pastoral-care");
  }

  if (!note) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/pastoral-care"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Pastoral Care
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            {note.title}
          </h1>
          {note.isConfidential ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Confidential
            </span>
          ) : null}
          {note.resolvedAt ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              Resolved
            </span>
          ) : null}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          <Link
            href={`/member/${note.member.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {getMemberDisplayName(note.member)}
          </Link>
          {" · "}
          {formatEnumLabel(pastoralCareCategoryOptions, note.category)}
        </p>
      </header>

      <PastoralCareDetailActions
        noteId={note.id}
        memberId={note.memberId}
        resolvedAt={note.resolvedAt}
        canManage={access.canManagePastoralCare}
        canDelete={access.canDelete}
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Assigned Pastor
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {note.assignedPastor ? formatStaffLabel(note.assignedPastor) : "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Follow-Up Date
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {note.followUpDate ? note.followUpDate.toISOString().slice(0, 10) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Created By
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {formatStaffLabel(note.createdBy)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Created
            </dt>
            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
              {note.createdAt.toISOString().slice(0, 10)}
            </dd>
          </div>
        </dl>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Note</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {note.note}
          </p>
        </div>
      </section>
    </div>
  );
}
