"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import {
  useFieldArray,
  useForm,
  type FieldPath,
  type Resolver,
} from "react-hook-form";

import {
  createManualBatchDonationAction,
  searchBatchDonationDonorsAction,
  updateManualBatchDonationAction,
} from "@/app/(staff)/batches/actions";
import { Toast } from "@/components/ui/toast";
import {
  formatMoney,
  isValidPositiveMoneyInput,
  sumMoneyAmounts,
} from "@/lib/money/decimal";
import {
  clearManualDonationOperationToken,
  readOrCreateManualDonationOperationToken,
} from "@/lib/batches/create-operation-token";
import {
  emptyManualBatchDonationFormValues,
  type ManualBatchDonationFormValues,
} from "@/lib/validation/manual-batch-donation";
import {
  allocationRowBindings,
  allocationsGroupMessage,
  applyDottedFieldErrors,
  describedFieldBinding,
  donorSearchFeedback,
  rhfMessage,
  shouldClearCreateOperationToken,
  withOfferingDateConfirmation,
} from "@/lib/validation/manual-donation-field-errors";

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
  churchName?: string | null;
  funds: FundOption[];
  donationId?: string;
  initialValues?: ManualBatchDonationFormValues;
  selectedDonor?: DonorOption | null;
  expectedReviewVersion?: number;
};

const inputClassName =
  "mt-1 w-full rounded-xl border border-[var(--bits-border)] bg-white px-3 py-2 text-sm text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)] disabled:cursor-not-allowed disabled:bg-[var(--bits-bg)]";

function FieldError({
  id,
  message,
}: {
  id?: string;
  message?: string;
}) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-rose-700">
      {message}
    </p>
  );
}

