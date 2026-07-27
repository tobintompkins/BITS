"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import type { MembershipStatus } from "@/app/generated/prisma/client";
import { MemberExportButton } from "@/components/members/member-import-export";
import {
  DoNotContactBadge,
  MemberRecordStatusBadge,
} from "@/components/members/member-lifecycle-badges";
import { formatMembershipStatus } from "@/lib/constants/membership-status";
import { getMemberDisplayName } from "@/lib/utils/member-display";

type MemberRecord = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  suffix: string | null;
  email: string | null;
  phone: string | null;
  membershipStatus: MembershipStatus;
  recordStatus: string;
  preferredContactMethod: string | null;
  updatedAt: Date;
  householdLinks: Array<{
    household: { id: string; householdName: string };
  }>;
};

type HouseholdOption = {
  id: string;
  householdName: string;
};

type MemberDirectoryProps = {
  members: MemberRecord[];
  total: number;
  page: number;
  pageSize: number;
  households: HouseholdOption[];
  canCreate: boolean;
  canImportExport: boolean;
  canReviewDuplicates?: boolean;
  membershipStatuses: MembershipStatus[];
};

const quickFilters = [
  { label: "Active", params: { recordStatus: "ACTIVE" } },
  { label: "Inactive", params: { recordStatus: "INACTIVE" } },
  { label: "Archived", params: { recordStatus: "ARCHIVED" } },
  { label: "Deceased", params: { recordStatus: "DECEASED" } },
  { label: "Do Not Contact", params: { doNotContact: "1" } },
  { label: "Directory Opt-Out", params: { directoryOptOut: "1" } },
] as const;

const SEARCH_DEBOUNCE_MS = 300;

export function MemberDirectory({
  members,
  total,
  page,
  pageSize,
  households,
  canCreate,
  canImportExport,
  canReviewDuplicates,
  membershipStatuses,
}: MemberDirectoryProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const householdId = searchParams.get("householdId") ?? "";
  const recordStatus = searchParams.get("recordStatus") ?? "";

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  function updateFilters(
    next: Record<string, string>,
    options?: { resetPage?: boolean },
  ) {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(next).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    if (options?.resetPage !== false) {
      params.delete("page");
    }

    startTransition(() => {
      router.replace(`/members?${params.toString()}`);
    });
  }

  function onSearchChange(value: string) {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      updateFilters({ search: value });
    }, SEARCH_DEBOUNCE_MS);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {quickFilters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => updateFilters({ ...filter.params })}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
          >
            {filter.label}
          </button>
        ))}
        {canReviewDuplicates ? (
          <Link
            href="/members/duplicates"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
          >
            Duplicates
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() =>
            updateFilters({
              recordStatus: "",
              doNotContact: "",
              directoryOptOut: "",
              status: "",
            })
          }
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
        >
          Clear filters
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Search
            </span>
            <input
              type="search"
              defaultValue={search}
              placeholder="Search by name, email, or phone"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Membership Status
            </span>
            <select
              defaultValue={status}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              onChange={(event) => updateFilters({ status: event.target.value })}
            >
              <option value="">All statuses</option>
              {membershipStatuses.map((value) => (
                <option key={value} value={value}>
                  {formatMembershipStatus(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Record Status
            </span>
            <select
              defaultValue={recordStatus}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              onChange={(event) =>
                updateFilters({ recordStatus: event.target.value })
              }
            >
              <option value="">Default (hide merged/archived/deceased)</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ARCHIVED">Archived</option>
              <option value="DECEASED">Deceased</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Household
            </span>
            <select
              defaultValue={householdId}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              onChange={(event) =>
                updateFilters({ householdId: event.target.value })
              }
            >
              <option value="">All households</option>
              {households.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.householdName}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          {canImportExport ? (
            <>
              <Link
                href="/members/import"
                className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                Import
              </Link>
              <MemberExportButton
                search={search}
                status={status}
                householdId={householdId}
              />
            </>
          ) : null}
          {canCreate ? (
            <Link
              href="/member/new"
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Add Member
            </Link>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading members...</p>
      ) : null}

      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        {total === 0
          ? "No members match the current filters."
          : `Showing ${from}–${to} of ${total} members`}
      </p>

      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            No members found
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {canCreate
              ? "Get started by adding your first church member."
              : "No members match the current filters."}
          </p>
          {canCreate ? (
            <Link
              href="/member/new"
              className="mt-4 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Add Member
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
              <thead className="bg-zinc-50 dark:bg-zinc-950">
                <tr>
                  {[
                    "Name",
                    "Email",
                    "Phone",
                    "Membership",
                    "Record",
                    "Household",
                    "Last Updated",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      <div className="flex flex-wrap items-center gap-2">
                        {getMemberDisplayName(member)}
                        {member.preferredContactMethod === "DO_NOT_CONTACT" ? (
                          <DoNotContactBadge />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                      {member.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                      {member.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                      {formatMembershipStatus(member.membershipStatus)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <MemberRecordStatusBadge status={member.recordStatus} />
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                      {member.householdLinks[0]?.household.householdName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                      {new Date(member.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-3">
                        <Link
                          href={`/member/${member.id}`}
                          className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                        >
                          View
                        </Link>
                        <Link
                          href={`/member/${member.id}/edit`}
                          className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={page <= 1 || isPending}
            onClick={() =>
              updateFilters({ page: String(page - 1) }, { resetPage: false })
            }
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            Previous
          </button>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Page {page} of {totalPages}
          </p>
          <button
            type="button"
            disabled={page >= totalPages || isPending}
            onClick={() =>
              updateFilters({ page: String(page + 1) }, { resetPage: false })
            }
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
