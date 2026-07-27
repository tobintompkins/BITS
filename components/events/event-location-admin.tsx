"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createEventLocationAction,
  deleteEventLocationAction,
  toggleEventLocationActiveAction,
  updateEventLocationAction,
} from "@/app/(staff)/events/actions";
import { Toast } from "@/components/ui/toast";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

type Location = {
  id: string;
  name: string;
  description: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  roomName: string | null;
  capacity: number | null;
  isOnline: boolean;
  onlineMeetingUrl: string | null;
  isActive: boolean;
  _count: { events: number };
};

export function EventLocationAdmin({
  locations,
  canManage,
}: {
  locations: Location[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  const editing = locations.find((l) => l.id === editingId);

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
            Event Locations
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Rooms, campuses, and online venues for events.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setIsOnline(false);
              setShowForm((v) => !v);
            }}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showForm && !editingId ? "Cancel" : "Add location"}
          </button>
        ) : null}
      </header>

      {showForm && canManage ? (
        <form
          action={(formData) => {
            setError(null);
            formData.set("isOnline", isOnline ? "true" : "false");
            startTransition(async () => {
              const result = editingId
                ? await updateEventLocationAction(editingId, formData)
                : await createEventLocationAction(formData);
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
              defaultValue={editing?.name ?? ""}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Room</span>
            <input
              name="roomName"
              defaultValue={editing?.roomName ?? ""}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Address</span>
            <input
              name="address1"
              defaultValue={editing?.address1 ?? ""}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">City</span>
            <input name="city" defaultValue={editing?.city ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">State</span>
            <input name="state" defaultValue={editing?.state ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Capacity</span>
            <input
              name="capacity"
              type="number"
              min={1}
              defaultValue={editing?.capacity ?? ""}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={editingId ? isOnline || Boolean(editing?.isOnline) : isOnline}
              onChange={(e) => setIsOnline(e.target.checked)}
            />
            Online event location
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Meeting URL
            </span>
            <input
              name="onlineMeetingUrl"
              defaultValue={editing?.onlineMeetingUrl ?? ""}
              className={inputClass}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Description</span>
            <textarea
              name="description"
              rows={2}
              defaultValue={editing?.description ?? ""}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              name="isActive"
              value="true"
              defaultChecked={editing?.isActive ?? true}
            />
            Active
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 sm:w-fit"
          >
            {editingId ? "Update location" : "Create location"}
          </button>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => (
              <tr key={location.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {location.name}
                  {location.roomName ? (
                    <span className="block text-xs font-normal text-zinc-500">
                      {location.roomName}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {location.isOnline ? "Online" : "On-site"}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {location._count.events}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {location.isActive ? "Active" : "Inactive"}
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        className="underline-offset-4 hover:underline"
                        onClick={() => {
                          setEditingId(location.id);
                          setIsOnline(location.isOnline);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="underline-offset-4 hover:underline"
                        onClick={() =>
                          startTransition(async () => {
                            const result = await toggleEventLocationActiveAction(
                              location.id,
                              !location.isActive,
                            );
                            setToast(result.message);
                            router.refresh();
                          })
                        }
                      >
                        {location.isActive ? "Deactivate" : "Activate"}
                      </button>
                      {location._count.events === 0 ? (
                        <button
                          type="button"
                          className="text-red-700 underline-offset-4 hover:underline dark:text-red-300"
                          onClick={() =>
                            startTransition(async () => {
                              const result = await deleteEventLocationAction(location.id);
                              if (result.status === "error") setError(result.message);
                              else setToast(result.message);
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
