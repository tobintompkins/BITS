"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { MembershipStatus } from "@/app/generated/prisma/client";
import {
  archivePrayerRequestAction,
  createFollowUpFromCommunicationAction,
  deleteAttendanceAction,
  deleteCommunicationAction,
  deleteFollowUpAction,
  deletePastoralCareAction,
  deletePrayerRequestAction,
  markFollowUpCompleteAction,
  markFollowUpInProgressAction,
  markPrayerAnsweredAction,
  markPrayerInPrayerAction,
  reopenFollowUpAction,
  reopenPastoralCareAction,
  resolvePastoralCareAction,
} from "@/app/(staff)/care/actions";
import type { TimelineFilter } from "@/lib/types/care-engagement";
import { AttendanceForm } from "@/components/care/attendance-form";
import {
  CommunicationForm,
  emptyCommunicationFormValues,
} from "@/components/care/communication-form";
import { FollowUpForm, visitorWelcomeFollowUpValues } from "@/components/care/follow-up-form";
import {
  PastoralCareForm,
  emptyPastoralCareFormValues,
} from "@/components/care/pastoral-care-form";
import {
  PrayerRequestForm,
  emptyPrayerRequestFormValues,
} from "@/components/care/prayer-request-form";
import {
  AttendanceTypeBadge,
  FollowUpPriorityBadge,
  FollowUpStatusBadge,
  PrayerPrivacyBadge,
  PrayerStatusBadge,
} from "@/components/care/status-badges";
import { type MemberOption, type StaffOption } from "@/components/care/care-form-utils";
import { Toast } from "@/components/ui/toast";
import { formatEnumLabel, followUpTypeOptions } from "@/lib/constants/care-engagement";

type ConfirmState = {
  title: string;
  message: string;
  action: () => Promise<void>;
};

const timelineFilters: Array<{ value: TimelineFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "attendance", label: "Attendance" },
  { value: "follow-ups", label: "Follow-ups" },
  { value: "pastoral-care", label: "Pastoral Care" },
  { value: "prayer", label: "Prayer" },
  { value: "communications", label: "Communications" },
  { value: "profile", label: "Profile" },
];

