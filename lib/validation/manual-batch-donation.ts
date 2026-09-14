import {
  isValidMoneyInput,
  isValidPositiveMoneyInput,
  moneyEquals,
  moneyLessThanOrEqual,
  parseMoneyInput,
  parsePositiveMoneyInput,
  sumMoneyAmounts,
} from "@/lib/money/decimal";
import { z } from "zod";

export const MANUAL_PAYMENT_METHODS = [
  "CASH",
  "CHECK",
  "STOCK_OR_NONCASH",
  "OTHER",
] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");

const allocationFormSchema = z.object({
  offeringTypeId: z.string().uuid("Choose a giving fund."),
  amount: z
    .string()
    .trim()
    .refine(isValidPositiveMoneyInput, "Allocation amounts must be greater than zero."),
});

export const manualBatchDonationFormSchema = z
  .object({
    donorId: z.string().trim(),
    anonymous: z.boolean(),
    offeringDate: dateOnly,
    receivedDate: dateOnly,
    confirmOfferingDateOverride: z.boolean(),
    paymentMethod: z.enum(MANUAL_PAYMENT_METHODS, {
      error: "Choose a supported payment method.",
    }),
    checkNumber: z.string().trim().max(40),
    reference: z.string().trim().max(80),
    note: z.string().trim().max(2000),
    isTaxDeductible: z.boolean(),
    deductibleAmount: z
      .string()
      .trim()
      .refine(isValidMoneyInput, "Enter a valid deductible amount."),
    goodsOrServicesProvided: z.boolean(),
    goodsOrServicesDescription: z.string().trim().max(500),
    goodsOrServicesEstimatedValue: z.string().trim().max(20),
    intangibleReligiousBenefitsOnly: z.boolean(),
    allocations: z
      .array(allocationFormSchema)
      .min(1, "Add at least one fund allocation."),
  })
  .superRefine((value, ctx) => {
    if (value.anonymous && value.donorId) {
      ctx.addIssue({
        code: "custom",
        path: ["donorId"],
        message: "Anonymous donations cannot be linked to a donor.",
      });
    }
    if (!value.anonymous && !z.string().uuid().safeParse(value.donorId).success) {
      ctx.addIssue({
        code: "custom",
        path: ["donorId"],
        message: "Select a donor or mark the gift as anonymous.",
      });
    }

    if (value.paymentMethod === "CHECK" && value.checkNumber === "") {
      ctx.addIssue({
        code: "custom",
        path: ["checkNumber"],
        message: "Enter a check number.",
      });
    }
    if (value.paymentMethod !== "CHECK" && value.checkNumber !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["checkNumber"],
        message: "Check number is only used for checks.",
      });
    }

    const fundIds = value.allocations.map((row) => row.offeringTypeId);
    if (new Set(fundIds).size !== fundIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "Each giving fund can be used only once on a donation.",
      });
    }

    if (!value.allocations.every((row) => isValidPositiveMoneyInput(row.amount))) {
      return;
    }
    const totalAmount = sumMoneyAmounts(
      value.allocations.map((row) => parsePositiveMoneyInput(row.amount)),
    );
    const deductibleAmount = parseMoneyInput(value.deductibleAmount);
    if (deductibleAmount == null) {
      ctx.addIssue({
        code: "custom",
        path: ["deductibleAmount"],
        message: "Enter a valid deductible amount.",
      });
    } else if (!value.isTaxDeductible && !moneyEquals(deductibleAmount, "0.00")) {
      ctx.addIssue({
        code: "custom",
        path: ["deductibleAmount"],
        message: "Non-deductible gifts must have a deductible amount of zero.",
      });
    } else if (!moneyLessThanOrEqual(deductibleAmount, totalAmount)) {
      ctx.addIssue({
        code: "custom",
        path: ["deductibleAmount"],
        message: "Deductible amount cannot exceed the donation total.",
      });
    }

    if (value.goodsOrServicesProvided) {
      if (value.goodsOrServicesDescription === "") {
        ctx.addIssue({
          code: "custom",
          path: ["goodsOrServicesDescription"],
          message: "Describe the goods or services provided.",
        });
      }
      if (
        value.goodsOrServicesEstimatedValue === "" ||
        !isValidMoneyInput(value.goodsOrServicesEstimatedValue)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["goodsOrServicesEstimatedValue"],
          message: "Enter a valid estimated value.",
        });
      } else {
        const estimated = parseMoneyInput(value.goodsOrServicesEstimatedValue);
        if (estimated && !moneyLessThanOrEqual(estimated, totalAmount)) {
          ctx.addIssue({
            code: "custom",
            path: ["goodsOrServicesEstimatedValue"],
            message: "Estimated value cannot exceed the donation total.",
          });
        }
      }
    } else if (
      value.goodsOrServicesEstimatedValue !== "" &&
      !isValidMoneyInput(value.goodsOrServicesEstimatedValue)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["goodsOrServicesEstimatedValue"],
        message: "Enter a valid estimated value.",
      });
    }
  });

