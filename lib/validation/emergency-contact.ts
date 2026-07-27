import { z } from "zod";

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

const phoneString = z
  .string()
  .trim()
  .min(1, "Phone is required.")
  .refine(
    (value) => US_PHONE_REGEX.test(value),
    "Enter a valid phone number, such as (615) 555-0100.",
  )
  .transform(normalizePhone);

const optionalEmailString = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || z.email().safeParse(value).success,
    "Enter a valid email address.",
  )
  .transform((value) => (value === "" ? undefined : value));

export type EmergencyContactFormValues = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  notes: string;
};

export const emptyEmergencyContactFormValues: EmergencyContactFormValues = {
  name: "",
  relationship: "",
  phone: "",
  email: "",
  isPrimary: false,
  notes: "",
};

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  relationship: z.string().trim().min(1, "Relationship is required."),
  phone: phoneString,
  email: optionalEmailString,
  isPrimary: z.boolean().default(false),
  notes: optionalTrimmedString(),
});

export type EmergencyContactInput = z.infer<typeof emergencyContactSchema>;

export type EmergencyContactActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  contactId?: string;
  fieldErrors: Partial<Record<keyof EmergencyContactFormValues, string[]>>;
};

export function createEmergencyContactActionState(): EmergencyContactActionState {
  return { status: "idle", fieldErrors: {} };
}

export function toEmergencyContactFormValues(contact: {
  name: string;
  relationship: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
}): EmergencyContactFormValues {
  return {
    name: contact.name,
    relationship: contact.relationship,
    phone: contact.phone,
    email: contact.email ?? "",
    isPrimary: contact.isPrimary,
    notes: contact.notes ?? "",
  };
}

export function buildEmergencyContactAuditSnapshot(contact: Record<string, unknown>) {
  const fields = [
    "name",
    "relationship",
    "phone",
    "email",
    "isPrimary",
    "notes",
  ] as const;

  return Object.fromEntries(
    fields.map((field) => [
      field,
      contact[field] == null ? null : String(contact[field]),
    ]),
  ) as Record<string, string | null>;
}

export function buildEmergencyContactAuditChanges(
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