export function ManualDonationForm({
  batchId,
  batchName,
  batchOfferingDate,
  churchName,
  funds,
  donationId,
  initialValues,
  selectedDonor = null,
  expectedReviewVersion,
}: ManualDonationFormProps) {
  const router = useRouter();
  const formId = useId();
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const [query, setQuery] = useState("");
  const [donors, setDonors] = useState<DonorOption[]>(
    selectedDonor ? [selectedDonor] : [],
  );
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchFailureMessage, setSearchFailureMessage] = useState<
    string | undefined
  >(undefined);
  const [searched, setSearched] = useState(false);

  const form = useForm<ManualBatchDonationFormValues>({
    resolver: zodResolver(
      withOfferingDateConfirmation(batchOfferingDate),
    ) as Resolver<ManualBatchDonationFormValues>,
    defaultValues:
      initialValues ?? emptyManualBatchDonationFormValues(batchOfferingDate),
  });

  const allocations = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const [anonymous, setAnonymous] = useState(initialValues?.anonymous ?? false);
  const [paymentMethod, setPaymentMethod] = useState(
    initialValues?.paymentMethod ?? "CASH",
  );
  const [offeringDate, setOfferingDate] = useState(
    initialValues?.offeringDate ?? batchOfferingDate,
  );
  const [goodsProvided, setGoodsProvided] = useState(
    initialValues?.goodsOrServicesProvided ?? false,
  );
  const [taxDeductible, setTaxDeductible] = useState(
    initialValues?.isTaxDeductible ?? true,
  );
  const [allocationAmounts, setAllocationAmounts] = useState<string[]>(
    initialValues?.allocations.map((row) => row.amount) ?? [""],
  );

  const allocationTotal = useMemo(() => {
    const valid = allocationAmounts.filter(isValidPositiveMoneyInput);
    return valid.length ? sumMoneyAmounts(valid) : "0.00";
  }, [allocationAmounts]);

  const dateDiffers = offeringDate !== batchOfferingDate;
  const errors = form.formState.errors;
  const searchFeedback = donorSearchFeedback({
    failed: searchFailed,
    failureMessage: searchFailureMessage,
    resultCount: donors.length,
    searched,
  });
  const donorBinding = describedFieldBinding(
    `${formId}-donor-error`,
    rhfMessage(errors.donorId),
  );
  const offeringDateHelpId = dateDiffers ? `${formId}-offering-date-help` : undefined;
  const offeringDateBinding = describedFieldBinding(
    `${formId}-offering-date-error`,
    rhfMessage(errors.offeringDate),
    offeringDateHelpId,
  );
  const confirmDateBinding = describedFieldBinding(
    `${formId}-offering-date-confirm-error`,
    rhfMessage(errors.confirmOfferingDateOverride),
  );
  const receivedDateBinding = describedFieldBinding(
    `${formId}-received-date-error`,
    rhfMessage(errors.receivedDate),
  );
  const paymentMethodBinding = describedFieldBinding(
    `${formId}-payment-method-error`,
    rhfMessage(errors.paymentMethod),
  );
  const checkNumberBinding = describedFieldBinding(
    `${formId}-check-number-error`,
    rhfMessage(errors.checkNumber),
  );
  const deductibleBinding = describedFieldBinding(
    `${formId}-deductible-error`,
    rhfMessage(errors.deductibleAmount),
  );
  const goodsDescriptionBinding = describedFieldBinding(
    `${formId}-goods-description-error`,
    rhfMessage(errors.goodsOrServicesDescription),
  );
  const goodsValueBinding = describedFieldBinding(
    `${formId}-goods-value-error`,
    rhfMessage(errors.goodsOrServicesEstimatedValue),
  );
  const allocationsMessage = allocationsGroupMessage(errors.allocations);
  const allocationsGroupId = `${formId}-allocations-error`;
  const searchErrorId = `${formId}-donor-search-error`;

  function runSearch() {
    startSearch(async () => {
      setSearchFailed(false);
      setSearchFailureMessage(undefined);
      setSearched(true);
      const result = await searchBatchDonationDonorsAction(query);
      if (!result.ok) {
        setDonors([]);
        setSearchFailed(true);
        setSearchFailureMessage(result.error);
        return;
      }
      setDonors(result.donors);
    });
  }

  function onSubmit(values: ManualBatchDonationFormValues) {
    startTransition(async () => {
      const result = donationId
        ? await updateManualBatchDonationAction(
            batchId,
            donationId,
            values,
            expectedReviewVersion ?? 0,
          )
        : await createManualBatchDonationAction(
            batchId,
            values,
            readOrCreateManualDonationOperationToken(batchId),
          );
      if (shouldClearCreateOperationToken({
        status: result.status,
        isEdit: Boolean(donationId),
      })) {
        clearManualDonationOperationToken(batchId);
        router.push(`/batches/${batchId}?donation=created`);
        router.refresh();
        return;
      }
      if (result.status === "success") {
        router.push(`/batches/${batchId}?donation=created`);
        router.refresh();
        return;
      }
      setToast({
        message: result.message ?? "Unable to record this donation.",
        variant: "error",
      });
      applyDottedFieldErrors(result.fieldErrors, (name, error) => {
        form.setError(name as FieldPath<ManualBatchDonationFormValues>, error);
      });
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

      <section
        className="rounded-2xl border border-[var(--bits-border)] bg-[var(--bits-page)] p-5"
        aria-label="Gift context"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-hover)]">
          Draft batch
        </p>
        <p className="mt-1 text-lg font-semibold text-[var(--bits-navy)]">
          {batchName}
        </p>
        {churchName ? (
          <p className="mt-1 text-sm text-[var(--bits-navy)]">{churchName}</p>
        ) : null}
        <p className="mt-1 text-sm text-[var(--bits-muted)]">
          Batch offering date {batchOfferingDate}
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">Who</h2>
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
                  setSearched(false);
                  setSearchFailed(false);
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
              <label className="block max-w-md flex-1 text-sm">
                <span className="font-medium text-[var(--bits-navy)]">
                  Search donors
                </span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Name, email, or phone"
                  aria-invalid={searchFeedback.invalidatesSearch ? true : undefined}
                  aria-describedby={
                    searchFeedback.message ? searchErrorId : undefined
                  }
                  className={`${inputClassName} mt-1`}
                />
              </label>
              <button
                type="button"
                onClick={runSearch}
                disabled={searching || isPending}
                className="self-end rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
              >
                {searching ? "Searching…" : "Search donors"}
              </button>
            </div>
            {searchFeedback.message ? (
              <p
                id={searchErrorId}
                role={searchFeedback.kind === "alert" ? "alert" : "status"}
                className={
                  searchFeedback.kind === "alert"
                    ? "text-sm text-rose-700"
                    : "text-sm text-[var(--bits-muted)]"
                }
              >
                {searchFeedback.message}
              </p>
            ) : null}
            {donors.length ? (
              <fieldset
                className="space-y-2"
                aria-describedby={donorBinding.describedBy}
              >
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
        <FieldError id={donorBinding.errorId} message={donorBinding.message} />
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">
          Payment
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="block text-sm">
            <label className="block">
              <span className="font-medium text-[var(--bits-navy)]">Offering date *</span>
              <input
                type="date"
                {...form.register("offeringDate", {
                  onChange: (event) => setOfferingDate(event.target.value),
                })}
                aria-invalid={offeringDateBinding.invalid}
                aria-describedby={offeringDateBinding.describedBy}
                disabled={isPending}
                className={inputClassName}
              />
            </label>
            <FieldError
              id={offeringDateBinding.errorId}
              message={offeringDateBinding.message}
            />
            {dateDiffers ? (
              <div
                id={offeringDateHelpId}
                role="status"
                className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                <p>
                  This offering date differs from {batchName}&apos;s batch date.
                  Confirm before saving.
                </p>
                <label className="mt-2 flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    {...form.register("confirmOfferingDateOverride")}
                    aria-invalid={confirmDateBinding.invalid}
                    aria-describedby={confirmDateBinding.describedBy}
                    disabled={isPending}
                  />
                  Use this different offering date
                </label>
                <FieldError
                  id={confirmDateBinding.errorId}
                  message={confirmDateBinding.message}
                />
              </div>
            ) : null}
          </div>
          <label className="block text-sm">
            <span className="font-medium text-[var(--bits-navy)]">Received date *</span>
            <input
              type="date"
              {...form.register("receivedDate")}
              aria-invalid={receivedDateBinding.invalid}
              aria-describedby={receivedDateBinding.describedBy}
              disabled={isPending}
              className={inputClassName}
            />
            <FieldError
              id={receivedDateBinding.errorId}
              message={receivedDateBinding.message}
            />
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
              aria-invalid={paymentMethodBinding.invalid}
              aria-describedby={paymentMethodBinding.describedBy}
              disabled={isPending}
              className={inputClassName}
            >
              <option value="CASH">Cash</option>
              <option value="CHECK">Check</option>
              <option value="STOCK_OR_NONCASH">Stock or non-cash</option>
              <option value="OTHER">Other</option>
            </select>
            <FieldError
              id={paymentMethodBinding.errorId}
              message={paymentMethodBinding.message}
            />
          </label>
          {paymentMethod === "CHECK" ? (
            <label className="block text-sm">
              <span className="font-medium text-[var(--bits-navy)]">Check number *</span>
              <input
                {...form.register("checkNumber")}
                aria-invalid={checkNumberBinding.invalid}
                aria-describedby={checkNumberBinding.describedBy}
                disabled={isPending}
                className={inputClassName}
              />
              <FieldError
                id={checkNumberBinding.errorId}
                message={checkNumberBinding.message}
              />
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
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--bits-border)] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--bits-navy)]">Notes</h2>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-[var(--bits-navy)]">Note</span>
          <textarea
            {...form.register("note")}
            rows={3}
            disabled={isPending}
            className={inputClassName}
          />
        </label>
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
              aria-invalid={deductibleBinding.invalid}
              aria-describedby={deductibleBinding.describedBy}
              disabled={isPending || !taxDeductible}
              className={inputClassName}
            />
            <FieldError
              id={deductibleBinding.errorId}
              message={deductibleBinding.message}
            />
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
                  aria-invalid={goodsDescriptionBinding.invalid}
                  aria-describedby={goodsDescriptionBinding.describedBy}
                  disabled={isPending}
                  className={inputClassName}
                />
                <FieldError
                  id={goodsDescriptionBinding.errorId}
                  message={goodsDescriptionBinding.message}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-[var(--bits-navy)]">
                  Estimated value
                </span>
                <input
                  {...form.register("goodsOrServicesEstimatedValue")}
                  inputMode="decimal"
                  aria-invalid={goodsValueBinding.invalid}
                  aria-describedby={goodsValueBinding.describedBy}
                  disabled={isPending}
                  className={inputClassName}
                />
                <FieldError
                  id={goodsValueBinding.errorId}
                  message={goodsValueBinding.message}
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
              Funds
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
          {allocations.fields.map((field, index) => {
            const row = allocationRowBindings(
              formId,
              field.id,
              errors.allocations,
              index,
            );
            return (
              <div
                key={field.id}
                className="grid gap-3 rounded-xl border border-[var(--bits-border)] p-3 md:grid-cols-[1fr_10rem_auto]"
              >
                <label className="block text-sm">
                  <span className="font-medium text-[var(--bits-navy)]">
                    Giving fund {index + 1}
                  </span>
                  <select
                    {...form.register(`allocations.${index}.offeringTypeId`)}
                    aria-invalid={row.offeringTypeId.invalid}
                    aria-describedby={row.offeringTypeId.describedBy}
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
                  <FieldError
                    id={row.offeringTypeId.errorId}
                    message={row.offeringTypeId.message}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-[var(--bits-navy)]">
                    Amount {index + 1}
                  </span>
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
                    aria-invalid={row.amount.invalid}
                    aria-describedby={row.amount.describedBy}
                    disabled={isPending}
                    className={inputClassName}
                  />
                  <FieldError id={row.amount.errorId} message={row.amount.message} />
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
                    aria-label={`Remove allocation ${index + 1}`}
                    className="self-end rounded-xl border border-[var(--bits-border)] px-3 py-2 text-sm font-semibold text-[var(--bits-navy)]"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            );
          })}
          <FieldError id={allocationsGroupId} message={allocationsMessage} />
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
          {isPending
            ? "Saving..."
            : donationId
              ? "Save changes"
              : "Save donation"}
        </button>
      </div>
    </form>
  );
}
