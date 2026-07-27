"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { getMemberDisplayName } from "@/lib/utils/member-display";

type HouseholdRecord = {
  id: string;
  householdName: string;
  city: string | null;
  state: string | null;
  updatedAt: Date;
  primaryContact: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
  } | null;
  _count: { memberLinks: number };
};

type HouseholdDirectoryProps = {
  households: HouseholdRecord[];
  canCreate: boolean;
};

export function HouseholdDirectory({
  households,
  canCreate,
}: HouseholdDirectoryProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const search = searchParams.get("search") ?? "";

  function updateSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }

    startTransition(() => {
      router.push(`/households?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Households
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Manage member households and primary contacts.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/household/new"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Add Household
          </Link>
        ) : null}
      </header>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Search</span>
          <input
            type="search"
            defaultValue={search}
            placeholder="Search by name, city, or state"
            onChange={(event) => updateSearch(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>

      {households.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            No households found
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {search
              ? "Try a different search term."
              : "Create your first household to get started."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Household Name</th>
                <th className="px-4 py-3">Primary Contact</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {households.map((household) => (
                <tr
                  key={household.id}
                  className={`border-b border-zinc-100 dark:border-zinc-800 ${isPending ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {household.householdName}
                  </td>
                  <td className="px-4 py-3">
                    {household.primaryContact
                      ? getMemberDisplayName(household.primaryContact)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{household.city ?? "—"}</td>
                  <td className="px-4 py-3">{household.state ?? "—"}</td>
                  <td className="px-4 py-3">{household._count.memberLinks}</td>
                  <td className="px-4 py-3">
                    {household.updatedAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <Link
                        href={`/household/${household.id}`}
                        className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                      >
                        View
                      </Link>
                      <Link
                        href={`/household/${household.id}/edit`}
                        className="font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
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
      )}
    </div>
  );
}
