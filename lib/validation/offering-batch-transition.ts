import { isValidMoneyInput, moneyEquals } from "@/lib/money/decimal";
import { z } from "zod";

const optionalMoneySnapshot = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  })
  .refine(
    (value) => value == null || isValidMoneyInput(value),
    "Expected total snapshot is invalid.",
  );

export const offeringBatchTransitionSchema = z.object({
  confirmed: z.literal(true, {
    error: "Confirm this status change before saving.",
  }),
  recordedTotal: z
    .string()
    .trim()
    .refine(isValidMoneyInput, "Recorded total snapshot is required."),
  expectedTotal: optionalMoneySnapshot,
  donationCount: z.coerce.number().int().min(0),
});

export type OfferingBatchTransitionInput = z.infer<
  typeof offeringBatchTransitionSchema
>;

export function transitionSnapshotMatches(
  snapshot: OfferingBatchTransitionInput,
  current: {
    recordedTotal: string;
    expectedTotal: string | null;
    donationCount: number;
  },
) {
  const expectedMatches =
    snapshot.expectedTotal == null
      ? current.expectedTotal == null
      : current.expectedTotal != null &&
        moneyEquals(snapshot.expectedTotal, current.expectedTotal);
  return (
    moneyEquals(snapshot.recordedTotal, current.recordedTotal) &&
    snapshot.donationCount === current.donationCount &&
    expectedMatches
  );
}
