"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";

import {
  createHouseholdAction,
  updateHouseholdAction,
} from "@/app/(staff)/household/actions";
import { Toast } from "@/components/ui/toast";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import {
  emptyHouseholdFormValues,
  householdSchema,
  type HouseholdActionState,
  type HouseholdFormValues,
} from "@/lib/validation/household";

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

type HouseholdFormProps = {
  mode: "create" | "edit";
  initialValues?: HouseholdFormValues;
  householdId?: string;
  members: MemberOption[];
  canEdit: boolean;
};

const inputClassName =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800 dark:disabled:bg-zinc-800";

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

export function HouseholdForm({
  mode,
  initialValues = emptyHouseholdFormValues,
  householdId,
  members,
  canEdit,
}: HouseholdFormProps) {
  const router = useRouter();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<HouseholdFormValues>({
    resolver: zodResolver(householdSchema) as Resolver<HouseholdFormValues>,
    defaultValues: initialValues,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  function onSubmit(values: HouseholdFormValues) {
    startTransition(async () => {
      const formData = new FormData();
      Object.entries(values).forEach(([key, value]) => {
        formData.set(key, value ?? "");
      });

      let result: HouseholdActionState;

      if (mode === "create") {
        result = await createHouseholdAction(
          { status: "idle", fieldErrors: {} },
          formData,
        );
      } else if (householdId) {
        result = await updateHouseholdAction(
          householdId,
          { status: "idle", fieldErrors: {} },
          formData,
        );
      } else {
        return;
      }

      if (result.status === "success") {
        setToastMessage(result.message ?? "Saved successfully.");
        if (mode === "create" && result.householdId) {
          router.push(`/household/${result.householdId}`);
        } else {
          router.refresh();
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {toastMessage ? (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Household Details
          </h2>
        </div>
        <div className="grid gap-4 px-4 py-6 sm:px-6 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Household name *
            </span>
            <input
              {...register("householdName")}
              disabled={!canEdit || isPending}
              className={`${inputClassName} mt-1`}
            />
            <FieldError message={errors.householdName?.message} />
          </label>

          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Primary contact
            </span>
            <select
              {...register("primaryContactId")}
              disabled={!canEdit || isPending}
              className={`${inputClassName} mt-1`}
            >
              <option value="">No primary contact</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {getMemberDisplayName(member)}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Address line 1
            </span>
            <input
              {...register("addressLine1")}
              disabled={!canEdit || isPending}
              className={`${inputClassName} mt-1`}
            />
          </label>

          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Address line 2
            </span>
            <input
              {...register("addressLine2")}
              disabled={!canEdit || isPending}
              className={`${inputClassName} mt-1`}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">City</span>
            <input
              {...register("city")}
              disabled={!canEdit || isPending}
              className={`${inputClassName} mt-1`}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">State</span>
            <input
              {...register("state")}
              disabled={!canEdit || isPending}
              className={`${inputClassName} mt-1`}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">ZIP</span>
            <input
              {...register("postalCode")}
              disabled={!canEdit || isPending}
              className={`${inputClassName} mt-1`}
            />
            <FieldError message={errors.postalCode?.message} />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Country</span>
            <input
              {...register("country")}
              disabled={!canEdit || isPending}
              className={`${inputClassName} mt-1`}
            />
          </label>
        </div>
      </section>

      {canEdit ? (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isPending}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isPending ? "Saving..." : mode === "create" ? "Create Household" : "Save Changes"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
