"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  formatEngagementEnumLabel,
  ministryTypeOptions,
} from "@/lib/constants/member-engagement";

type MinistryRecord = {
  id: string;
  name: string;
  description: string | null;
  ministryType: string;
  isActive: boolean;
  meetingSchedule: string | null;
  location: string | null;
  leader: { id: string; displayName: string | null; primaryEmail: string } | null;
  _count: { members: number };
  members: Array<{
    id: string;
    member: { firstName: string; lastName: string; preferredName: string | null };
  }>;
};

export function MinistryDirectory({
  ministries,
  canCreate,
}: {
  ministries: MinistryRecord[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const search = searchParams.get("search") ?? "";

  function updateSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("search", value);
    else params.delete("search");
    startTransition(() => {
      router.push(`/ministries?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Ministries
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Teams, leaders, and volunteer rosters.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/ministries/new"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add Ministry
          </Link>
        ) : null}
      </header>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Search</span>
          <input
            type="search"
            defaultValue={search}
            placeholder="Search ministries"
            onChange={(event) => updateSearch(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      {ministries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            No ministries found
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {search ? "Try a different search term." : "Create your first ministry to get started."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {ministries.map((ministry) => (
                <tr
                  key={ministry.id}
                  className={`border-b border-zinc-100 dark:border-zinc-800 ${isPending ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {ministry.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {formatEngagementEnumLabel(ministryTypeOptions, ministry.ministryType)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {ministry._count.members}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {ministry.isActive ? "Active" : "Inactive"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/ministries/${ministry.id}`}
                      className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
