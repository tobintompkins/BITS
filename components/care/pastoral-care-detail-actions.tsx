"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deletePastoralCareAction,
  reopenPastoralCareAction,
  resolvePastoralCareAction,
} from "@/app/(staff)/care/actions";
import { Toast } from "@/components/ui/toast";

export function PastoralCareDetailActions({
  noteId,
  memberId,
  resolvedAt,
  canManage,
  canDelete,
}: {
  noteId: string;
  memberId: string;
  resolvedAt: Date | null;
  canManage: boolean;
  canDelete: boolean;
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
            href={`/pastoral-care/${noteId}/edit`}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Edit
          </Link>
        ) : null}
        {canManage && !resolvedAt ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => resolvePastoralCareAction(noteId, memberId), "Note resolved.")}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            Resolve
          </button>
        ) : null}
        {canManage && resolvedAt ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => reopenPastoralCareAction(noteId, memberId), "Note reopened.")}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white"
          >
            Reopen
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
              Delete pastoral note?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              This pastoral care note will be permanently removed.
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
                    await deletePastoralCareAction(noteId, memberId);
                    setConfirmDelete(false);
                    router.push("/pastoral-care");
                  }, "Note deleted.")
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
