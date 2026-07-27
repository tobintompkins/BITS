"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import {
  confirmDuplicateAction,
  dismissDuplicateAction,
  markNotDuplicateAction,
  runDuplicateScanAction,
} from "@/app/(staff)/member-lifecycle/actions";
import type { MemberLifecycleAccess } from "@/lib/auth/member-lifecycle-permissions";
import {
  DUPLICATE_HIGH_CONFIDENCE_THRESHOLD,
  duplicateCandidateStatusOptions,
  formatLifecycleEnumLabel,
} from "@/lib/constants/member-lifecycle";
import { getMemberDisplayName } from "@/lib/utils/member-display";

type Candidate = {
  id: string;
  matchScore: number;
  matchReasons: unknown;
  status: string;
  createdAt: Date;
  memberA: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    email: string | null;
  };
  memberB: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    email: string | null;
  };
};

type Summary = {
  pendingDuplicates: number;
  highConfidenceDuplicates: number;
  confirmedDuplicates: number;
  mergedThisMonth: number;
  dismissedCandidates: number;
};

export function DuplicateReviewDirectory({
  candidates,
  total,
  summary,
  access,
}: {
  candidates: Candidate[];
  total: number;
  summary: Summary;
  access: MemberLifecycleAccess;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";
  const highConfidence = searchParams.get("highConfidence") === "1";

  function updateFilters(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    startTransition(() => {
      router.replace(`/members/duplicates?${params.toString()}`);
    });
  }

  function runAction(action: () => Promise<{ status: string; message: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.status === "error") {
          setError(result.message);
          return;
        }
        setMessage(result.message);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  const cards = [
    { label: "Pending Review", count: summary.pendingDuplicates, href: "?status=PENDING" },
    {
      label: "High-Confidence",
      count: summary.highConfidenceDuplicates,
      href: "?highConfidence=1",
    },
    {
      label: "Confirmed",
      count: summary.confirmedDuplicates,
      href: "?status=CONFIRMED_DUPLICATE",
    },
    { label: "Merged This Month", count: summary.mergedThisMonth, href: "?status=MERGED" },
    { label: "Dismissed", count: summary.dismissedCandidates, href: "?status=DISMISSED" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={`/members/duplicates${card.href}`}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {card.count}
            </p>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Search</span>
            <input
              type="search"
              defaultValue={search}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => updateFilters({ search: event.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Status</span>
            <select
              defaultValue={status}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              onChange={(event) => updateFilters({ status: event.target.value })}
            >
              <option value="">All</option>
              {duplicateCandidateStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-md border px-3 py-2 text-sm ${
              highConfidence
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
            onClick={() =>
              updateFilters({ highConfidence: highConfidence ? "" : "1" })
            }
          >
            High confidence (≥{DUPLICATE_HIGH_CONFIDENCE_THRESHOLD})
          </button>
          {access.canRunDuplicateScan ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(() => runDuplicateScanAction())}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isPending ? "Scanning..." : "Run Duplicate Scan"}
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <p className="text-sm text-zinc-500">{total} candidate(s)</p>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-950">
              <tr>
                {[
                  "Member A",
                  "Member B",
                  "Score",
                  "Reasons",
                  "Status",
                  "Created",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {candidates.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-zinc-500"
                  >
                    No duplicate candidates found.
                  </td>
                </tr>
              ) : (
                candidates.map((candidate) => {
                  const reasons = Array.isArray(candidate.matchReasons)
                    ? (candidate.matchReasons as string[])
                    : [];
                  return (
                    <tr key={candidate.id}>
                      <td className="px-4 py-3 text-sm">
                        <Link
                          href={`/member/${candidate.memberA.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {getMemberDisplayName(candidate.memberA)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Link
                          href={`/member/${candidate.memberB.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {getMemberDisplayName(candidate.memberB)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {candidate.matchScore}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                        {reasons.slice(0, 2).join("; ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {formatLifecycleEnumLabel(
                          duplicateCandidateStatusOptions,
                          candidate.status,
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {candidate.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/members/duplicates/${candidate.id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            Review
                          </Link>
                          {access.canMergeMembers &&
                          (candidate.status === "PENDING" ||
                            candidate.status === "CONFIRMED_DUPLICATE") ? (
                            <Link
                              href={`/members/merge?candidate=${candidate.id}`}
                              className="underline-offset-2 hover:underline"
                            >
                              Merge
                            </Link>
                          ) : null}
                          {candidate.status === "PENDING" ? (
                            <>
                              <button
                                type="button"
                                className="underline-offset-2 hover:underline"
                                onClick={() => {
                                  const fd = new FormData();
                                  fd.set("candidateId", candidate.id);
                                  runAction(() => confirmDuplicateAction(fd));
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="underline-offset-2 hover:underline"
                                onClick={() => {
                                  const fd = new FormData();
                                  fd.set("candidateId", candidate.id);
                                  runAction(() => markNotDuplicateAction(fd));
                                }}
                              >
                                Not Duplicate
                              </button>
                              <button
                                type="button"
                                className="underline-offset-2 hover:underline"
                                onClick={() => {
                                  const fd = new FormData();
                                  fd.set("candidateId", candidate.id);
                                  runAction(() => dismissDuplicateAction(fd));
                                }}
                              >
                                Dismiss
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
