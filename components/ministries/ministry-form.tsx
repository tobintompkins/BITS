"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createMinistryAction,
  updateMinistryAction,
} from "@/app/(staff)/member-engagement/actions";
import { ministryTypeOptions } from "@/lib/constants/member-engagement";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

type StaffOption = {
  id: string;
  displayName: string | null;
  primaryEmail: string;
};

type MinistryFormValues = {
  name: string;
  description: string;
  ministryType: string;
  leaderUserId: string;
  isActive: boolean;
  meetingSchedule: string;
  location: string;
};

export function MinistryForm({
  mode,
  ministryId,
  initialValues,
  staffUsers,
}: {
  mode: "create" | "edit";
  ministryId?: string;
  initialValues: MinistryFormValues;
  staffUsers: StaffOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createMinistryAction(formData)
          : await updateMinistryAction(ministryId!, formData);

      if (result.status === "error") {
        setError(result.message);
        return;
      }

      if (mode === "create" && "id" in result && result.id) {
        router.push(`/ministries/${result.id}`);
      } else if (ministryId) {
        router.push(`/ministries/${ministryId}`);
      } else {
        router.push("/ministries");
      }
      router.refresh();
    });
  }

  return (
    <form action={submit} className="space-y-6">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Name</span>
          <input name="name" required defaultValue={initialValues.name} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Type</span>
          <select
            name="ministryType"
            required
            defaultValue={initialValues.ministryType}
            className={inputClass}
          >
            {ministryTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Leader (staff)</span>
          <select
            name="leaderUserId"
            defaultValue={initialValues.leaderUserId}
            className={inputClass}
          >
            <option value="">None</option>
            {staffUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName || user.primaryEmail}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Meeting schedule</span>
          <input
            name="meetingSchedule"
            defaultValue={initialValues.meetingSchedule}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Location</span>
          <input name="location" defaultValue={initialValues.location} className={inputClass} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Description</span>
          <textarea
            name="description"
            rows={3}
            defaultValue={initialValues.description}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="isActive"
            value="true"
            defaultChecked={initialValues.isActive}
          />
          Active
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {isPending ? "Saving..." : mode === "create" ? "Create ministry" : "Save changes"}
        </button>
        <Link
          href={ministryId ? `/ministries/${ministryId}` : "/ministries"}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
