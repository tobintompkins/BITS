import { z } from "zod";

import {
  membershipStatusValues,
  type MembershipStatusValue,
} from "@/lib/constants/membership-status";
import { getMemberDisplayName } from "@/lib/utils/member-display";

export { getMemberDisplayName };

const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const US_PHONE_REGEX =
  /^(\+1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}$/;

function optionalTrimmedString() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value));
}

function optionalDateString() {
  return z
    .string()
    .trim()
    .refine(
      (value) => value === "" || !Number.isNaN(Date.parse(value)),
      "Enter a valid date.",
    )
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

const optionalPhoneString = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || US_PHONE_REGEX.test(value),
    "Enter a valid phone number, such as (615) 555-0100.",
  )
  .transform((value) => (value === "" ? undefined : normalizePhone(value)));

const optionalEmailString = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Enter a valid email address.",
  )
  .transform((value) => (value === "" ? undefined : value.toLowerCase()));

const optionalZipString = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || US_ZIP_REGEX.test(value),
    "Enter a valid US ZIP code.",
  )
  .transform((value) => (value === "" ? undefined : value));

export { membershipStatusValues } from "@/lib/constants/membership-status";
export type { MembershipStatusValue } from "@/lib/constants/membership-status";

export type MemberFormValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  suffix: string;
  email: string;
  phone: string;
  alternatePhone: string;
  dateOfBirth: string;
  gender: string;
  maritalStatus: string;
  membershipStatus: MembershipStatusValue;
  memberSince: string;
  baptismDate: string;
  salvationDate: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
  householdId: string;
};

export const emptyMemberFormValues: MemberFormValues = {
  firstName: "",
  middleName: "",
  lastName: "",
  preferredName: "",
  suffix: "",
  email: "",
  phone: "",
  alternatePhone: "",
  dateOfBirth: "",
  gender: "",
  maritalStatus: "",
  membershipStatus: "VISITOR",
  memberSince: "",
  baptismDate: "",
  salvationDate: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  notes: "",
  householdId: "",
};

export const memberSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  middleName: optionalTrimmedString(),
  lastName: z.string().trim().min(1, "Last name is required."),
  preferredName: optionalTrimmedString(),
  suffix: optionalTrimmedString(),
  email: optionalEmailString,
  phone: optionalPhoneString,
  alternatePhone: optionalPhoneString,
  dateOfBirth: optionalDateString(),
  gender: optionalTrimmedString(),
  maritalStatus: optionalTrimmedString(),
  membershipStatus: z.enum(membershipStatusValues, {
    error: "Membership status is required.",
  }),
  memberSince: optionalDateString(),
  baptismDate: optionalDateString(),
  salvationDate: optionalDateString(),
  addressLine1: optionalTrimmedString(),
  addressLine2: optionalTrimmedString(),
  city: optionalTrimmedString(),
  state: optionalTrimmedString(),
  postalCode: optionalZipString,
  country: optionalTrimmedString(),
  notes: z
    .string()
    .trim()
    .max(5000, "Notes must be 5000 characters or fewer.")
    .transform((value) => (value === "" ? undefined : value)),
  householdId: optionalTrimmedString(),
});

export type MemberInput = z.infer<typeof memberSchema>;

export type MemberActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  memberId?: string;
  fieldErrors: Partial<Record<keyof MemberFormValues, string[]>>;
};

export function createMemberActionState(): MemberActionState {
  return { status: "idle", fieldErrors: {} };
}

export function toMemberFormValues(
  member: {
    firstName: string;
    middleName: string | null;
    lastName: string;
    preferredName: string | null;
    suffix: string | null;
    email: string | null;
    phone: string | null;
    alternatePhone: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    maritalStatus: string | null;
    membershipStatus: MembershipStatusValue;
    memberSince: Date | null;
    baptismDate: Date | null;
    salvationDate: Date | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    notes: string | null;
    householdLinks?: Array<{ householdId: string }>;
  },
): MemberFormValues {
  const formatDate = (value: Date | null) =>
    value ? value.toISOString().slice(0, 10) : "";

  return {
    firstName: member.firstName,
    middleName: member.middleName ?? "",
    lastName: member.lastName,
    preferredName: member.preferredName ?? "",
    suffix: member.suffix ?? "",
    email: member.email ?? "",
    phone: member.phone ?? "",
    alternatePhone: member.alternatePhone ?? "",
    dateOfBirth: formatDate(member.dateOfBirth),
    gender: member.gender ?? "",
    maritalStatus: member.maritalStatus ?? "",
    membershipStatus: member.membershipStatus,
    memberSince: formatDate(member.memberSince),
    baptismDate: formatDate(member.baptismDate),
    salvationDate: formatDate(member.salvationDate),
    addressLine1: member.addressLine1 ?? "",
    addressLine2: member.addressLine2 ?? "",
    city: member.city ?? "",
    state: member.state ?? "",
    postalCode: member.postalCode ?? "",
    country: member.country ?? "US",
    notes: member.notes ?? "",
    householdId: member.householdLinks?.[0]?.householdId ?? "",
  };
}

export function buildMemberAuditSnapshot(
  member: Record<string, unknown>,
): Record<string, string | null> {
  const fields = [
    "firstName",
    "middleName",
    "lastName",
    "preferredName",
    "suffix",
    "email",
    "phone",
    "alternatePhone",
    "dateOfBirth",
    "gender",
    "maritalStatus",
    "membershipStatus",
    "memberSince",
    "baptismDate",
    "salvationDate",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "country",
    "notes",
  ] as const;

  return Object.fromEntries(
    fields.map((field) => {
      const value = member[field];
      if (value instanceof Date) {
        return [field, value.toISOString().slice(0, 10)];
      }
      return [field, value == null ? null : String(value)];
    }),
  );
}

export function buildMemberAuditChanges(
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
