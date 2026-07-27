"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createPrayerRequestAction,
  updatePrayerRequestAction,
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
  prayerPrivacyLevelOptions,
  prayerRequestStatusOptions,
} from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";

export type PrayerRequestFormValues = {
  memberId: string;
  requesterName: string;
  request: string;
  status: string;
  privacyLevel: string;
  assignedToUserId: string;
  answerNotes: string;
};

type PrayerRequestFormProps = {
  mode: "create" | "edit";
  members: MemberOption[];
  staffUsers: StaffOption[];
  initialValues: PrayerRequestFormValues;
  prayerRequestId?: string;
  canEdit: boolean;
  lockMember?: boolean;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

export function PrayerRequestForm({
  mode,
  members,
  staffUsers,
  initialValues,
  prayerRequestId,
  canEdit,
  lockMember = false,
}: PrayerRequestFormProps) {
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
          ? await createPrayerRequestAction(formData)
          : prayerRequestId
            ? await updatePrayerRequestAction(prayerRequestId, formData)
            : { status: "error" as const, message: "Missing prayer request id." };

      if (result.status === "success") {
        setToast(result.message);
        if (mode === "create" && "id" in result && result.id) {
          router.push(`/prayer-requests/${result.id}`);
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
              Prayer Request
            </h2>
          </div>
          <div className={sectionBodyClassName}>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Member (optional)
              </span>
              <select
                name="memberId"
                defaultValue={initialValues.memberId}
                disabled={!canEdit || lockMember}
                className={inputClassName}
              >
                <option value="">No linked member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {getMemberDisplayName(member)}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.memberId?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Requester Name (optional)
              </span>
              <input
                type="text"
                name="requesterName"
                defaultValue={initialValues.requesterName}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.requesterName?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Prayer Request
              </span>
              <textarea
                name="request"
                rows={5}
                defaultValue={initialValues.request}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.request?.[0]} />
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
                {prayerRequestStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.status?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Privacy Level
              </span>
              <select
                name="privacyLevel"
                defaultValue={initialValues.privacyLevel}
                disabled={!canEdit}
                className={inputClassName}
              >
                {prayerPrivacyLevelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.privacyLevel?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
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

            {mode === "edit" ? (
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  Answer Notes
                </span>
                <textarea
                  name="answerNotes"
                  rows={3}
                  defaultValue={initialValues.answerNotes}
                  disabled={!canEdit}
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.answerNotes?.[0]} />
              </label>
            ) : (
              <input type="hidden" name="answerNotes" value="" />
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
                  ? "Create prayer request"
                  : "Update prayer request"}
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}

export const emptyPrayerRequestFormValues: PrayerRequestFormValues = {
  memberId: "",
  requesterName: "",
  request: "",
  status: "ACTIVE",
  privacyLevel: "PRAYER_TEAM",
  assignedToUserId: "",
  answerNotes: "",
};

export function mapPrayerRequestToFormValues(record: {
  memberId: string | null;
  requesterName: string | null;
  request: string;
  status: string;
  privacyLevel: string;
  assignedToUserId: string | null;
  answerNotes: string | null;
}): PrayerRequestFormValues {
  return {
    memberId: record.memberId ?? "",
    requesterName: record.requesterName ?? "",
    request: record.request,
    status: record.status,
    privacyLevel: record.privacyLevel,
    assignedToUserId: record.assignedToUserId ?? "",
    answerNotes: record.answerNotes ?? "",
  };
}
