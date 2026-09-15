import { z } from "zod";

export const statementVoidRequestReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Explain why this statement should be voided.")
    .max(1000, "Keep the reason to 1,000 characters or fewer."),
});
