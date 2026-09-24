import { z } from "zod";

export const MEMBER_PROFILE_COMMUNICATION_METHODS = [
  "EMAIL",
  "PHONE",
  "MAIL",
  "NONE",
] as const;

export type MemberProfileCommunicationMethod =
  (typeof MEMBER_PROFILE_COMMUNICATION_METHODS)[number];

export const MEMBER_PROFILE_COMMUNICATION_LABELS: Record<
  MemberProfileCommunicationMethod,
  string
> = {
  EMAIL: "Email",
  PHONE: "Phone",
  MAIL: "Mail",
  NONE: "None",
};

export const MEMBER_PROFILE_AUDIT_FIELDS = [
  "email",
  "phone",
  "preferredCommunicationMethod",
] as const;

export type MemberProfileFormValues = {
  email: string;
  phone: string;
  preferredCommunicationMethod: string;
};

export type MemberProfileActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  values: MemberProfileFormValues;
  fieldErrors: Partial<Record<keyof MemberProfileFormValues, string[]>>;
};

export function isMemberProfileCommunicationMethod(
  value: string | null | undefined,
): value is MemberProfileCommunicationMethod {
  return MEMBER_PROFILE_COMMUNICATION_METHODS.includes(
    value as MemberProfileCommunicationMethod,
  );
}

export function toMemberProfileFormValues(input: {
  email: string | null;
  phone: string | null;
  preferredCommunicationMethod: string | null;
}): MemberProfileFormValues {
  return {
    email: input.email ?? "",
    phone: input.phone ?? "",
    preferredCommunicationMethod: isMemberProfileCommunicationMethod(
      input.preferredCommunicationMethod,
    )
      ? input.preferredCommunicationMethod
      : "NONE",
  };
}

export function createMemberProfileActionState(
  values: MemberProfileFormValues,
): MemberProfileActionState {
  return {
    status: "idle",
    values,
    fieldErrors: {},
  };
}

export const memberProfilePreferencesSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, { error: "Email must be 254 characters or fewer." })
    .transform((value) => (value === "" ? null : value.toLowerCase()))
    .refine((value) => value == null || z.email().safeParse(value).success, {
      error: "Enter a valid email address.",
    }),
  phone: z
    .string()
    .trim()
    .max(40, { error: "Phone must be 40 characters or fewer." })
    .transform((value) => (value === "" ? null : value)),
  preferredCommunicationMethod: z.enum(MEMBER_PROFILE_COMMUNICATION_METHODS, {
    error: "Choose a preferred contact method.",
  }),
});

export type MemberProfilePreferencesInput = z.infer<
  typeof memberProfilePreferencesSchema
>;
