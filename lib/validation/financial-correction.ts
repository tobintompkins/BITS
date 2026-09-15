import { z } from "zod";

export const financialCorrectionRequestSchema = z.object({
  type: z.enum(["DONOR", "AMOUNT", "FUND_ALLOCATION", "PAYMENT_METHOD", "DEPOSIT", "OTHER"]),
  reason: z.string().trim().min(10, "Explain why the correction is needed.").max(1000),
  requestedChange: z.string().trim().min(10, "Describe exactly what should change.").max(2000),
});

export const financialCorrectionDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().min(3, "Add a short review note.").max(1000),
});
