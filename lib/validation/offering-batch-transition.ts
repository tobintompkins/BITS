import { z } from "zod";

export const offeringBatchTransitionSchema = z.object({
  confirmed: z.literal(true, {
    error: "Confirm this status change before saving.",
  }),
});

export type OfferingBatchTransitionInput = z.infer<
  typeof offeringBatchTransitionSchema
>;
