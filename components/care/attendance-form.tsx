"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createAttendanceAction,
  updateAttendanceAction,
} from "@/app/(staff)/care/actions";
import {
  inputClassName,
  sectionBodyClassName,
  sectionClassName,
  sectionHeaderClassName,
  toDateInputValue,
  toTimeInputValue,
  type MemberOption,
} from "@/components/care/care-form-utils";
import { Toast } from "@/components/ui/toast";
import { attendanceTypeOptions } from "@/lib/constants/care-engagement";
import { getMemberDisplayName } from "@/lib/utils/member-display";

export type AttendanceFormValues = {
  memberId: string;
  attendanceDate: string;
  serviceName: string;
  attendanceType: string;
  checkInTime: string;
  checkOutTime: string;
  notes: string;
};

type AttendanceFormProps = {
  mode: "create" | "edit";
  members: MemberOption[];
  initialValues: AttendanceFormValues;
  attendanceId?: string;
  canEdit: boolean;
  lockMember?: boolean;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

export function AttendanceForm({
  mode,
  members,
  initialValues,
  attendanceId,
  canEdit,
  lockMember = false,
}: AttendanceFormProps) {
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
          ? await createAttendanceAction(formData)
          : attendanceId
            ? await updateAttendanceAction(attendanceId, formData)
            : { status: "error" as const, message: "Missing attendance id." };

      if (result.status === "success") {
        setToast(result.message);
        if (mode === "create" && "id" in result && result.id) {
          router.push(`/attendance/${result.id}/edit`);
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
              Attendance Details
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
                Attendance Date
              </span>
              <input
                type="date"
                name="attendanceDate"
                defaultValue={initialValues.attendanceDate}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.attendanceDate?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Attendance Type
              </span>
              <select
                name="attendanceType"
                defaultValue={initialValues.attendanceType}
                disabled={!canEdit}
                className={inputClassName}
              >
                {attendanceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.attendanceType?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Service / Event Name
              </span>
              <input
                type="text"
                name="serviceName"
                defaultValue={initialValues.serviceName}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.serviceName?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Check-In Time
              </span>
              <input
                type="time"
                name="checkInTime"
                defaultValue={initialValues.checkInTime}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.checkInTime?.[0]} />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Check-Out Time
              </span>
              <input
                type="time"
                name="checkOutTime"
                defaultValue={initialValues.checkOutTime}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.checkOutTime?.[0]} />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Notes
              </span>
              <textarea
                name="notes"
                rows={3}
                defaultValue={initialValues.notes}
                disabled={!canEdit}
                className={inputClassName}
              />
              <FieldError message={fieldErrors.notes?.[0]} />
            </label>
          </div>
        </section>

        {canEdit ? (
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isPending ? "Saving..." : mode === "create" ? "Save attendance" : "Update attendance"}
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}

export function mapAttendanceToFormValues(record: {
  memberId: string;
  attendanceDate: Date;
  serviceName: string;
  attendanceType: string;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  notes: string | null;
}): AttendanceFormValues {
  return {
    memberId: record.memberId,
    attendanceDate: toDateInputValue(record.attendanceDate),
    serviceName: record.serviceName,
    attendanceType: record.attendanceType,
    checkInTime: toTimeInputValue(record.checkInTime),
    checkOutTime: toTimeInputValue(record.checkOutTime),
    notes: record.notes ?? "",
  };
}
