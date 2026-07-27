export const householdRelationshipValues = [
  "SELF",
  "SPOUSE",
  "CHILD",
  "PARENT",
  "GRANDPARENT",
  "SIBLING",
  "OTHER_RELATIVE",
  "ROOMMATE",
  "OTHER",
] as const;

export type HouseholdRelationshipValue =
  (typeof householdRelationshipValues)[number];

export const householdRelationshipOptions: Array<{
  value: HouseholdRelationshipValue;
  label: string;
}> = [
  { value: "SELF", label: "Self" },
  { value: "SPOUSE", label: "Spouse" },
  { value: "CHILD", label: "Child" },
  { value: "PARENT", label: "Parent" },
  { value: "GRANDPARENT", label: "Grandparent" },
  { value: "SIBLING", label: "Sibling" },
  { value: "OTHER_RELATIVE", label: "Other Relative" },
  { value: "ROOMMATE", label: "Roommate" },
  { value: "OTHER", label: "Other" },
];

export function formatHouseholdRelationship(
  value: HouseholdRelationshipValue | string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  const match = householdRelationshipOptions.find((option) => option.value === value);
  return match?.label ?? value;
}
