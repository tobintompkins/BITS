import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getAttendanceRecords,
  getCareAccess,
} from "@/app/(staff)/care/actions";
import { AttendanceTypeBadge } from "@/components/care/status-badges";
import { attendanceTypeOptions } from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type AttendancePageProps = {
  searchParams: Promise<{
    search?: string;
    serviceName?: string;
    attendanceType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
};

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewAttendance) {
    redirect("/dashboard");
  }

  const attendanceType = attendanceTypeOptions.some(
    (option) => option.value === params.attendanceType,
  )
    ? (params.attendanceType as (typeof attendanceTypeOptions)[number]["value"])
    : undefined;

  const page = Number(params.page ?? "1") || 1;

  const { records, total } = await getAttendanceRecords({
    search: params.search,
    serviceName: params.serviceName,
    attendanceType,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    page,
  });

  const presentCount = records.filter((record) =>
    ["PRESENT", "ONLINE", "VOLUNTEER", "GUEST"].includes(record.attendanceType),
  ).length;
  const absentCount = records.filter((record) =>
    ["ABSENT", "EXCUSED"].includes(record.attendanceType),
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Care Engagement
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Attendance
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Track service attendance, guests, volunteers, and online participation.
          </p>
        </div>
        {access.canManageAttendance ? (
          <Link
            href="/attendance/new"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add Attendance
          </Link>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Total matching", value: total },
          { label: "Present (page)", value: presentCount },
          { label: "Absent / excused (page)", value: absentCount },
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
        className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Search</span>
          <input
            type="search"
            name="search"
            defaultValue={params.search ?? ""}
            placeholder="Member name"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Service</span>
          <input
            type="text"
            name="serviceName"
            defaultValue={params.serviceName ?? ""}
            placeholder="Sunday Service"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Type</span>
          <select
            name="attendanceType"
            defaultValue={params.attendanceType ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All types</option>
            {attendanceTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">From</span>
          <input
            type="date"
            name="dateFrom"
            defaultValue={params.dateFrom ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">To</span>
          <input
            type="date"
            name="dateTo"
            defaultValue={params.dateTo ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-5">
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
                Date
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                Member
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                Service
              </th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                Type
              </th>
              <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-600 dark:text-zinc-300"
                >
                  No attendance records found.
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                    {record.attendanceDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/member/${record.member.id}`}
                      className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                    >
                      {getMemberDisplayName(record.member)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {record.serviceName}
                  </td>
                  <td className="px-4 py-3">
                    <AttendanceTypeBadge type={record.attendanceType} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {access.canManageAttendance ? (
                      <Link
                        href={`/attendance/${record.id}/edit`}
                        className="font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-200"
                      >
                        Edit
                      </Link>
                    ) : (
                      "—"
                    )}
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
                href={`/attendance?${new URLSearchParams({
                  ...(params.search ? { search: params.search } : {}),
                  ...(params.serviceName ? { serviceName: params.serviceName } : {}),
                  ...(params.attendanceType ? { attendanceType: params.attendanceType } : {}),
                  ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
                  ...(params.dateTo ? { dateTo: params.dateTo } : {}),
                  page: String(page - 1),
                }).toString()}`}
                className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
              >
                Previous
              </Link>
            ) : null}
            {page * 25 < total ? (
              <Link
                href={`/attendance?${new URLSearchParams({
                  ...(params.search ? { search: params.search } : {}),
                  ...(params.serviceName ? { serviceName: params.serviceName } : {}),
                  ...(params.attendanceType ? { attendanceType: params.attendanceType } : {}),
                  ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
                  ...(params.dateTo ? { dateTo: params.dateTo } : {}),
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
