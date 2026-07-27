"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  removeMemberFromHouseholdAction,
  setHouseholdPrimaryContactAction,
} from "@/app/(staff)/household/actions";
import { MembershipStatusBadge } from "@/components/ui/membership-status-badge";
import { Toast } from "@/components/ui/toast";
import { formatHouseholdRelationship } from "@/lib/constants/household-relationships";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import type { MembershipStatusValue } from "@/lib/constants/membership-status";

type MemberLink = {
  relationshipToHousehold: string | null;
  isPrimaryContact: boolean;
  member: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName: string | null;
    email: string | null;
    phone: string | null;
    membershipStatus: MembershipStatusValue;
  };
};

type HouseholdMemberTableProps = {
  householdId: string;
  primaryContactId: string | null;
  memberLinks: MemberLink[];
  canEdit: boolean;
};

export function HouseholdMemberTable({
  householdId,
  primaryContactId,
  memberLinks,
  canEdit,
}: HouseholdMemberTableProps) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [removeTarget, setRemoveTarget] = useState<{
    memberId: string;
    memberName: string;
  } | null>(null);

  function runAction(action: () => Promise<void>, message: string) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setToast(message);
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Something went wrong.",
        );
      }
    });
  }

  if (memberLinks.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        No members linked to this household yet.
      </p>
    );
  }

  return (
    <>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Relationship</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Primary</th>
              {canEdit ? <th className="px-3 py-2">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {memberLinks.map((link) => {
              const isPrimary =
                link.isPrimaryContact || primaryContactId === link.member.id;

              return (
                <tr
                  key={link.member.id}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-3 py-3 font-medium">
                    {getMemberDisplayName(link.member)}
                  </td>
                  <td className="px-3 py-3">
                    {formatHouseholdRelationship(link.relationshipToHousehold)}
                  </td>
                  <td className="px-3 py-3">
                    <MembershipStatusBadge status={link.member.membershipStatus} />
                  </td>
                  <td className="px-3 py-3">{link.member.email ?? "—"}</td>
                  <td className="px-3 py-3">{link.member.phone ?? "—"}</td>
                  <td className="px-3 py-3">
                    {isPrimary ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                        Primary
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canEdit ? (
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/member/${link.member.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          View
                        </Link>
                        {!isPrimary ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              runAction(
                                () =>
                                  setHouseholdPrimaryContactAction(
                                    householdId,
                                    link.member.id,
                                  ),
                                "Primary contact updated.",
                              )
                            }
                            className="font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
                          >
                            Set primary
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            setRemoveTarget({
                              memberId: link.member.id,
                              memberName: getMemberDisplayName(link.member),
                            })
                          }
                          className="font-medium text-red-600 underline-offset-4 hover:underline dark:text-red-400"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {removeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Remove from household?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Remove {removeTarget.memberName} from this household?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                disabled={isPending}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  runAction(async () => {
                    await removeMemberFromHouseholdAction(
                      removeTarget.memberId,
                      householdId,
                    );
                    setRemoveTarget(null);
                  }, "Member removed from household.")
                }
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                {isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
