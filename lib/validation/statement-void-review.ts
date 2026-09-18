import { z } from "zod";

export const statementVoidRequestDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z
    .string()
    .trim()
    .min(3, "Add a short review note.")
    .max(1000, "Keep the review note to 1,000 characters or fewer."),
});
