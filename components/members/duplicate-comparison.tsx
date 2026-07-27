"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  confirmDuplicateAction,
  dismissDuplicateAction,
  markNotDuplicateAction,
  reopenDuplicateAction,
} from "@/app/(staff)/member-lifecycle/actions";
import type { MemberLifecycleAccess } from "@/lib/auth/member-lifecycle-permissions";
import {
  duplicateCandidateStatusOptions,
  formatLifecycleEnumLabel,
  memberRecordStatusOptions,
} from "@/lib/constants/member-lifecycle";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { MemberRecordStatusBadge } from "@/components/members/member-lifecycle-badges";

type SafeSide = {
  member: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    email: string | null;
    phone: string | null;
    dateOfBirth: Date | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    membershipStatus: string;
    recordStatus: string;
  };
  counts: Record<string, number>;
};

function ComparisonSide({ side, label }: { side: SafeSide; label: string }) {
  const m = side.member;
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <Link href={`/member/${m.id}`} className="hover:underline">
              {getMemberDisplayName(m)}
            </Link>
          </h2>
        </div>
        <MemberRecordStatusBadge status={m.recordStatus} />
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Email</dt>
          <dd>{m.email ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Phone</dt>
          <dd>{m.phone ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Date of birth</dt>
          <dd>{m.dateOfBirth ? m.dateOfBirth.toLocaleDateString() : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Address</dt>
          <dd className="text-right">
            {[m.addressLine1, m.city, m.state, m.postalCode]
              .filter(Boolean)
              .join(", ") || "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Membership</dt>
          <dd>{m.membershipStatus}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-500">Record status</dt>
          <dd>
            {formatLifecycleEnumLabel(memberRecordStatusOptions, m.recordStatus)}
          </dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Related record counts
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">
          {Object.entries(side.counts).map(([key, value]) => (
            <li key={key} className="flex justify-between gap-2">
              <span className="text-zinc-500">{key}</span>
              <span>{value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          Confidential pastoral notes, private prayer text, and document URLs
          are not shown.
        </p>
      </div>
    </section>
  );
}

export function DuplicateComparison({
  candidateId,
  matchScore,
  matchReasons,
  status,
  memberA,
  memberB,
  access,
}: {
  candidateId: string;
  matchScore: number;
  matchReasons: string[];
  status: string;
  memberA: SafeSide;
  memberB: SafeSide;
  access: MemberLifecycleAccess;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<{ status: string; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-zinc-500">
              Status:{" "}
              {formatLifecycleEnumLabel(duplicateCandidateStatusOptions, status)}
            </p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Match score {matchScore}
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {matchReasons.join(" · ") || "No reasons recorded"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {access.canMergeMembers ? (
              <Link
                href={`/members/merge?candidate=${candidateId}`}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Begin Merge
              </Link>
            ) : null}
            {status === "PENDING" ? (
              <>
                <button
                  type="button"
                  disabled={isPending}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("candidateId", candidateId);
                    run(() => confirmDuplicateAction(fd));
                  }}
                >
                  Confirm Duplicate
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("candidateId", candidateId);
                    run(() => markNotDuplicateAction(fd));
                  }}
                >
                  Not Duplicate
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("candidateId", candidateId);
                    run(() => dismissDuplicateAction(fd));
                  }}
                >
                  Dismiss
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isPending}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                onClick={() => {
                  const fd = new FormData();
                  fd.set("candidateId", candidateId);
                  run(() => reopenDuplicateAction(fd));
                }}
              >
                Reopen
              </button>
            )}
          </div>
        </div>
        {message ? (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
            {message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ComparisonSide side={memberA} label="Member A" />
        <ComparisonSide side={memberB} label="Member B" />
      </div>
    </div>
  );
}

