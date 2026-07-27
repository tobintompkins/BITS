"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createPastoralCareAction,
  updatePastoralCareAction,
} from "@/app/(staff)/care/actions";
import {
  formatStaffLabel,
  inputClassName,
  sectionBodyClassName,
  sectionClassName,
  sectionHeaderClassName,
  toDateInputValue,
  type MemberOption,
  type StaffOption,
} from "@/components/care/care-form-utils";
import { Toast } from "@/components/ui/toast";
import { pastoralCareCategoryOptions } from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";

export type PastoralCareFormValues = {
  memberId: string;
  category: string;
  title: string;
  note: string;
  isConfidential: boolean;
  assignedPastorUserId: string;
  followUpDate: string;
};

type PastoralCareFormProps = {
  mode: "create" | "edit";
  members: MemberOption[];
  staffUsers: StaffOption[];
  initialValues: PastoralCareFormValues;
  noteId?: string;
  canEdit: boolean;
  canMarkConfidential?: boolean;
  lockMember?: boolean;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

export function PastoralCareForm({
  mode,
  members,
  staffUsers,
  initialValues,
  noteId,
  canEdit,
  canMarkConfidential = false,
  lockMember = false,
}: PastoralCareFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isConfidential, setIsConfidential] = useState(initialValues.isConfidential);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    const formData = new FormData(event.currentTarget);
    formData.set("isConfidential", isConfidential ? "true" : "false");

    startTransition(async () => {
      setError(null);
      setFieldErrors({});

      const result =
        mode === "create"
          ? await createPastoralCareAction(formData)
          : noteId
            ? await updatePastoralCareAction(noteId, formData)
            : { status: "error" as const, message: "Missing note id." };

      if (result.status === "success") {
        setToast(result.message);
        if (mode === "create" && "id" in result && result.id) {
          router.push(`/pastoral-care/${result.id}`);
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
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Pastoral Care Note
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
                Category
              </span>
              <select
                name="category"
                defaultValue={initialValues.category}
                disabled={!canEdit}
                className={inputClassName}
              >
                {pastoralCareCategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.category?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Assigned Pastor
              </span>
              <select
                name="assignedPastorUserId"
                defaultValue={initialValues.assignedPastorUserId}
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
              <FieldError message={fieldErrors.assignedPastorUserId?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Title
              </span>
              <input
                type="text"
                name="title"
                defaultValue={initialValues.title}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.title?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Note
              </span>
              <textarea
                name="note"
                rows={6}
                defaultValue={initialValues.note}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.note?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Follow-Up Date
              </span>
              <input
                type="date"
                name="followUpDate"
                defaultValue={initialValues.followUpDate}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.followUpDate?.[0]} />
            </label>

            {canMarkConfidential ? (
              <label className="flex items-center gap-3 self-end">
                <input
                  type="checkbox"
                  checked={isConfidential}
                  onChange={(event) => setIsConfidential(event.target.checked)}
                  disabled={!canEdit}
                  className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  Confidential note
                </span>
              </label>
            ) : (
              <input
                type="hidden"
                name="isConfidential"
                value={initialValues.isConfidential ? "true" : "false"}
              />
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
                  ? "Create note"
                  : "Update note"}
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}

export const emptyPastoralCareFormValues: PastoralCareFormValues = {
  memberId: "",
  category: "GENERAL",
  title: "",
  note: "",
  isConfidential: false,
  assignedPastorUserId: "",
  followUpDate: "",
};

export function mapPastoralCareToFormValues(record: {
  memberId: string;
  category: string;
  title: string;
  note: string;
  isConfidential: boolean;
  assignedPastorUserId: string | null;
  followUpDate: Date | null;
}): PastoralCareFormValues {
  return {
    memberId: record.memberId,
    category: record.category,
    title: record.title,
    note: record.note,
    isConfidential: record.isConfidential,
    assignedPastorUserId: record.assignedPastorUserId ?? "",
    followUpDate: toDateInputValue(record.followUpDate),
  };
}
