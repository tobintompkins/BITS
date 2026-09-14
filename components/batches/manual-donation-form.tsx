"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";

import {
  createManualBatchDonationAction,
  searchBatchDonationDonorsAction,
} from "@/app/(staff)/batches/actions";
import { Toast } from "@/components/ui/toast";
import {
  formatMoney,
  isValidPositiveMoneyInput,
  sumMoneyAmounts,
} from "@/lib/money/decimal";
import {
  emptyManualBatchDonationFormValues,
  manualBatchDonationFormSchema,
  type ManualBatchDonationFormValues,
} from "@/lib/validation/manual-batch-donation";

type DonorOption = {
  id: string;
  name: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
  householdName: string | null;
};

type FundOption = {
  id: string;
  name: string;
};

type ManualDonationFormProps = {
  batchId: string;
  batchName: string;
  batchOfferingDate: string;
  funds: FundOption[];
};

const inputClassName =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)] disabled:cursor-not-allowed disabled:bg-[var(--bits-bg)]";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-rose-700">{message}</p>;
}

export function ManualDonationForm({
  batchId,
  batchName,
  batchOfferingDate,
  funds,
}: ManualDonationFormProps) {
  const router = useRouter();
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const [query, setQuery] = useState("");
  const [donors, setDonors] = useState<DonorOption[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const form = useForm<ManualBatchDonationFormValues>({
    resolver: zodResolver(
      manualBatchDonationFormSchema,
    ) as Resolver<ManualBatchDonationFormValues>,
    defaultValues: emptyManualBatchDonationFormValues(batchOfferingDate),
  });

  const allocations = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const [anonymous, setAnonymous] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [offeringDate, setOfferingDate] = useState(batchOfferingDate);
  const [goodsProvided, setGoodsProvided] = useState(false);
  const [taxDeductible, setTaxDeductible] = useState(true);
  const [allocationAmounts, setAllocationAmounts] = useState<string[]>([""]);

  const allocationTotal = useMemo(() => {
    const valid = allocationAmounts.filter(isValidPositiveMoneyInput);
    return valid.length ? sumMoneyAmounts(valid) : "0.00";
  }, [allocationAmounts]);

  const dateDiffers = offeringDate !== batchOfferingDate;

  function runSearch() {
    startSearch(async () => {
      setSearchError(null);
      const result = await searchBatchDonationDonorsAction(query);
      if (!result.ok) {
        setDonors([]);
        setSearchError(result.error);
        return;
      }
      setDonors(result.donors);
      if (result.donors.length === 0) {
        setSearchError("No active donors in this church matched that search.");
      }
    });
  }

  function onSubmit(values: ManualBatchDonationFormValues) {
    startTransition(async () => {
      const result = await createManualBatchDonationAction(batchId, values);
      if (result.status === "success") {
        router.push(`/batches/${batchId}?donation=created`);
        router.refresh();
        return;
      }
      setToast({
        message: result.message ?? "Unable to record this donation.",
        variant: "error",
      });
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        if (messages?.[0]) {
          form.setError(field as keyof ManualBatchDonationFormValues, {
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
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">Donor</h2>
        <p className="mt-1 text-sm text-[var(--bits-muted)]">
          Search active donors in this church, or record an anonymous gift.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-[var(--bits-navy)]">
          <input
            type="checkbox"
            {...form.register("anonymous", {
              onChange: (event) => {
                const checked = event.target.checked;
                setAnonymous(checked);
                if (checked) {
                  form.setValue("donorId", "");
                  setDonors([]);
                }
              },
            })}
            disabled={isPending}
          />
          Anonymous
        </label>
        {anonymous ? null : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, email, or phone"
                className={`${inputClassName} mt-0 max-w-md`}
              />
              <button
                type="button"
                onClick={runSearch}
                disabled={searching || isPending}
                className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
              >
                {searching ? "Searching…" : "Search donors"}
              </button>
            </div>
            {searchError ? (
              <p className="text-sm text-rose-700">{searchError}</p>
            ) : null}
            {donors.length ? (
              <fieldset className="space-y-2">
                <legend className="sr-only">Select donor</legend>
                {donors.map((donor) => (
                  <label
                    key={donor.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--bits-border)] p-3"
                  >
                    <input
                      type="radio"
                      value={donor.id}
                      {...form.register("donorId")}
                      disabled={isPending}
                    />
                    <span>
                      <span className="block font-medium text-[var(--bits-navy)]">
                        {donor.name}
                      </span>
                      <span className="block text-xs text-[var(--bits-muted)]">
                        {[donor.maskedEmail, donor.maskedPhone, donor.householdName]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
        )}
        <FieldError message={form.formState.errors.donorId?.message} />
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Gift details
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Offering date *</span>
            <input
              type="date"
              {...form.register("offeringDate", {
                onChange: (event) => setOfferingDate(event.target.value),
              })}
              disabled={isPending}
              className={inputClassName}
            />
            <FieldError message={form.formState.errors.offeringDate?.message} />
            {dateDiffers ? (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p>
                  This offering date differs from {batchName}&apos;s batch date.
                  Confirm before saving.
                </p>
                <label className="mt-2 flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    {...form.register("confirmOfferingDateOverride")}
                    disabled={isPending}
                  />
                  Use this different offering date
                </label>
              </div>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Received date *</span>
            <input
              type="date"
              {...form.register("receivedDate")}
              disabled={isPending}
              className={inputClassName}
            />
            <FieldError message={form.formState.errors.receivedDate?.message} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Payment method *</span>
            <select
              {...form.register("paymentMethod", {
                onChange: (event) => {
                  setPaymentMethod(event.target.value);
                  if (event.target.value !== "CHECK") {
                    form.setValue("checkNumber", "");
                  }
                },
              })}
              disabled={isPending}
              className={inputClassName}
            >
              <option value="CASH">Cash</option>
              <option value="CHECK">Check</option>
              <option value="STOCK_OR_NONCASH">Stock or non-cash</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          {paymentMethod === "CHECK" ? (
            <label className="block text-sm">
              <span className="font-medium text-[var(--bits-navy)]">Check number *</span>
              <input
                {...form.register("checkNumber")}
                disabled={isPending}
                className={inputClassName}
              />
              <FieldError message={form.formState.errors.checkNumber?.message} />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Reference</span>
            <input
              {...form.register("reference")}
              disabled={isPending}
              className={inputClassName}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-[var(--bits-navy)]">Note</span>
            <textarea
              {...form.register("note")}
              rows={3}
              disabled={isPending}
              className={inputClassName}
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Tax and benefits
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--bits-navy)]">
            <input
              type="checkbox"
              {...form.register("isTaxDeductible", {
                onChange: (event) => {
                  const checked = event.target.checked;
                  setTaxDeductible(checked);
                  if (!checked) form.setValue("deductibleAmount", "0.00");
                },
              })}
              disabled={isPending}
            />
            Tax-deductible
          </label>
          <label className="block text-sm">
            <span className="font-medium text-[var(--bits-navy)]">
              Deductible amount
            </span>
            <input
              {...form.register("deductibleAmount")}
              inputMode="decimal"
              disabled={isPending || !taxDeductible}
              className={inputClassName}
            />
            <FieldError message={form.formState.errors.deductibleAmount?.message} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--bits-navy)] md:col-span-2">
            <input
              type="checkbox"
              {...form.register("goodsOrServicesProvided", {
                onChange: (event) => setGoodsProvided(event.target.checked),
              })}
              disabled={isPending}
            />
            Goods or services were provided
          </label>
          {goodsProvided ? (
            <>
              <label className="block text-sm md:col-span-2">
                <span className="font-medium text-[var(--bits-navy)]">
                  Goods or services description
                </span>
                <input
                  {...form.register("goodsOrServicesDescription")}
                  disabled={isPending}
                  className={inputClassName}
                />
                <FieldError
                  message={form.formState.errors.goodsOrServicesDescription?.message}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-[var(--bits-navy)]">
                  Estimated value
                </span>
                <input
                  {...form.register("goodsOrServicesEstimatedValue")}
                  inputMode="decimal"
                  disabled={isPending}
                  className={inputClassName}
                />
                <FieldError
                  message={
                    form.formState.errors.goodsOrServicesEstimatedValue?.message
                  }
                />
              </label>
            </>
          ) : null}
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--bits-navy)] md:col-span-2">
            <input
              type="checkbox"
              {...form.register("intangibleReligiousBenefitsOnly")}
              disabled={isPending}
            />
            Intangible religious benefits only
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
              Fund allocations
            </h2>
            <p className="mt-1 text-sm text-[var(--bits-muted)]">
              Split this gift across one or more active giving funds.
            </p>
          </div>
          <p className="text-sm font-semibold text-[var(--bits-navy)]">
            Total {formatMoney(allocationTotal)}
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {allocations.fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 rounded-xl border border-[var(--bits-border)] p-3 md:grid-cols-[1fr_10rem_auto]"
            >
              <label className="block text-sm">
                <span className="font-medium text-[var(--bits-navy)]">Giving fund</span>
                <select
                  {...form.register(`allocations.${index}.offeringTypeId`)}
                  disabled={isPending}
                  className={inputClassName}
                >
                  <option value="">Select a fund</option>
                  {funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-[var(--bits-navy)]">Amount</span>
                <input
                  {...form.register(`allocations.${index}.amount`, {
                    onChange: (event) => {
                      setAllocationAmounts((current) => {
                        const next = [...current];
                        next[index] = event.target.value;
                        return next;
                      });
                    },
                  })}
                  inputMode="decimal"
                  disabled={isPending}
                  className={inputClassName}
                />
              </label>
              {allocations.fields.length > 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    allocations.remove(index);
                    setAllocationAmounts((current) =>
                      current.filter((_, rowIndex) => rowIndex !== index),
                    );
                  }}
                  className="self-end rounded-xl border border-[var(--bits-border)] px-3 py-2 text-sm font-semibold text-[var(--bits-navy)]"
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <FieldError message={form.formState.errors.allocations?.message} />
          <FieldError
            message={form.formState.errors.allocations?.root?.message}
          />
          <button
            type="button"
            onClick={() => {
              allocations.append({ offeringTypeId: "", amount: "" });
              setAllocationAmounts((current) => [...current, ""]);
            }}
            className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)]"
          >
            Add allocation row
          </button>
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push(`/batches/${batchId}`)}
          disabled={isPending}
          className="rounded-xl border border-[var(--bits-border)] px-4 py-2 text-sm font-semibold text-[var(--bits-navy)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          {isPending ? "Saving..." : "Save donation"}
        </button>
      </div>
    </form>
  );
}
