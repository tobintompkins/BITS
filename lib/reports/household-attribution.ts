import { householdMembershipCoversOfferingDate } from "@/lib/statements/household-membership";

export type HouseholdAttribution =
  | { bucket: "anonymous" }
  | { bucket: "unmatched" }
  | { bucket: "unassigned" }
  | { bucket: "household"; householdId: string }
  | { bucket: "ambiguous"; householdIds: string[] };

export function attributeGiftToHousehold(
  gift: {
    donorId: string | null;
    anonymous: boolean;
    offeringDate: Date;
  },
  memberships: Array<{
    householdId: string;
    startDate: Date;
    endDate: Date | null;
  }>,
): HouseholdAttribution {
  if (gift.anonymous) return { bucket: "anonymous" };
  if (!gift.donorId) return { bucket: "unmatched" };

  const householdIds = [
    ...new Set(
      memberships
        .filter((row) =>
          householdMembershipCoversOfferingDate(row, gift.offeringDate),
        )
        .map((row) => row.householdId),
    ),
  ];

  if (householdIds.length === 0) return { bucket: "unassigned" };
  if (householdIds.length === 1) {
    return { bucket: "household", householdId: householdIds[0] };
  }
  return { bucket: "ambiguous", householdIds };
}

export function householdBucketLabel(attribution: HouseholdAttribution) {
  switch (attribution.bucket) {
    case "anonymous":
      return "Anonymous";
    case "unmatched":
      return "Unmatched";
    case "unassigned":
      return "Unassigned";
    case "ambiguous":
      return "Needs household review";
    case "household":
      return attribution.householdId;
  }
}
