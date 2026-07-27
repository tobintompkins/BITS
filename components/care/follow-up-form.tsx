"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createFollowUpAction,
  updateFollowUpAction,
} from "@/app/(staff)/care/actions";
import {
  formatStaffLabel,
  inputClassName,
  sectionBodyClassName,
  sectionClassName,
  sectionHeaderClassName,
  type MemberOption,
  type StaffOption,
} from "@/components/care/care-form-utils";
import { Toast } from "@/components/ui/toast";
import {
  followUpPriorityOptions,
  followUpStatusOptions,
  followUpTypeOptions,
} from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";

export type FollowUpFormValues = {
  memberId: string;
  followUpType: string;
  status: string;
  priority: string;
  assignedToUserId: string;
  dueDate: string;
  subject: string;
  notes: string;
  outcome: string;
};

type FollowUpFormProps = {
  mode: "create" | "edit";
  members: MemberOption[];
  staffUsers: StaffOption[];
  initialValues: FollowUpFormValues;
  followUpId?: string;
  canEdit: boolean;
  lockMember?: boolean;
  visitorWelcome?: boolean;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

export function FollowUpForm({
  mode,
  members,
  staffUsers,
  initialValues,
  followUpId,
  canEdit,
  lockMember = false,
  visitorWelcome = false,
}: FollowUpFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setError(null);
      setFieldErrors({});

      const result =
        mode === "create"
          ? await createFollowUpAction(formData)
          : followUpId
            ? await updateFollowUpAction(followUpId, formData)
            : { status: "error" as const, message: "Missing follow-up id." };

      if (result.status === "success") {
        setToast(result.message);
        if (mode === "create" && "id" in result && result.id) {
          router.push(`/follow-ups/${result.id}`);
          router.refresh();
          return;
        }
        router.refresh();
        return;
      }

      setError(result.message);
      if ("fieldErrors" in result && result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
    });
  }

  return (
    <>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        {visitorWelcome ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
            Creating a visitor welcome follow-up for a first-time guest.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Follow-Up Details
            </h2>
          </div>
          <div className={sectionBodyClassName}>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Member
              </span>
              <select
                name="memberId"
                defaultValue={initialValues.memberId}
                disabled={!canEdit || lockMember}
                className={inputClassName}
              >
                <option value="">Select a member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {getMemberDisplayName(member)}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.memberId?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Follow-Up Type
              </span>
              <select
                name="followUpType"
                defaultValue={initialValues.followUpType}
                disabled={!canEdit || visitorWelcome}
                className={inputClassName}
              >
                {followUpTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.followUpType?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Status
              </span>
              <select
                name="status"
                defaultValue={initialValues.status}
                disabled={!canEdit}
                className={inputClassName}
              >
                {followUpStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.status?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Priority
              </span>
              <select
                name="priority"
                defaultValue={initialValues.priority}
                disabled={!canEdit}
                className={inputClassName}
              >
                {followUpPriorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.priority?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Assigned To
              </span>
              <select
                name="assignedToUserId"
                defaultValue={initialValues.assignedToUserId}
                disabled={!canEdit}
                className={inputClassName}
              >
                <option value="">Unassigned</option>
                {staffUsers.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {formatStaffLabel(staff)}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.assignedToUserId?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Due Date
              </span>
              <input
                type="date"
                name="dueDate"
                defaultValue={initialValues.dueDate}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.dueDate?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Subject
              </span>
              <input
                type="text"
                name="subject"
                defaultValue={initialValues.subject}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.subject?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Notes
              </span>
              <textarea
                name="notes"
                rows={4}
                defaultValue={initialValues.notes}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.notes?.[0]} />
            </label>

            {mode === "edit" ? (
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  Outcome
                </span>
                <textarea
                  name="outcome"
                  rows={3}
                  defaultValue={initialValues.outcome}
                  disabled={!canEdit}
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.outcome?.[0]} />
              </label>
            ) : (
              <input type="hidden" name="outcome" value="" />
            )}
          </div>
        </section>

        {canEdit ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isPending
                ? "Saving..."
                : mode === "create"
                  ? "Create follow-up"
                  : "Update follow-up"}
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}

export const emptyFollowUpFormValues: FollowUpFormValues = {
  memberId: "",
  followUpType: "GENERAL",
  status: "OPEN",
  priority: "NORMAL",
  assignedToUserId: "",
  dueDate: "",
  subject: "",
  notes: "",
  outcome: "",
};

export const visitorWelcomeFollowUpValues: FollowUpFormValues = {
  ...emptyFollowUpFormValues,
  followUpType: "VISITOR_WELCOME",
  priority: "HIGH",
  subject: "Visitor welcome follow-up",
};

export function mapFollowUpToFormValues(record: {
  memberId: string;
  followUpType: string;
  status: string;
  priority: string;
  assignedToUserId: string | null;
  dueDate: Date | null;
  subject: string;
  notes: string | null;
  outcome: string | null;
}): FollowUpFormValues {
  return {
    memberId: record.memberId,
    followUpType: record.followUpType,
    status: record.status,
    priority: record.priority,
    assignedToUserId: record.assignedToUserId ?? "",
    dueDate: record.dueDate ? record.dueDate.toISOString().slice(0, 10) : "",
    subject: record.subject,
    notes: record.notes ?? "",
    outcome: record.outcome ?? "",
  };
}
