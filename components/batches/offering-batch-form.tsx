"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";

import {
  createOfferingBatchAction,
  updateOfferingBatchAction,
} from "@/app/(staff)/batches/actions";
import { Toast } from "@/components/ui/toast";
import {
  createOfferingBatchActionState,
  emptyOfferingBatchFormValues,
  offeringBatchFormSchema,
  type OfferingBatchActionState,
  type OfferingBatchFormValues,
} from "@/lib/validation/offering-batch";

type OfferingBatchFormProps = {
  mode: "create" | "edit";
  batchId?: string;
  initialValues?: OfferingBatchFormValues;
  canEdit: boolean;
};

const inputClassName =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)] disabled:cursor-not-allowed disabled:bg-[var(--bits-bg)]";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-rose-700">{message}</p>;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function OfferingBatchForm({
  mode,
  batchId,
  initialValues = emptyOfferingBatchFormValues,
  canEdit,
}: OfferingBatchFormProps) {
  const router = useRouter();
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<OfferingBatchFormValues>({
    resolver: zodResolver(
      offeringBatchFormSchema,
    ) as Resolver<OfferingBatchFormValues>,
    defaultValues: initialValues,
  });

  const [offeringDate, setOfferingDate] = useState(initialValues.offeringDate);
  const futureDateWarning = Boolean(
    offeringDate && offeringDate > todayDateString(),
  );

  function onSubmit(values: OfferingBatchFormValues) {
    startTransition(async () => {
      const formData = new FormData();
      Object.entries(values).forEach(([key, value]) => {
        formData.set(key, value ?? "");
      });

      let result: OfferingBatchActionState;
      if (mode === "create") {
        result = await createOfferingBatchAction(
          createOfferingBatchActionState(),
          formData,
        );
      } else if (batchId) {
        result = await updateOfferingBatchAction(
          batchId,
          createOfferingBatchActionState(),
          formData,
        );
      } else {
        return;
      }

      if (result.status === "success") {
        setToast({
          message: result.message ?? "Saved successfully.",
          variant: "success",
        });
        if (mode === "create" && result.batchId) {
          router.push(`/batches/${result.batchId}`);
        } else if (batchId) {
          router.push(`/batches/${batchId}`);
          router.refresh();
        }
        return;
      }

      setToast({
        message: result.message ?? "Unable to save this batch.",
        variant: "error",
      });
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        if (messages?.[0]) {
          form.setError(field as keyof OfferingBatchFormValues, {
            message: messages[0],
          });
        }
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Batch details
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-[var(--bits-navy)]">
              Batch name *
            </span>
            <input
              {...form.register("name")}
              disabled={!canEdit || isPending}
              className={inputClassName}
            />
            <FieldError message={form.formState.errors.name?.message} />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-[var(--bits-navy)]">
              Offering date *
            </span>
            <input
              type="date"
              {...form.register("offeringDate", {
                onChange: (event) => setOfferingDate(event.target.value),
              })}
              disabled={!canEdit || isPending}
              className={inputClassName}
            />
            <FieldError message={form.formState.errors.offeringDate?.message} />
            {futureDateWarning ? (
              <p
                role="status"
                className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                This offering date is in the future. You can still save the
                batch.
              </p>
            ) : null}
          </label>

          <label className="block text-sm">
            <span className="font-medium text-[var(--bits-navy)]">
              Service description
            </span>
            <input
              {...form.register("serviceDescription")}
              disabled={!canEdit || isPending}
              className={inputClassName}
            />
            <FieldError
              message={form.formState.errors.serviceDescription?.message}
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-[var(--bits-navy)]">
              Expected total
            </span>
            <input
              {...form.register("expectedTotal")}
              inputMode="decimal"
              placeholder="0.00"
              disabled={!canEdit || isPending}
              className={inputClassName}
            />
            <FieldError message={form.formState.errors.expectedTotal?.message} />
          </label>

          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-[var(--bits-navy)]">Notes</span>
            <textarea
              {...form.register("notes")}
              rows={4}
              disabled={!canEdit || isPending}
              className={inputClassName}
            />
            <FieldError message={form.formState.errors.notes?.message} />
          </label>
        </div>
      </section>

      {canEdit ? (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push(batchId ? `/batches/${batchId}` : "/batches")}
            disabled={isPending}
            className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            {isPending
              ? "Saving..."
              : mode === "create"
                ? "Create Batch"
                : "Save Changes"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
