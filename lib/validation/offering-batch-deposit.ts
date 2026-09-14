import { z } from "zod";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_DEPOSIT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9 #/._-]*$/;
const FORBIDDEN_DEPOSIT_WORDS = /\b(routing|account|aba|iban|swift)\b/i;

function normalizeBlankToNull(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const depositDateSchema = z
  .string()
  .trim()
  .regex(DATE_ONLY, "Enter a valid deposit date.");

const depositReferenceSchema = z.preprocess(
  normalizeBlankToNull,
  z
    .string({ error: "Deposit reference is required." })
    .min(1, "Deposit reference is required.")
    .max(80, "Deposit reference must be 80 characters or fewer.")
    .regex(
      SAFE_DEPOSIT_REFERENCE,
      "Use a deposit-slip number, internal reference, or confirmation identifier.",
    )
    .refine(
      (value) => !FORBIDDEN_DEPOSIT_WORDS.test(value),
      "Do not enter bank-account or routing numbers.",
    ),
);

export const offeringBatchDepositFormSchema = z.object({
  depositDate: depositDateSchema,
  depositReference: z
    .string()
    .trim()
    .min(1, "Deposit reference is required.")
    .max(80, "Deposit reference must be 80 characters or fewer.")
    .regex(
      SAFE_DEPOSIT_REFERENCE,
      "Use a deposit-slip number, internal reference, or confirmation identifier.",
    )
    .refine(
      (value) => !FORBIDDEN_DEPOSIT_WORDS.test(value),
      "Do not enter bank-account or routing numbers.",
    ),
});

export const offeringBatchDepositWriteSchema = z.object({
  depositDate: depositDateSchema,
  depositReference: depositReferenceSchema,
});

export type OfferingBatchDepositFormValues = {
  depositDate: string;
  depositReference: string;
};

export type OfferingBatchDepositWriteInput = z.infer<
  typeof offeringBatchDepositWriteSchema
>;

export type OfferingBatchDepositActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors: Partial<Record<keyof OfferingBatchDepositFormValues, string[]>>;
};

export function createOfferingBatchDepositActionState(): OfferingBatchDepositActionState {
  return { status: "idle", fieldErrors: {} };
}

export function toOfferingBatchDepositFormValues(batch: {
  depositDate: Date | null;
  depositReference: string | null;
}): OfferingBatchDepositFormValues {
  return {
    depositDate: batch.depositDate
      ? batch.depositDate.toISOString().slice(0, 10)
      : "",
    depositReference: batch.depositReference ?? "",
  };
}
