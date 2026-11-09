import type { ZodError } from "zod";

import { manualBatchDonationFormSchema } from "@/lib/validation/manual-batch-donation";

export const OFFERING_DATE_CONFIRMATION_MESSAGE =
  "Confirm that this donation should use a different offering date than the batch.";

export const DONOR_SEARCH_EMPTY_STATUS =
  "No active donors in this church matched that search.";

export type DescribedFieldBinding = {
  errorId: string;
  message: string | undefined;
  describedBy: string | undefined;
  invalid: true | undefined;
};

export type DonorSearchFeedback = {
  kind: "none" | "status" | "alert";
  message: string | null;
  invalidatesSearch: boolean;
};

export function collectManualDonationFieldErrors(
  error: ZodError,
): Partial<Record<string, string[]>> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_form";
    const existing = fieldErrors[key] ?? [];
    if (!existing.includes(issue.message)) existing.push(issue.message);
    fieldErrors[key] = existing;
  }
  return fieldErrors;
}

export function withOfferingDateConfirmation(batchOfferingDate: string) {
  return manualBatchDonationFormSchema.superRefine((value, ctx) => {
    if (
      value.offeringDate !== batchOfferingDate &&
      !value.confirmOfferingDateOverride
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmOfferingDateOverride"],
        message: OFFERING_DATE_CONFIRMATION_MESSAGE,
      });
    }
  });
}

export function describedFieldBinding(
  errorId: string,
  message: string | undefined,
  extraDescribedBy?: string,
): DescribedFieldBinding {
  const describedBy =
    [message ? errorId : undefined, extraDescribedBy]
      .filter((value): value is string => Boolean(value))
      .join(" ") || undefined;
  return {
    errorId,
    message,
    describedBy,
    invalid: message ? true : undefined,
  };
}

export function allocationErrorId(
  formId: string,
  fieldIdentity: string,
  part: "fund" | "amount",
): string {
  return `${formId}-allocation-${fieldIdentity}-${part}-error`;
}

export function rhfMessage(error: { message?: string } | undefined) {
  return error?.message || undefined;
}

export function allocationFieldMessages(
  allocationsError: unknown,
  index: number,
): { offeringTypeId?: string; amount?: string } {
  if (!allocationsError || typeof allocationsError !== "object") {
    return {};
  }
  const rows = allocationsError as Record<
    number,
    { offeringTypeId?: { message?: string }; amount?: { message?: string } }
  >;
  const row = rows[index];
  return {
    offeringTypeId: rhfMessage(row?.offeringTypeId),
    amount: rhfMessage(row?.amount),
  };
}

export function allocationsGroupMessage(allocationsError: unknown) {
  if (!allocationsError || typeof allocationsError !== "object") {
    return undefined;
  }
  const error = allocationsError as {
    message?: string;
    root?: { message?: string };
  };
  return error.message || rhfMessage(error.root);
}

export function allocationRowBindings(
  formId: string,
  fieldIdentity: string,
  allocationsError: unknown,
  index: number,
) {
  const messages = allocationFieldMessages(allocationsError, index);
  return {
    fieldIdentity,
    index,
    offeringTypeId: describedFieldBinding(
      allocationErrorId(formId, fieldIdentity, "fund"),
      messages.offeringTypeId,
    ),
    amount: describedFieldBinding(
      allocationErrorId(formId, fieldIdentity, "amount"),
      messages.amount,
    ),
  };
}

export function donorSearchFeedback(input: {
  failed: boolean;
  failureMessage?: string;
  resultCount: number;
  searched: boolean;
}): DonorSearchFeedback {
  if (input.failed) {
    return {
      kind: "alert",
      message: input.failureMessage ?? "Donor search failed.",
      invalidatesSearch: true,
    };
  }
  if (input.searched && input.resultCount === 0) {
    return {
      kind: "status",
      message: DONOR_SEARCH_EMPTY_STATUS,
      invalidatesSearch: false,
    };
  }
  return { kind: "none", message: null, invalidatesSearch: false };
}

export function shouldClearCreateOperationToken(input: {
  status: string;
  isEdit: boolean;
}) {
  return input.status === "success" && !input.isEdit;
}

export function applyDottedFieldErrors(
  fieldErrors: Partial<Record<string, string[] | undefined>>,
  setError: (name: string, error: { message: string }) => void,
) {
  for (const [name, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) setError(name, { message: messages[0] });
  }
}

export function offeringDateConfirmationFieldErrors(message: string) {
  if (message !== OFFERING_DATE_CONFIRMATION_MESSAGE) return {};
  return { confirmOfferingDateOverride: [message] };
}
