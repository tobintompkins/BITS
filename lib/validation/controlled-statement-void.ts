import { z } from "zod";

export const executeStatementVoidRequestSchema = z.object({
  confirmed: z.literal(true, {
    error: "Confirm that portal access will be revoked immediately.",
  }),
});
