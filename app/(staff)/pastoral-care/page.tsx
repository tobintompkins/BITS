import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCareAccess,
  getPastoralCareNotes,
} from "@/app/(staff)/care/actions";
import { formatEnumLabel, pastoralCareCategoryOptions } from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PastoralCarePageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function PastoralCarePage({ searchParams }: PastoralCarePageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewPastoralCare) {
    redirect("/dashboard");
  }

  const page = Number(params.page ?? "1") || 1;
  const { records, total } = await getPastoralCareNotes({ page });

  const openCount = records.filter((record) => !record.resolvedAt).length;
  const confidentialCount = records.filter((record) => record.isConfidential).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Care Engagement
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Pastoral Care
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Pastoral notes, counseling sessions, and care follow-ups.
          </p>
        </div>
        {access.canManagePastoralCare ? (
          <Link
            href="/pastoral-care/new"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add Note
          </Link>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total matching", value: total },
          { label: "Open (page)", value: openCount },
          { label: "Confidential (page)", value: confidentialCount },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {card.label}
            </p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <div className="space-y-3">
        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              No pastoral care notes found.
            </p>
          </div>
        ) : (
          records.map((record) => (
            <article
              key={record.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/pastoral-care/${record.id}`}
                      className="text-lg font-semibold text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                    >
                      {record.title}
                    </Link>
                    {record.isConfidential ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Confidential
                      </span>
                    ) : null}
                    {record.resolvedAt ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                        Resolved
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    <Link
                      href={`/member/${record.member.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {getMemberDisplayName(record.member)}
                    </Link>
                    {" · "}
                    {formatEnumLabel(pastoralCareCategoryOptions, record.category)}
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">
                    {record.restricted ? "[Confidential — restricted]" : record.note}
                  </p>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {record.createdAt.toISOString().slice(0, 10)}
                </p>
              </div>
            </article>
          ))
        )}
      </div>

      {total > 25 ? (
        <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300">
          <span>
            Page {page} of {Math.ceil(total / 25)}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/pastoral-care?page=${page - 1}`}
                className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
              >
                Previous
              </Link>
            ) : null}
            {page * 25 < total ? (
              <Link
                href={`/pastoral-care?page=${page + 1}`}
                className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
