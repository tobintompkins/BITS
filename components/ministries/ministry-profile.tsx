"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addMemberToMinistryAction,
  deleteMinistryAction,
  removeMemberFromMinistryAction,
  setMemberAsMinistryLeaderAction,
} from "@/app/(staff)/member-engagement/actions";
import {
  formatEngagementEnumLabel,
  memberMinistryRoleOptions,
  memberMinistryStatusOptions,
  ministryTypeOptions,
} from "@/lib/constants/member-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { Toast } from "@/components/ui/toast";

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

type MinistryProfileProps = {
  ministry: {
    id: string;
    name: string;
    description: string | null;
    ministryType: string;
    isActive: boolean;
    meetingSchedule: string | null;
    location: string | null;
    leader: { id: string; displayName: string | null; primaryEmail: string } | null;
    members: Array<{
      id: string;
      role: string;
      status: string;
      isLeader: boolean;
      joinedDate: Date | null;
      member: MemberOption;
    }>;
  };
  members: MemberOption[];
  canManage: boolean;
  canManageRoster: boolean;
};

export function MinistryProfile({
  ministry,
  members,
  canManage,
  canManageRoster,
}: MinistryProfileProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-6">
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <header className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/ministries"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Ministries
        </Link>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {ministry.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {formatEngagementEnumLabel(ministryTypeOptions, ministry.ministryType)}
              {" · "}
              {ministry.isActive ? "Active" : "Inactive"}
            </p>
            {ministry.description ? (
              <p className="mt-3 max-w-2xl text-sm text-zinc-700 dark:text-zinc-300">
                {ministry.description}
              </p>
            ) : null}
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Schedule
                </dt>
                <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                  {ministry.meetingSchedule || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Location
                </dt>
                <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                  {ministry.location || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Staff leader
                </dt>
                <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
                  {ministry.leader?.displayName || ministry.leader?.primaryEmail || "—"}
                </dd>
              </div>
            </dl>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const { exportMinistryRosterCsvAction } = await import(
                      "@/app/(staff)/member-engagement/actions"
                    );
                    const csv = await exportMinistryRosterCsvAction(ministry.id);
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = `${ministry.name.replace(/\s+/g, "-").toLowerCase()}-roster.csv`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                    setToast("Roster exported.");
                  })
                }
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Export roster CSV
              </button>
              <Link
                href={`/ministries/${ministry.id}/edit`}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Edit
              </Link>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteMinistryAction(ministry.id, { deactivate: true });
                    setToast("Ministry deactivated.");
                    router.refresh();
                  })
                }
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Deactivate
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Roster ({ministry.members.length})
          </h2>
          {canManageRoster ? (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {showAdd ? "Cancel" : "Add member"}
            </button>
          ) : null}
        </div>

        {showAdd ? (
          <form
            action={(formData) => {
              setError(null);
              startTransition(async () => {
                const result = await addMemberToMinistryAction(formData);
                if (result.status === "error") {
                  setError(result.message);
                  return;
                }
                setToast(result.message);
                setShowAdd(false);
                router.refresh();
              });
            }}
            className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2"
          >
            <input type="hidden" name="ministryId" value={ministry.id} />
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Member</span>
              <select
                name="memberId"
                required
                defaultValue=""
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="" disabled>
                  Select member
                </option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {getMemberDisplayName(member)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Role</span>
              <select
                name="role"
                defaultValue="VOLUNTEER"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {memberMinistryRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Status</span>
              <select
                name="status"
                defaultValue="ACTIVE"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {memberMinistryStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" name="isLeader" value="true" />
              Leader
            </label>
            <div>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Add to roster
              </button>
            </div>
          </form>
        ) : null}

        {ministry.members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">No members on this roster yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ministry.members.map((assignment) => (
                  <tr key={assignment.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-3">
                      <Link
                        href={`/member/${assignment.member.id}`}
                        className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                      >
                        {getMemberDisplayName(assignment.member)}
                      </Link>
                      {assignment.isLeader ? (
                        <span className="ml-2 text-xs text-zinc-500">Leader</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {formatEngagementEnumLabel(memberMinistryRoleOptions, assignment.role)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {formatEngagementEnumLabel(memberMinistryStatusOptions, assignment.status)}
                    </td>
                    <td className="px-4 py-3">
                      {canManageRoster ? (
                        <div className="flex gap-3">
                          {!assignment.isLeader ? (
                            <button
                              type="button"
                              className="text-zinc-700 hover:underline dark:text-zinc-200"
                              onClick={() =>
                                startTransition(async () => {
                                  await setMemberAsMinistryLeaderAction(
                                    assignment.id,
                                    assignment.member.id,
                                    ministry.id,
                                  );
                                  setToast("Leader updated.");
                                  router.refresh();
                                })
                              }
                            >
                              Make leader
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            onClick={() =>
                              startTransition(async () => {
                                await removeMemberFromMinistryAction(
                                  assignment.id,
                                  assignment.member.id,
                                  ministry.id,
                                );
                                setToast("Removed from roster.");
                                router.refresh();
                              })
                            }
                          >
                            Remove
                          </button>
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
        )}
      </section>
    </div>
  );
}
