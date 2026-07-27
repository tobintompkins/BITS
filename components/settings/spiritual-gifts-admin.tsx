"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createSpiritualGiftAction,
  deleteSpiritualGiftAction,
  toggleSpiritualGiftActiveAction,
  updateSpiritualGiftAction,
} from "@/app/(staff)/member-engagement/actions";
import { Toast } from "@/components/ui/toast";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

type Gift = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  _count: { assignments: number };
};

export function SpiritualGiftsAdmin({
  gifts,
  canManage,
  canDelete,
}: {
  gifts: Gift[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Spiritual Gifts
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Organization catalog used when assigning gifts to members.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const { exportSpiritualGiftAssignmentsCsvAction } = await import(
                  "@/app/(staff)/member-engagement/actions"
                );
                const csv = await exportSpiritualGiftAssignmentsCsvAction();
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "spiritual-gift-assignments.csv";
                anchor.click();
                URL.revokeObjectURL(url);
                setToast("Assignments exported.");
              })
            }
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Export assignments CSV
          </button>
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setShowForm((v) => !v);
              }}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {showForm && !editingId ? "Cancel" : "Add gift"}
            </button>
          ) : null}
        </div>
      </header>

      {showForm && canManage ? (
        <form
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = editingId
                ? await updateSpiritualGiftAction(editingId, formData)
                : await createSpiritualGiftAction(formData);
              if (result.status === "error") {
                setError(result.message);
                return;
              }
              setToast(result.message);
              setShowForm(false);
              setEditingId(null);
              router.refresh();
            });
          }}
          className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2"
        >
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Name</span>
            <input
              name="name"
              required
              defaultValue={
                editingId ? gifts.find((g) => g.id === editingId)?.name ?? "" : ""
              }
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Category</span>
            <input
              name="category"
              defaultValue={
                editingId
                  ? gifts.find((g) => g.id === editingId)?.category ?? ""
                  : ""
              }
              className={inputClass}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Description</span>
            <textarea
              name="description"
              rows={2}
              defaultValue={
                editingId
                  ? gifts.find((g) => g.id === editingId)?.description ?? ""
                  : ""
              }
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="isActive"
              value="true"
              defaultChecked={
                editingId
                  ? gifts.find((g) => g.id === editingId)?.isActive ?? true
                  : true
              }
            />
            Active
          </label>
          <div>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {editingId ? "Save gift" : "Create gift"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Assignments</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {gifts.map((gift) => (
              <tr key={gift.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {gift.name}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {gift.category || "—"}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {gift._count.assignments}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {gift.isActive ? "Active" : "Inactive"}
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="text-zinc-700 hover:underline dark:text-zinc-200"
                        onClick={() => {
                          setEditingId(gift.id);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-zinc-700 hover:underline dark:text-zinc-200"
                        onClick={() =>
                          startTransition(async () => {
                            await toggleSpiritualGiftActiveAction(gift.id, !gift.isActive);
                            setToast(gift.isActive ? "Gift deactivated." : "Gift activated.");
                            router.refresh();
                          })
                        }
                      >
                        {gift.isActive ? "Deactivate" : "Activate"}
                      </button>
                      {canDelete && gift._count.assignments === 0 ? (
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() =>
                            startTransition(async () => {
                              await deleteSpiritualGiftAction(gift.id);
                              setToast("Gift deleted.");
                              router.refresh();
                            })
                          }
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
