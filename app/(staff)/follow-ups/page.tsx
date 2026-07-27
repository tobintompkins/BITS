import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCareAccess,
  getFollowUpDashboardCounts,
  getFollowUps,
  getStaffUserOptions,
} from "@/app/(staff)/care/actions";
import {
  FollowUpPriorityBadge,
  FollowUpStatusBadge,
} from "@/components/care/status-badges";
import {
  followUpPriorityOptions,
  followUpStatusOptions,
  followUpTypeOptions,
  formatEnumLabel,
} from "@/lib/constants/care-engagement";
import { formatStaffLabel } from "@/components/care/care-form-utils";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type FollowUpsPageProps = {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    followUpType?: string;
    assignedToUserId?: string;
    page?: string;
  }>;
};

export default async function FollowUpsPage({ searchParams }: FollowUpsPageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewFollowUps) {
    redirect("/dashboard");
  }

  const status = followUpStatusOptions.some((option) => option.value === params.status)
    ? (params.status as (typeof followUpStatusOptions)[number]["value"])
    : undefined;
  const priority = followUpPriorityOptions.some(
    (option) => option.value === params.priority,
  )
    ? (params.priority as (typeof followUpPriorityOptions)[number]["value"])
    : undefined;
  const followUpType = followUpTypeOptions.some(
    (option) => option.value === params.followUpType,
  )
    ? (params.followUpType as (typeof followUpTypeOptions)[number]["value"])
    : undefined;

  const page = Number(params.page ?? "1") || 1;

  const [counts, staffUsers, { records, total }] = await Promise.all([
    getFollowUpDashboardCounts(),
    getStaffUserOptions(),
    getFollowUps({
      status,
      priority,
      followUpType,
      assignedToUserId: params.assignedToUserId,
      page,
    }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Care Engagement
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Follow-Ups
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Manage visitor welcome, outreach tasks, and member care follow-ups.
          </p>
        </div>
        {access.canManageFollowUps ? (
          <Link
            href="/follow-ups/new"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add Follow-Up
          </Link>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Open", value: counts.open },
          { label: "In Progress", value: counts.inProgress },
          { label: "Overdue", value: counts.overdue },
          { label: "Due Today", value: counts.dueToday },
          { label: "Completed This Month", value: counts.completedThisMonth },
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

      <form
        method="get"
        className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Status</span>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All statuses</option>
            {followUpStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Priority</span>
          <select
            name="priority"
            defaultValue={params.priority ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All priorities</option>
            {followUpPriorityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Type</span>
          <select
            name="followUpType"
            defaultValue={params.followUpType ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All types</option>
            {followUpTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Assigned To
          </span>
          <select
            name="assignedToUserId"
            defaultValue={params.assignedToUserId ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Anyone</option>
            {staffUsers.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {formatStaffLabel(staff)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900/80">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                Subject
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                Member
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                Type
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                Priority
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                Due
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-zinc-600 dark:text-zinc-300"
                >
                  No follow-ups found.
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/follow-ups/${record.id}`}
                      className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                    >
                      {record.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/member/${record.member.id}`}
                      className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
                    >
                      {getMemberDisplayName(record.member)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {formatEnumLabel(followUpTypeOptions, record.followUpType)}
                  </td>
                  <td className="px-4 py-3">
                    <FollowUpStatusBadge status={record.status} />
                  </td>
                  <td className="px-4 py-3">
                    <FollowUpPriorityBadge priority={record.priority} />
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {record.dueDate ? record.dueDate.toISOString().slice(0, 10) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 25 ? (
        <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300">
          <span>
            Page {page} of {Math.ceil(total / 25)}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/follow-ups?${new URLSearchParams({
                  ...(params.status ? { status: params.status } : {}),
                  ...(params.priority ? { priority: params.priority } : {}),
                  ...(params.followUpType ? { followUpType: params.followUpType } : {}),
                  ...(params.assignedToUserId
                    ? { assignedToUserId: params.assignedToUserId }
                    : {}),
                  page: String(page - 1),
                }).toString()}`}
                className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
              >
                Previous
              </Link>
            ) : null}
            {page * 25 < total ? (
              <Link
                href={`/follow-ups?${new URLSearchParams({
                  ...(params.status ? { status: params.status } : {}),
                  ...(params.priority ? { priority: params.priority } : {}),
                  ...(params.followUpType ? { followUpType: params.followUpType } : {}),
                  ...(params.assignedToUserId
                    ? { assignedToUserId: params.assignedToUserId }
                    : {}),
                  page: String(page + 1),
                }).toString()}`}
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
