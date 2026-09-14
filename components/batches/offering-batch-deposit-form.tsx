"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { saveBatchDepositAction } from "@/app/(staff)/batches/actions";
import { Toast } from "@/components/ui/toast";
import { utcTodayDateString } from "@/lib/batches/dates";
import { formatMoney } from "@/lib/money/decimal";
import {
  createOfferingBatchDepositActionState,
  offeringBatchDepositFormSchema,
  type OfferingBatchDepositActionState,
  type OfferingBatchDepositFormValues,
} from "@/lib/validation/offering-batch-deposit";

const inputClassName =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)] disabled:cursor-not-allowed disabled:bg-[var(--bits-bg)]";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-rose-700">{message}</p>;
}

export function OfferingBatchDepositForm({
  batchId,
  offeringDate,
  recordedTotal,
  initialValues,
}: {
  batchId: string;
  offeringDate: string;
  recordedTotal: string;
  initialValues: OfferingBatchDepositFormValues;
}) {
  const router = useRouter();
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<OfferingBatchDepositFormValues>({
    resolver: zodResolver(
      offeringBatchDepositFormSchema,
    ) as Resolver<OfferingBatchDepositFormValues>,
    defaultValues: initialValues,
  });

  function onSubmit(values: OfferingBatchDepositFormValues) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("depositDate", values.depositDate);
      formData.set("depositReference", values.depositReference);

      const result: OfferingBatchDepositActionState =
        await saveBatchDepositAction(
          batchId,
          createOfferingBatchDepositActionState(),
          formData,
        );

      if (result.status === "success") {
        setToast({
          message: result.message ?? "Deposit information saved.",
          variant: "success",
        });
        router.refresh();
        return;
      }

      setToast({
        message: result.message ?? "Unable to save this deposit.",
        variant: "error",
      });
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        if (messages?.[0]) {
          form.setError(field as keyof OfferingBatchDepositFormValues, {
            message: messages[0],
          });
        }
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-[var(--bits-navy)]">
            Deposit date *
          </span>
          <input
            type="date"
            min={offeringDate}
            max={utcTodayDateString()}
            {...form.register("depositDate")}
            disabled={isPending}
            className={inputClassName}
          />
          <FieldError message={form.formState.errors.depositDate?.message} />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-[var(--bits-navy)]">
            Deposit reference *
          </span>
          <input
            {...form.register("depositReference")}
            disabled={isPending}
            autoComplete="off"
            className={inputClassName}
          />
          <p className="mt-1 text-xs text-[var(--bits-muted)]">
            Use a deposit-slip number, internal reference, or confirmation
            identifier. Do not enter bank-account or routing numbers.
          </p>
          <FieldError
            message={form.formState.errors.depositReference?.message}
          />
        </label>

        <div className="text-sm">
          <p className="font-medium text-[var(--bits-navy)]">
            Deposited amount
          </p>
          <p className="mt-1 rounded-xl border border-[var(--bits-border)] bg-[var(--bits-bg)] px-3 py-2 text-[var(--bits-navy)]">
            {formatMoney(recordedTotal)}
          </p>
          <p className="mt-1 text-xs text-[var(--bits-muted)]">
            This equals the batch recorded total and cannot be edited here.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          {isPending ? "Saving..." : "Save Deposit"}
        </button>
      </div>
    </form>
  );
}
