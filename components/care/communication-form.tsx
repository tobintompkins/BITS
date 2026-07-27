"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createCommunicationAction,
  updateCommunicationAction,
} from "@/app/(staff)/care/actions";
import {
  inputClassName,
  sectionBodyClassName,
  sectionClassName,
  sectionHeaderClassName,
  toDateInputValue,
  type MemberOption,
} from "@/components/care/care-form-utils";
import { Toast } from "@/components/ui/toast";
import {
  communicationDirectionOptions,
  communicationTypeOptions,
} from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";

export type CommunicationFormValues = {
  memberId: string;
  communicationType: string;
  direction: string;
  subject: string;
  messageSummary: string;
  communicationDate: string;
  outcome: string;
  followUpRequired: boolean;
  followUpDate: string;
};

type CommunicationFormProps = {
  mode: "create" | "edit";
  members: MemberOption[];
  initialValues: CommunicationFormValues;
  communicationId?: string;
  canEdit: boolean;
  lockMember?: boolean;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

export function CommunicationForm({
  mode,
  members,
  initialValues,
  communicationId,
  canEdit,
  lockMember = false,
}: CommunicationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [followUpRequired, setFollowUpRequired] = useState(
    initialValues.followUpRequired,
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    const formData = new FormData(event.currentTarget);
    formData.set("followUpRequired", followUpRequired ? "true" : "false");

    startTransition(async () => {
      setError(null);
      setFieldErrors({});

      const result =
        mode === "create"
          ? await createCommunicationAction(formData)
          : communicationId
            ? await updateCommunicationAction(communicationId, formData)
            : { status: "error" as const, message: "Missing communication id." };

      if (result.status === "success") {
        setToast(result.message);
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
              Communication Log
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
                Type
              </span>
              <select
                name="communicationType"
                defaultValue={initialValues.communicationType}
                disabled={!canEdit}
                className={inputClassName}
              >
                {communicationTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.communicationType?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Direction
              </span>
              <select
                name="direction"
                defaultValue={initialValues.direction}
                disabled={!canEdit}
                className={inputClassName}
              >
                {communicationDirectionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.direction?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Communication Date
              </span>
              <input
                type="date"
                name="communicationDate"
                defaultValue={initialValues.communicationDate}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.communicationDate?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Subject (optional)
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
                Message Summary
              </span>
              <textarea
                name="messageSummary"
                rows={4}
                defaultValue={initialValues.messageSummary}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.messageSummary?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Outcome (optional)
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

            <label className="flex items-center gap-3 md:col-span-2">
              <input
                type="checkbox"
                checked={followUpRequired}
                onChange={(event) => setFollowUpRequired(event.target.checked)}
                disabled={!canEdit}
                className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
              />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Follow-up required
              </span>
            </label>

            {followUpRequired ? (
              <label className="space-y-2 md:col-span-2">
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
            ) : (
              <input type="hidden" name="followUpDate" value="" />
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
                  ? "Log communication"
                  : "Update communication"}
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}

export const emptyCommunicationFormValues: CommunicationFormValues = {
  memberId: "",
  communicationType: "PHONE",
  direction: "OUTBOUND",
  subject: "",
  messageSummary: "",
  communicationDate: new Date().toISOString().slice(0, 10),
  outcome: "",
  followUpRequired: false,
  followUpDate: "",
};

export function mapCommunicationToFormValues(record: {
  memberId: string;
  communicationType: string;
  direction: string;
  subject: string | null;
  messageSummary: string;
  communicationDate: Date;
  outcome: string | null;
  followUpRequired: boolean;
  followUpDate: Date | null;
}): CommunicationFormValues {
  return {
    memberId: record.memberId,
    communicationType: record.communicationType,
    direction: record.direction,
    subject: record.subject ?? "",
    messageSummary: record.messageSummary,
    communicationDate: toDateInputValue(record.communicationDate),
    outcome: record.outcome ?? "",
    followUpRequired: record.followUpRequired,
    followUpDate: toDateInputValue(record.followUpDate),
  };
}