function ConfirmDialog({
  state,
  isPending,
  onCancel,
}: {
  state: ConfirmState;
  isPending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {state.title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{state.message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void state.action()}
            disabled={isPending}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white"
          >
            {isPending ? "Working..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelShell({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
    </div>
  );
}

type AttendanceRecord = {
  id: string;
  attendanceDate: Date;
  serviceName: string;
  attendanceType: string;
  notes: string | null;
};

type FollowUpRecord = {
  id: string;
  followUpType: string;
  status: string;
  priority: string;
  subject: string;
  dueDate: Date | null;
};

type PastoralRecord = {
  id: string;
  category: string;
  title: string;
  note: string;
  isConfidential: boolean;
  restricted?: boolean;
  followUpDate: Date | null;
  resolvedAt: Date | null;
};

type PrayerRecord = {
  id: string;
  request: string;
  status: string;
  privacyLevel: string;
  requesterName: string | null;
};

type CommunicationRecord = {
  id: string;
  communicationType: string;
  direction: string;
  subject: string | null;
  messageSummary: string;
  communicationDate: Date;
  followUpRequired: boolean;
};

type TimelineItem = {
  id: string;
  category: TimelineFilter;
  title: string;
  description: string;
  actor: string;
  occurredAt: Date;
  href?: string;
};

export function MemberAttendancePanel({
  memberId,
  records,
  summary,
  members,
  canManage,
  canDelete,
}: {
  memberId: string;
  records: AttendanceRecord[];
  summary: {
    total: number;
    last30: number;
    last90: number;
    mostRecentDate: Date | null;
    mostFrequentService: string | null;
    attendancePercentage: number | null;
  };
  members: MemberOption[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  return (
    <PanelShell
      title="Attendance"
      description="Service attendance history and check-ins."
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showForm ? "Cancel" : "Log attendance"}
          </button>
        ) : null
      }
    >
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total records", value: summary.total },
          { label: "Last 30 days", value: summary.last30 },
          { label: "Last 90 days", value: summary.last90 },
          {
            label: "Attendance rate",
            value:
              summary.attendancePercentage != null
                ? `${summary.attendancePercentage}%`
                : "—",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {showForm ? (
        <AttendanceForm
          mode="create"
          members={members}
          initialValues={{
            memberId,
            attendanceDate: new Date().toISOString().slice(0, 10),
            serviceName: summary.mostFrequentService ?? "",
            attendanceType: "PRESENT",
            checkInTime: "",
            checkOutTime: "",
            notes: "",
          }}
          canEdit={canManage}
          lockMember
        />
      ) : null}

      {records.length === 0 ? (
        <EmptyState message="No attendance records yet." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900/80">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                  Service
                </th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                  Type
                </th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                    {record.attendanceDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {record.serviceName}
                  </td>
                  <td className="px-4 py-3">
                    <AttendanceTypeBadge type={record.attendanceType} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {canManage ? (
                        <Link
                          href={`/attendance/${record.id}/edit`}
                          className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-200"
                        >
                          Edit
                        </Link>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirm({
                              title: "Delete attendance?",
                              message: `Remove attendance for ${record.serviceName}?`,
                              action: async () => {
                                startTransition(async () => {
                                  try {
                                    setError(null);
                                    await deleteAttendanceAction(record.id, memberId);
                                    setConfirm(null);
                                    setToast("Attendance deleted.");
                                    router.refresh();
                                  } catch (deleteError) {
                                    setError(
                                      deleteError instanceof Error
                                        ? deleteError.message
                                        : "Unable to delete attendance.",
                                    );
                                    setConfirm(null);
                                  }
                                });
                              },
                            })
                          }
                          className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm ? (
        <ConfirmDialog
          state={confirm}
          isPending={isPending}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </PanelShell>
  );
}

export function MemberFollowUpPanel({
  memberId,
  membershipStatus,
  records,
  members,
  staffUsers,
  canManage,
  canDelete,
}: {
  memberId: string;
  membershipStatus: MembershipStatus;
  records: FollowUpRecord[];
  members: MemberOption[];
  staffUsers: StaffOption[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [visitorWelcome, setVisitorWelcome] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(action: () => Promise<void>, successMessage: string) {
    startTransition(async () => {
      try {
        setError(null);
        await action();
        setToast(successMessage);
        router.refresh();
      } catch (actionError) {
        setError(
          actionError instanceof Error ? actionError.message : "Action failed.",
        );
      }
    });
  }

  return (
    <PanelShell
      title="Follow-Ups"
      description="Track outreach, welcome visits, and member care tasks."
      action={
        canManage ? (
          <div className="flex flex-wrap gap-2">
            {membershipStatus === "VISITOR" ? (
              <button
                type="button"
                onClick={() => {
                  setVisitorWelcome(true);
                  setShowForm(true);
                }}
                className="rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
              >
                Create Visitor Follow-Up
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setVisitorWelcome(false);
                setShowForm((value) => !value);
              }}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {showForm ? "Cancel" : "Add follow-up"}
            </button>
          </div>
        ) : null
      }
    >
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {showForm ? (
        <FollowUpForm
          mode="create"
          members={members}
          staffUsers={staffUsers}
          initialValues={{
            ...(visitorWelcome ? visitorWelcomeFollowUpValues : {
              memberId,
              followUpType: "GENERAL",
              status: "OPEN",
              priority: "NORMAL",
              assignedToUserId: "",
              dueDate: "",
              subject: "",
              notes: "",
              outcome: "",
            }),
            memberId,
          }}
          canEdit={canManage}
          lockMember
          visitorWelcome={visitorWelcome}
        />
      ) : null}

      {records.length === 0 ? (
        <EmptyState message="No follow-ups yet." />
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <article
              key={record.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {record.subject}
                    </h4>
                    <FollowUpStatusBadge status={record.status} />
                    <FollowUpPriorityBadge priority={record.priority} />
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    {formatEnumLabel(followUpTypeOptions, record.followUpType)}
                    {record.dueDate
                      ? ` · Due ${record.dueDate.toISOString().slice(0, 10)}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/follow-ups/${record.id}`}
                    className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-200"
                  >
                    View
                  </Link>
                  {canManage ? (
                    <>
                      {record.status === "OPEN" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            runAction(
                              () => markFollowUpInProgressAction(record.id, memberId),
                              "Marked in progress.",
                            )
                          }
                          className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-300"
                        >
                          Start
                        </button>
                      ) : null}
                      {record.status !== "COMPLETED" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            runAction(
                              () => markFollowUpCompleteAction(record.id, memberId),
                              "Marked complete.",
                            )
                          }
                          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
                        >
                          Complete
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            runAction(
                              () => reopenFollowUpAction(record.id, memberId),
                              "Follow-up reopened.",
                            )
                          }
                          className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                        >
                          Reopen
                        </button>
                      )}
                    </>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          title: "Delete follow-up?",
                          message: `Delete "${record.subject}"?`,
                          action: async () => {
                            try {
                              await deleteFollowUpAction(record.id, memberId);
                              setConfirm(null);
                              setToast("Follow-up deleted.");
                              router.refresh();
                            } catch (deleteError) {
                              setError(
                                deleteError instanceof Error
                                  ? deleteError.message
                                  : "Unable to delete follow-up.",
                              );
                              setConfirm(null);
                            }
                          },
                        })
                      }
                      className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {confirm ? (
        <ConfirmDialog
          state={confirm}
          isPending={isPending}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </PanelShell>
  );
}

export function MemberPastoralCarePanel({
  memberId,
  records,
  members,
  staffUsers,
  canManage,
  canDelete,
  canMarkConfidential,
}: {
  memberId: string;
  records: PastoralRecord[];
  members: MemberOption[];
  staffUsers: StaffOption[];
  canManage: boolean;
  canDelete: boolean;
  canMarkConfidential: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <PanelShell
      title="Pastoral Care"
      description="Pastoral notes, counseling, and care follow-ups."
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showForm ? "Cancel" : "Add note"}
          </button>
        ) : null
      }
    >
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {showForm ? (
        <PastoralCareForm
          mode="create"
          members={members}
          staffUsers={staffUsers}
          initialValues={{ ...emptyPastoralCareFormValues, memberId }}
          canEdit={canManage}
          canMarkConfidential={canMarkConfidential}
          lockMember
        />
      ) : null}

      {records.length === 0 ? (
        <EmptyState message="No pastoral care notes yet." />
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <article
              key={record.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {record.title}
                    </h4>
                    {record.isConfidential ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Confidential
                      </span>
                    ) : null}
                    {record.resolvedAt ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                        Resolved
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    {record.category}
                    {record.followUpDate
                      ? ` · Follow-up ${record.followUpDate.toISOString().slice(0, 10)}`
                      : ""}
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">
                    {record.restricted ? "[Confidential — restricted]" : record.note}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/pastoral-care/${record.id}`}
                    className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-200"
                  >
                    View
                  </Link>
                  {canManage && !record.restricted ? (
                    <>
                      {record.resolvedAt ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await reopenPastoralCareAction(record.id, memberId);
                                setToast("Note reopened.");
                                router.refresh();
                              } catch (actionError) {
                                setError(
                                  actionError instanceof Error
                                    ? actionError.message
                                    : "Unable to reopen note.",
                                );
                              }
                            })
                          }
                          className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                        >
                          Reopen
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await resolvePastoralCareAction(record.id, memberId);
                                setToast("Note resolved.");
                                router.refresh();
                              } catch (actionError) {
                                setError(
                                  actionError instanceof Error
                                    ? actionError.message
                                    : "Unable to resolve note.",
                                );
                              }
                            })
                          }
                          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
                        >
                          Resolve
                        </button>
                      )}
                    </>
                  ) : null}
                  {canDelete && !record.restricted ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          title: "Delete pastoral note?",
                          message: `Delete "${record.title}"?`,
                          action: async () => {
                            try {
                              await deletePastoralCareAction(record.id, memberId);
                              setConfirm(null);
                              setToast("Pastoral note deleted.");
                              router.refresh();
                            } catch (deleteError) {
                              setError(
                                deleteError instanceof Error
                                  ? deleteError.message
                                  : "Unable to delete note.",
                              );
                              setConfirm(null);
                            }
                          },
                        })
                      }
                      className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {confirm ? (
        <ConfirmDialog
          state={confirm}
          isPending={isPending}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </PanelShell>
  );
}

export function MemberPrayerPanel({
  memberId,
  records,
  members,
  staffUsers,
  canManage,
  canDelete,
}: {
  memberId: string;
  records: PrayerRecord[];
  members: MemberOption[];
  staffUsers: StaffOption[];
  canManage: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <PanelShell
      title="Prayer Requests"
      description="Prayer needs and answered prayer tracking."
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showForm ? "Cancel" : "Add prayer request"}
          </button>
        ) : null
      }
    >
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {showForm ? (
        <PrayerRequestForm
          mode="create"
          members={members}
          staffUsers={staffUsers}
          initialValues={{ ...emptyPrayerRequestFormValues, memberId }}
          canEdit={canManage}
          lockMember
        />
      ) : null}

      {records.length === 0 ? (
        <EmptyState message="No prayer requests yet." />
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <article
              key={record.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <PrayerStatusBadge status={record.status} />
                    <PrayerPrivacyBadge privacyLevel={record.privacyLevel} />
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">{record.request}</p>
                  {record.requesterName ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Requested by {record.requesterName}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/prayer-requests/${record.id}`}
                    className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-200"
                  >
                    View
                  </Link>
                  {canManage ? (
                    <>
                      {record.status === "ACTIVE" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await markPrayerInPrayerAction(record.id, memberId);
                                setToast("Marked in prayer.");
                                router.refresh();
                              } catch (actionError) {
                                setError(
                                  actionError instanceof Error
                                    ? actionError.message
                                    : "Unable to update prayer request.",
                                );
                              }
                            })
                          }
                          className="text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
                        >
                          In prayer
                        </button>
                      ) : null}
                      {record.status !== "ANSWERED" && record.status !== "ARCHIVED" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await markPrayerAnsweredAction(record.id, memberId);
                                setToast("Marked answered.");
                                router.refresh();
                              } catch (actionError) {
                                setError(
                                  actionError instanceof Error
                                    ? actionError.message
                                    : "Unable to update prayer request.",
                                );
                              }
                            })
                          }
                          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
                        >
                          Answered
                        </button>
                      ) : null}
                      {record.status !== "ARCHIVED" ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await archivePrayerRequestAction(record.id, memberId);
                                setToast("Prayer request archived.");
                                router.refresh();
                              } catch (actionError) {
                                setError(
                                  actionError instanceof Error
                                    ? actionError.message
                                    : "Unable to archive prayer request.",
                                );
                              }
                            })
                          }
                          className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-300"
                        >
                          Archive
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          title: "Delete prayer request?",
                          message: "This prayer request will be permanently removed.",
                          action: async () => {
                            try {
                              await deletePrayerRequestAction(record.id, memberId);
                              setConfirm(null);
                              setToast("Prayer request deleted.");
                              router.refresh();
                            } catch (deleteError) {
                              setError(
                                deleteError instanceof Error
                                  ? deleteError.message
                                  : "Unable to delete prayer request.",
                              );
                              setConfirm(null);
                            }
                          },
                        })
                      }
                      className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {confirm ? (
        <ConfirmDialog
          state={confirm}
          isPending={isPending}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </PanelShell>
  );
}

