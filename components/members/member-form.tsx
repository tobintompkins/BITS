"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { formatMembershipStatus } from "@/lib/constants/membership-status";
import {
  emptyMemberFormValues,
  memberSchema,
  membershipStatusValues,
  type MemberActionState,
  type MemberFormValues,
} from "@/lib/validation/member";

import {
  createMemberAction,
  updateMemberAction,
} from "@/app/(staff)/member/actions";
import { uploadMemberPhotoAction } from "@/app/(staff)/member/photo-actions";
import { MemberPhotoUploader } from "@/components/members/member-photo-uploader";

type HouseholdOption = {
  id: string;
  householdName: string;
};

type MemberFormProps = {
  mode: "create" | "edit";
  initialValues?: MemberFormValues;
  memberId?: string;
  member?: {
    id: string;
    firstName: string;
    lastName: string;
    preferredName?: string | null;
  };
  photoUrl?: string | null;
  households: HouseholdOption[];
  canEdit: boolean;
};

const inputClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800 dark:disabled:bg-zinc-800";

const sectionClassName =
  "rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900";

const sectionHeaderClassName =
  "border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800";

const sectionBodyClassName = "grid gap-4 px-4 py-6 sm:px-6 md:grid-cols-2";

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
    />
  );
}

function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed right-4 top-4 z-50 max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-lg dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
    >
      <div className="flex items-start justify-between gap-3">
        <span>{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-emerald-700 dark:text-emerald-200"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function MemberForm({
  mode,
  initialValues = emptyMemberFormValues,
  memberId,
  member,
  photoUrl,
  households,
  canEdit,
}: MemberFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema) as unknown as Resolver<MemberFormValues>,
    defaultValues: initialValues,
  });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = form;

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      setServerError(null);
      const formData = new FormData();
      Object.entries(values).forEach(([key, value]) => {
        formData.append(key, String(value ?? ""));
      });

      let result: MemberActionState;

      if (mode === "create") {
        result = await createMemberAction({ status: "idle", fieldErrors: {} }, formData);
      } else if (memberId) {
        result = await updateMemberAction(memberId, { status: "idle", fieldErrors: {} }, formData);
      } else {
        return;
      }

      if (result.status === "success") {
        if (mode === "create" && result.memberId) {
          if (pendingPhoto) {
            const photoFormData = new FormData();
            photoFormData.append("photoFile", pendingPhoto);
            await uploadMemberPhotoAction(result.memberId, photoFormData);
          }

          setToastMessage("Member created successfully.");
          router.push(`/member/${result.memberId}`);
          router.refresh();
          return;
        }

        setToastMessage("Member updated successfully.");
        router.refresh();
        return;
      }

      setServerError(result.message ?? "Unable to save member.");

      Object.entries(result.fieldErrors).forEach(([field, messages]) => {
        if (!messages?.[0]) {
          return;
        }

        setError(field as keyof MemberFormValues, {
          type: "server",
          message: messages[0],
        });
      });
    });
  });

  return (
    <>
      {toastMessage ? (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6">
        {serverError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {serverError}
          </div>
        ) : null}

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Profile Photo
            </h2>
          </div>
          <div className="px-4 py-6 sm:px-6">
            <MemberPhotoUploader
              member={member ?? (memberId ? { id: memberId, firstName: "Member", lastName: "", preferredName: null } : undefined)}
              photoUrl={photoUrl}
              canEdit={canEdit}
              pendingFile={pendingPhoto}
              onPhotoSelected={setPendingPhoto}
            />
          </div>
        </section>

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Personal Information
            </h2>
          </div>
          <div className={sectionBodyClassName}>
            <label className="space-y-2">
              <span className="text-sm font-medium">First Name</span>
              <input {...register("firstName")} disabled={!canEdit || isPending} className={inputClassName} />
              <FieldError message={errors.firstName?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Middle Name</span>
              <input {...register("middleName")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Last Name</span>
              <input {...register("lastName")} disabled={!canEdit || isPending} className={inputClassName} />
              <FieldError message={errors.lastName?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Preferred Name</span>
              <input {...register("preferredName")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Suffix</span>
              <input {...register("suffix")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Date of Birth</span>
              <input type="date" {...register("dateOfBirth")} disabled={!canEdit || isPending} className={inputClassName} />
              <FieldError message={errors.dateOfBirth?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Gender</span>
              <input {...register("gender")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Marital Status</span>
              <input {...register("maritalStatus")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Contact Information
            </h2>
          </div>
          <div className={sectionBodyClassName}>
            <label className="space-y-2">
              <span className="text-sm font-medium">Email</span>
              <input type="email" {...register("email")} disabled={!canEdit || isPending} className={inputClassName} />
              <FieldError message={errors.email?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Phone</span>
              <input {...register("phone")} disabled={!canEdit || isPending} className={inputClassName} />
              <FieldError message={errors.phone?.message} />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">Alternate Phone</span>
              <input {...register("alternatePhone")} disabled={!canEdit || isPending} className={inputClassName} />
              <FieldError message={errors.alternatePhone?.message} />
            </label>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Address
            </h2>
          </div>
          <div className={sectionBodyClassName}>
            <div className="md:col-span-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Address Line 1</span>
                <input {...register("addressLine1")} disabled={!canEdit || isPending} className={inputClassName} />
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Address Line 2</span>
                <input {...register("addressLine2")} disabled={!canEdit || isPending} className={inputClassName} />
              </label>
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium">City</span>
              <input {...register("city")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">State</span>
              <input {...register("state")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">ZIP</span>
              <input {...register("postalCode")} disabled={!canEdit || isPending} className={inputClassName} />
              <FieldError message={errors.postalCode?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Country</span>
              <input {...register("country")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Church Information
            </h2>
          </div>
          <div className={sectionBodyClassName}>
            <label className="space-y-2">
              <span className="text-sm font-medium">Membership Status</span>
              <select {...register("membershipStatus")} disabled={!canEdit || isPending} className={inputClassName}>
                {membershipStatusValues.map((status) => (
                  <option key={status} value={status}>
                    {formatMembershipStatus(status)}
                  </option>
                ))}
              </select>
              <FieldError message={errors.membershipStatus?.message} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Household</span>
              <select {...register("householdId")} disabled={!canEdit || isPending} className={inputClassName}>
                <option value="">No household</option>
                {households.map((household) => (
                  <option key={household.id} value={household.id}>
                    {household.householdName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Member Since</span>
              <input type="date" {...register("memberSince")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Baptism Date</span>
              <input type="date" {...register("baptismDate")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Salvation Date</span>
              <input type="date" {...register("salvationDate")} disabled={!canEdit || isPending} className={inputClassName} />
            </label>
          </div>
        </section>

        <section className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Notes
            </h2>
          </div>
          <div className="px-4 py-6 sm:px-6">
            <textarea
              {...register("notes")}
              disabled={!canEdit || isPending}
              rows={6}
              className={inputClassName}
              placeholder="Internal notes about this member..."
            />
            <FieldError message={errors.notes?.message} />
          </div>
        </section>

        {canEdit ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => reset(initialValues)}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              Reset Form
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {isPending ? <Spinner /> : null}
              {isPending ? "Saving..." : mode === "create" ? "Create Member" : "Save Changes"}
            </button>
          </div>
        ) : null}
      </form>
    </>
  );
}