export const manualBatchDonationWriteSchema = manualBatchDonationFormSchema.transform(
  (value) => {
    const allocations = value.allocations.map((row) => ({
      offeringTypeId: row.offeringTypeId,
      amount: parsePositiveMoneyInput(row.amount),
    }));
    const totalAmount = sumMoneyAmounts(allocations.map((row) => row.amount));
    return {
      donorId: value.anonymous || value.donorId === "" ? null : value.donorId,
      anonymous: value.anonymous,
      offeringDate: value.offeringDate,
      receivedDate: value.receivedDate,
      confirmOfferingDateOverride: value.confirmOfferingDateOverride,
      paymentMethod: value.paymentMethod,
      checkNumber:
        value.paymentMethod === "CHECK" && value.checkNumber !== ""
          ? value.checkNumber
          : null,
      reference: value.reference === "" ? null : value.reference,
      note: value.note === "" ? null : value.note,
      isTaxDeductible: value.isTaxDeductible,
      deductibleAmount: value.isTaxDeductible
        ? parseMoneyInput(value.deductibleAmount) ?? "0.00"
        : "0.00",
      goodsOrServicesProvided: value.goodsOrServicesProvided,
      goodsOrServicesDescription: value.goodsOrServicesProvided
        ? value.goodsOrServicesDescription || null
        : null,
      goodsOrServicesEstimatedValue: value.goodsOrServicesProvided
        ? parseMoneyInput(value.goodsOrServicesEstimatedValue)
        : null,
      intangibleReligiousBenefitsOnly: value.intangibleReligiousBenefitsOnly,
      allocations,
      totalAmount,
    };
  },
);

export type ManualBatchDonationFormValues = z.input<
  typeof manualBatchDonationFormSchema
>;
export type ManualBatchDonationWriteInput = z.output<
  typeof manualBatchDonationWriteSchema
>;

export function emptyManualBatchDonationFormValues(
  offeringDate: string,
): ManualBatchDonationFormValues {
  return {
    donorId: "",
    anonymous: false,
    offeringDate,
    receivedDate: offeringDate,
    confirmOfferingDateOverride: false,
    paymentMethod: "CASH",
    checkNumber: "",
    reference: "",
    note: "",
    isTaxDeductible: true,
    deductibleAmount: "",
    goodsOrServicesProvided: false,
    goodsOrServicesDescription: "",
    goodsOrServicesEstimatedValue: "",
    intangibleReligiousBenefitsOnly: false,
    allocations: [{ offeringTypeId: "", amount: "" }],
  };
}

export type ManualBatchDonationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  donationId?: string;
  fieldErrors: Partial<Record<string, string[]>>;
};

export function createManualBatchDonationActionState(): ManualBatchDonationActionState {
  return { status: "idle", fieldErrors: {} };
}

export const batchDonationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export function parseBatchDonationListQuery(
  input: Record<string, string | string[] | undefined>,
) {
  const scalar = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  return batchDonationListQuerySchema.safeParse({
    page: scalar(input.donationsPage) ?? scalar(input.page),
    pageSize: scalar(input.donationsPageSize) ?? scalar(input.pageSize),
  });
}

export const batchDonorSearchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});