export function MemberCommunicationsPanel({
  memberId,
  records,
  members,
  canManage,
  canDelete,
  canCreateFollowUp,
}: {
  memberId: string;
  records: CommunicationRecord[];
  members: MemberOption[];
  canManage: boolean;
  canDelete: boolean;
  canCreateFollowUp: boolean;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <PanelShell
      title="Communications"
      description="Phone calls, emails, texts, and in-person contact logs."
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showForm ? "Cancel" : "Log communication"}
          </button>
        ) : null
      }
    >
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {showForm ? (
        <CommunicationForm
          mode="create"
          members={members}
          initialValues={{ ...emptyCommunicationFormValues, memberId }}
          canEdit={canManage}
          lockMember
        />
      ) : null}

      {records.length === 0 ? (
        <EmptyState message="No communications logged yet." />
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <article
              key={record.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <h4 className="font-medium text-zinc-900 dark:text-zinc-100">
                    {record.subject || record.communicationType}
                  </h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">
                    {record.communicationType} · {record.direction} ·{" "}
                    {record.communicationDate.toISOString().slice(0, 10)}
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200">
                    {record.messageSummary}
                  </p>
                  {record.followUpRequired ? (
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Follow-up required
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canCreateFollowUp && record.followUpRequired ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            const followUp =
                              await createFollowUpFromCommunicationAction(
                                record.id,
                                memberId,
                              );
                            setToast("Follow-up created from communication.");
                            router.push(`/follow-ups/${followUp.id}`);
                            router.refresh();
                          } catch (actionError) {
                            setError(
                              actionError instanceof Error
                                ? actionError.message
                                : "Unable to create follow-up.",
                            );
                          }
                        })
                      }
                      className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300"
                    >
                      Create follow-up
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          title: "Delete communication?",
                          message: "This communication log will be permanently removed.",
                          action: async () => {
                            try {
                              await deleteCommunicationAction(record.id, memberId);
                              setConfirm(null);
                              setToast("Communication deleted.");
                              router.refresh();
                            } catch (deleteError) {
                              setError(
                                deleteError instanceof Error
                                  ? deleteError.message
                                  : "Unable to delete communication.",
                              );
                              setConfirm(null);
                            }
                          },
                        })
                      }
                      className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {confirm ? (
        <ConfirmDialog
          state={confirm}
          isPending={isPending}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </PanelShell>
  );
}

export function MemberActivityTimelinePanel({
  initialItems,
  initialFilter = "all",
}: {
  initialItems: TimelineItem[];
  initialFilter?: TimelineFilter;
}) {
  const [filter, setFilter] = useState<TimelineFilter>(initialFilter);

  const items =
    filter === "all"
      ? initialItems
      : initialItems.filter((item) => item.category === filter);

  return (
    <PanelShell
      title="Activity Timeline"
      description="Unified view of member care activity across modules."
    >
      <div className="flex flex-wrap gap-2">
        {timelineFilters.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setFilter(chip.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filter === chip.value
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState message="No activity found for this filter." />
      ) : (
        <ol className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100"
                    >
                      {item.title}
                    </Link>
                  ) : (
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {item.title}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {item.description}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {item.actor} · {new Date(item.occurredAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {timelineFilters.find((chip) => chip.value === item.category)?.label ??
                    item.category}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </PanelShell>
  );
}
