"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveMemberAction,
  markMemberActiveAction,
  markMemberDeceasedAction,
  markMemberInactiveAction,
  restoreMemberAction,
} from "@/app/(staff)/member-lifecycle/actions";
import type { MemberLifecycleAccess } from "@/lib/auth/member-lifecycle-permissions";
import { archiveReasonOptions } from "@/lib/constants/member-lifecycle";
import { MemberRecordStatusBadge } from "@/components/members/member-lifecycle-badges";

type LifecycleSummary = {
  recordStatus: string;
  archivedAt: Date | null;
  archiveReason: string | null;
  deceasedDate: Date | null;
  deceasedNotes: string | null;
  preferredContactMethod: string | null;
};

export function MemberLifecyclePanel({
  memberId,
  summary,
  access,
}: {
  memberId: string;
  summary: LifecycleSummary;
  access: MemberLifecycleAccess;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showDeceased, setShowDeceased] = useState(false);

  function run(action: () => Promise<{ status: string; message: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.status === "error") {
          setError(result.message);
          return;
        }
        setMessage(result.message);
        setShowArchive(false);
        setShowDeceased(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Record Lifecycle
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Archive, restore, and status changes for this member record.
          </p>
        </div>
        <MemberRecordStatusBadge status={summary.recordStatus} />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Archive reason
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {summary.archiveReason ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Deceased date
          </dt>
          <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {summary.deceasedDate
              ? summary.deceasedDate.toLocaleDateString()
              : "—"}
          </dd>
        </div>
      </dl>

      {message ? (
        <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {access.canMarkInactive && summary.recordStatus === "ACTIVE" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!confirm("Mark this member inactive?")) return;
              const fd = new FormData();
              fd.set("memberId", memberId);
              run(() => markMemberInactiveAction(fd));
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Mark Inactive
          </button>
        ) : null}
        {access.canMarkInactive && summary.recordStatus === "INACTIVE" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const fd = new FormData();
              fd.set("memberId", memberId);
              run(() => markMemberActiveAction(fd));
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Mark Active
          </button>
        ) : null}
        {access.canArchive && summary.recordStatus !== "ARCHIVED" && summary.recordStatus !== "MERGED" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowArchive(true)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Archive
          </button>
        ) : null}
        {access.canRestore && summary.recordStatus === "ARCHIVED" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const fd = new FormData();
              fd.set("memberId", memberId);
              fd.set("restoreToStatus", "ACTIVE");
              run(() => restoreMemberAction(fd));
            }}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
          >
            Restore
          </button>
        ) : null}
        {access.canMarkDeceased &&
        summary.recordStatus !== "DECEASED" &&
        summary.recordStatus !== "MERGED" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowDeceased(true)}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            Mark Deceased
          </button>
        ) : null}
      </div>

      {showArchive ? (
        <form
          className="mt-4 space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-700"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            fd.set("memberId", memberId);
            run(() => archiveMemberAction(fd));
          }}
        >
          <label className="block space-y-1 text-sm">
            <span>Archive reason</span>
            <select
              name="archiveReason"
              required
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {archiveReasonOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Notes</span>
            <textarea
              name="notes"
              rows={2}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Confirm Archive
            </button>
            <button
              type="button"
              onClick={() => setShowArchive(false)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {showDeceased ? (
        <form
          className="mt-4 space-y-3 rounded-md border border-red-200 p-4 dark:border-red-900"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !confirm(
                "Mark this member deceased? Communications will be disabled.",
              )
            ) {
              return;
            }
            const fd = new FormData(event.currentTarget);
            fd.set("memberId", memberId);
            fd.set("confirmCommunicationRemoval", "true");
            fd.set("confirmDirectoryRemoval", "true");
            run(() => markMemberDeceasedAction(fd));
          }}
        >
          <label className="block space-y-1 text-sm">
            <span>Deceased date</span>
            <input
              type="date"
              name="deceasedDate"
              required
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Notes</span>
            <textarea
              name="deceasedNotes"
              rows={2}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirmCommunicationRemoval" required />
            Confirm removing from communications
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirmDirectoryRemoval" required />
            Confirm directory opt-out
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white"
            >
              Confirm Deceased
            </button>
            <button
              type="button"
              onClick={() => setShowDeceased(false)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
