import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCareAccess,
  getPrayerRequests,
  getStaffUserOptions,
} from "@/app/(staff)/care/actions";
import {
  PrayerPrivacyBadge,
  PrayerStatusBadge,
} from "@/components/care/status-badges";
import { formatStaffLabel } from "@/components/care/care-form-utils";
import {
  prayerPrivacyLevelOptions,
  prayerRequestStatusOptions,
} from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type PrayerRequestsPageProps = {
  searchParams: Promise<{
    status?: string;
    privacyLevel?: string;
    assignedToUserId?: string;
    page?: string;
  }>;
};

export default async function PrayerRequestsPage({
  searchParams,
}: PrayerRequestsPageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewPrayerRequests) {
    redirect("/dashboard");
  }

  const status = prayerRequestStatusOptions.some(
    (option) => option.value === params.status,
  )
    ? (params.status as (typeof prayerRequestStatusOptions)[number]["value"])
    : undefined;
  const privacyLevel = prayerPrivacyLevelOptions.some(
    (option) => option.value === params.privacyLevel,
  )
    ? (params.privacyLevel as (typeof prayerPrivacyLevelOptions)[number]["value"])
    : undefined;

  const page = Number(params.page ?? "1") || 1;

  const [staffUsers, { records, total }] = await Promise.all([
    getStaffUserOptions(),
    getPrayerRequests({
      status,
      privacyLevel,
      assignedToUserId: params.assignedToUserId,
      page,
    }),
  ]);

  const activeCount = records.filter((record) =>
    ["ACTIVE", "IN_PRAYER"].includes(record.status),
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Care Engagement
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Prayer Requests
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Track prayer needs, assignments, and answered prayers.
          </p>
        </div>
        {access.canManagePrayerRequests ? (
          <Link
            href="/prayer-requests/new"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add Prayer Request
          </Link>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {[
          { label: "Total matching", value: total },
          { label: "Active (page)", value: activeCount },
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
        className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Status</span>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All statuses</option>
            {prayerRequestStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Privacy Level
          </span>
          <select
            name="privacyLevel"
            defaultValue={params.privacyLevel ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All levels</option>
            {prayerPrivacyLevelOptions.map((option) => (
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
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Apply filters
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              No prayer requests found.
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
                      href={`/prayer-requests/${record.id}`}
                      className="font-semibold text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                    >
                      Prayer Request
                    </Link>
                    <PrayerStatusBadge status={record.status} />
                    <PrayerPrivacyBadge privacyLevel={record.privacyLevel} />
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">{record.request}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {record.member
                      ? getMemberDisplayName(record.member)
                      : record.requesterName || "Anonymous"}
                    {record.assignedTo
                      ? ` · Assigned to ${formatStaffLabel(record.assignedTo)}`
                      : ""}
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
                href={`/prayer-requests?${new URLSearchParams({
                  ...(params.status ? { status: params.status } : {}),
                  ...(params.privacyLevel ? { privacyLevel: params.privacyLevel } : {}),
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
                href={`/prayer-requests?${new URLSearchParams({
                  ...(params.status ? { status: params.status } : {}),
                  ...(params.privacyLevel ? { privacyLevel: params.privacyLevel } : {}),
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
