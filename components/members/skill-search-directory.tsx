"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  formatEngagementEnumLabel,
  skillProficiencyLevelOptions,
} from "@/lib/constants/member-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";

type SkillRow = {
  id: string;
  skillName: string;
  skillCategory: string | null;
  proficiencyLevel: string;
  yearsExperience: number | null;
  isAvailableToServe: boolean;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    email: string | null;
    phone: string | null;
  };
};

export function SkillSearchDirectory({
  rows,
  canViewContact,
  canExport = false,
}: {
  rows: SkillRow[];
  canViewContact: boolean;
  canExport?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const search = searchParams.get("search") ?? "";
  const available = searchParams.get("available") === "1";

  function updateParams(next: { search?: string; available?: boolean }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.search !== undefined) {
      if (next.search) params.set("search", next.search);
      else params.delete("search");
    }
    if (next.available !== undefined) {
      if (next.available) params.set("available", "1");
      else params.delete("available");
    }
    startTransition(() => {
      router.push(`/members/skills?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Member Skills
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Find members by skill, category, or availability to serve.
          </p>
        </div>
        {canExport ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const { exportSkillsDirectoryCsvAction } = await import(
                  "@/app/(staff)/member-engagement/actions"
                );
                const csv = await exportSkillsDirectoryCsvAction({
                  skillName: search || undefined,
                  availableToServeOnly: available,
                });
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "member-skills.csv";
                anchor.click();
                URL.revokeObjectURL(url);
              })
            }
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Export CSV
          </button>
        ) : null}
      </header>

      <div className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-[1fr_auto]">
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Search</span>
          <input
            type="search"
            defaultValue={search}
            placeholder="Skill, category, or member name"
            onChange={(event) => updateParams({ search: event.target.value })}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={available}
            onChange={(event) => updateParams({ available: event.target.checked })}
          />
          Available to serve only
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">No matching skills found.</p>
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${isPending ? "opacity-60" : ""}`}>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Skill</th>
                <th className="px-4 py-3">Proficiency</th>
                <th className="px-4 py-3">Available</th>
                {canViewContact ? <th className="px-4 py-3">Contact</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-3">
                    <Link
                      href={`/member/${row.member.id}`}
                      className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                    >
                      {getMemberDisplayName(row.member)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {row.skillName}
                    {row.skillCategory ? (
                      <span className="block text-xs text-zinc-500">{row.skillCategory}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {formatEngagementEnumLabel(
                      skillProficiencyLevelOptions,
                      row.proficiencyLevel,
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {row.isAvailableToServe ? "Yes" : "No"}
                  </td>
                  {canViewContact ? (
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {[row.member.email, row.member.phone].filter(Boolean).join(" · ") || "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
