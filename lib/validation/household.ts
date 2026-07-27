import { z } from "zod";

import {
  householdRelationshipValues,
} from "@/lib/constants/household-relationships";

const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/;

function optionalTrimmedString() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value));
}

export type HouseholdFormValues = {
  householdName: string;
  primaryContactId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export const emptyHouseholdFormValues: HouseholdFormValues = {
  householdName: "",
  primaryContactId: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
};

export const householdSchema = z.object({
  householdName: z.string().trim().min(1, "Household name is required."),
  primaryContactId: optionalTrimmedString(),
  addressLine1: optionalTrimmedString(),
  addressLine2: optionalTrimmedString(),
  city: optionalTrimmedString(),
  state: optionalTrimmedString(),
  postalCode: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || US_ZIP_REGEX.test(value),
      "Enter a valid US ZIP code.",
    )
    .transform((value) => (value === "" ? undefined : value)),
  country: optionalTrimmedString(),
});

export type HouseholdInput = z.infer<typeof householdSchema>;

export const linkMemberToHouseholdSchema = z.object({
  memberId: z.string().uuid(),
  householdId: z.string().uuid(),
  relationshipToHousehold: z.enum(householdRelationshipValues, {
    error: "Relationship to household is required.",
  }),
});

export type LinkMemberToHouseholdInput = z.infer<typeof linkMemberToHouseholdSchema>;

export const updateMemberHouseholdRelationshipSchema = z.object({
  memberId: z.string().uuid(),
  householdId: z.string().uuid(),
  relationshipToHousehold: z.enum(householdRelationshipValues, {
    error: "Relationship to household is required.",
  }),
});

export type HouseholdActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  householdId?: string;
  fieldErrors: Partial<Record<keyof HouseholdFormValues, string[]>>;
};

export function createHouseholdActionState(): HouseholdActionState {
  return { status: "idle", fieldErrors: {} };
}

export function toHouseholdFormValues(household: {
  householdName: string;
  primaryContactId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}): HouseholdFormValues {
  return {
    householdName: household.householdName,
    primaryContactId: household.primaryContactId ?? "",
    addressLine1: household.addressLine1 ?? "",
    addressLine2: household.addressLine2 ?? "",
    city: household.city ?? "",
    state: household.state ?? "",
    postalCode: household.postalCode ?? "",
    country: household.country ?? "US",
  };
}

export function buildHouseholdAuditSnapshot(household: Record<string, unknown>) {
  const fields = [
    "householdName",
    "primaryContactId",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "country",
  ] as const;

  return Object.fromEntries(
    fields.map((field) => [
      field,
      household[field] == null ? null : String(household[field]),
    ]),
  ) as Record<string, string | null>;
}

export function buildHouseholdAuditChanges(
  previous: Record<string, string | null>,
  next: Record<string, string | null>,
) {
  return Object.keys(next)
    .filter((field) => previous[field] !== next[field])
    .map((field) => ({
      field,
      oldValue: previous[field] ?? null,
      newValue: next[field] ?? null,
    }));
}
