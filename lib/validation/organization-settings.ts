import { z } from "zod";

import type { Organization } from "@/app/generated/prisma/client";

const supportedTimeZones =
  typeof Intl.supportedValuesOf === "function"
    ? new Set(Intl.supportedValuesOf("timeZone"))
    : new Set<string>();

const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const US_PHONE_REGEX =
  /^(\+1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}$/;

function optionalTrimmedString() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value));
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return value.trim();
}

const optionalEinString = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{2}-?\d{7}$/.test(value),
    "Enter a valid EIN, such as 12-3456789.",
  )
  .transform((value) => (value === "" ? undefined : value));

export type OrganizationSettingsFormValues = {
  churchName: string;
  displayName: string;
  ein: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  timeZone: string;
  statementFooter: string;
  logoUrl: string;
};

export const emptyOrganizationSettingsValues: OrganizationSettingsFormValues = {
  churchName: "",
  displayName: "",
  ein: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zipCode: "",
  country: "US",
  phone: "",
  email: "",
  website: "",
  timeZone: "America/New_York",
  statementFooter: "",
  logoUrl: "",
};

export const organizationSettingsSchema = z.object({
  churchName: z.string().trim().min(1, "Church name is required."),
  displayName: z.string().trim().min(1, "Display name is required."),
  ein: optionalEinString,
  addressLine1: z.string().trim().min(1, "Address Line 1 is required."),
  addressLine2: optionalTrimmedString(),
  city: z.string().trim().min(1, "City is required."),
  state: z.string().trim().min(1, "State is required."),
  zipCode: z
    .string()
    .trim()
    .min(1, "ZIP Code is required.")
    .refine(
      (value) => US_ZIP_REGEX.test(value),
      "Enter a valid US ZIP code, such as 37203 or 37203-1234.",
    ),
  country: z.string().trim().min(1, "Country is required."),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || US_PHONE_REGEX.test(value),
      "Enter a valid phone number, such as (615) 555-0100.",
    )
    .transform((value) => (value === "" ? undefined : normalizePhone(value))),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .refine(
      (value) => z.email().safeParse(value).success,
      "Enter a valid email address.",
    ),
  website: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || z.url().safeParse(value).success,
      "Enter a valid website URL, including https://",
    )
    .transform((value) => (value === "" ? undefined : value)),
  timeZone: z
    .string()
    .trim()
    .min(1, "Time Zone is required.")
    .refine(
      (value) =>
        supportedTimeZones.size === 0 || supportedTimeZones.has(value),
      "Enter a valid IANA time zone, such as America/New_York.",
    ),
  statementFooter: z
    .string()
    .trim()
    .max(2000, "Statement footer must be 2000 characters or fewer.")
    .transform((value) => (value === "" ? undefined : value)),
});

export type OrganizationSettingsInput = z.infer<
  typeof organizationSettingsSchema
>;

export type OrganizationSettingsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  values: OrganizationSettingsFormValues;
  fieldErrors: Partial<Record<keyof OrganizationSettingsFormValues, string[]>>;
};

export function createOrganizationSettingsActionState(
  values: OrganizationSettingsFormValues = emptyOrganizationSettingsValues,
): OrganizationSettingsActionState {
  return {
    status: "idle",
    values,
    fieldErrors: {},
  };
}

export function toOrganizationSettingsFormValues(
  organization: Pick<
    Organization,
    | "name"
    | "displayName"
    | "ein"
    | "mailingAddressLine1"
    | "mailingAddressLine2"
    | "city"
    | "state"
    | "postalCode"
    | "country"
    | "contactPhone"
    | "contactEmail"
    | "websiteUrl"
    | "timeZone"
    | "statementFooterText"
    | "logoStorageKey"
  > | null,
): OrganizationSettingsFormValues {
  if (!organization) {
    return emptyOrganizationSettingsValues;
  }

  return {
    churchName: organization.name,
    displayName: organization.displayName ?? organization.name,
    ein: organization.ein ?? "",
    addressLine1: organization.mailingAddressLine1,
    addressLine2: organization.mailingAddressLine2 ?? "",
    city: organization.city,
    state: organization.state,
    zipCode: organization.postalCode,
    country: organization.country,
    phone: organization.contactPhone ?? "",
    email: organization.contactEmail ?? "",
    website: organization.websiteUrl ?? "",
    timeZone: organization.timeZone,
    statementFooter: organization.statementFooterText ?? "",
    logoUrl: organization.logoStorageKey ?? "",
  };
}

export function buildOrganizationAuditChanges(
  previous: OrganizationSettingsFormValues,
  next: OrganizationSettingsFormValues,
) {
  const fields: Array<keyof OrganizationSettingsFormValues> = [
    "churchName",
    "displayName",
    "ein",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "zipCode",
    "country",
    "phone",
    "email",
    "website",
    "timeZone",
    "statementFooter",
    "logoUrl",
  ];

  return fields
    .filter((field) => previous[field] !== next[field])
    .map((field) => ({
      field,
      oldValue: previous[field] || null,
      newValue: next[field] || null,
    }));
}
