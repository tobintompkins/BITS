"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archivePrayerRequestAction,
  deletePrayerRequestAction,
  markPrayerAnsweredAction,
  markPrayerInPrayerAction,
  setPrayerRequestPublicVisibilityAction,
} from "@/app/(staff)/care/actions";
import { Toast } from "@/components/ui/toast";

export function PrayerRequestDetailActions({
  prayerRequestId,
  memberId,
  status,
  canManage,
  canDelete,
  isPublic,
}: {
  prayerRequestId: string;
  memberId?: string | null;
  status: string;
  canManage: boolean;
  canDelete: boolean;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<void>, message: string) {
    startTransition(async () => {
      try {
        setError(null);
        await action();
        setToast(message);
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Action failed.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canManage ? (
          <Link
            href={`/prayer-requests/${prayerRequestId}/edit`}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Edit
          </Link>
        ) : null}
        {canManage && status === "ACTIVE" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () => markPrayerInPrayerAction(prayerRequestId, memberId ?? undefined),
                "Marked in prayer.",
              )
            }
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white"
          >
            In Prayer
          </button>
        ) : null}
        {canManage && status !== "ANSWERED" && status !== "ARCHIVED" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () => markPrayerAnsweredAction(prayerRequestId, memberId ?? undefined),
                "Marked answered.",
              )
            }
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            Answered
          </button>
        ) : null}
        {canManage && status !== "ARCHIVED" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () => archivePrayerRequestAction(prayerRequestId, memberId ?? undefined),
                "Prayer request archived.",
              )
            }
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-300 dark:text-zinc-900"
          >
            Archive
          </button>
        ) : null}
        {canManage && status !== "ARCHIVED" ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  setPrayerRequestPublicVisibilityAction(
                    prayerRequestId,
                    !isPublic,
                  ),
                isPublic
                  ? "Removed from the public Prayer Wall."
                  : "Shared on the public Prayer Wall.",
              )
            }
            className="rounded-md border border-amber-500 px-4 py-2 text-sm font-medium text-amber-800 dark:text-amber-300"
          >
            {isPublic ? "Remove from Prayer Wall" : "Share on Prayer Wall"}
          </button>
        ) : null}
        {canDelete ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmDelete(true)}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
          >
            Delete
          </button>
        ) : null}
      </div>

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Delete prayer request?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              This prayer request will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    await deletePrayerRequestAction(
                      prayerRequestId,
                      memberId ?? undefined,
                    );
                    setConfirmDelete(false);
                    router.push("/prayer-requests");
                  }, "Prayer request deleted.")
                }
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
