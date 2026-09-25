import { z } from "zod";

export const MEMBER_COMMUNICATION_PREFERENCE_FIELDS = [
  "allowEmail",
  "allowSms",
  "allowPhoneCalls",
  "allowPostalMail",
] as const;

export type MemberCommunicationPreferenceField =
  (typeof MEMBER_COMMUNICATION_PREFERENCE_FIELDS)[number];

export type MemberCommunicationPreferences = {
  allowEmail: boolean;
  allowSms: boolean;
  allowPhoneCalls: boolean;
  allowPostalMail: boolean;
};

export const MEMBER_COMMUNICATION_PREFERENCE_LABELS: Record<
  MemberCommunicationPreferenceField,
  string
> = {
  allowEmail: "Email",
  allowSms: "Text / SMS",
  allowPhoneCalls: "Phone calls",
  allowPostalMail: "Postal mail",
};

export const MEMBER_COMMUNICATION_PREFERENCES_NOTICE =
  "These settings apply to ordinary church communication. They do not prevent necessary legal or safety contact when applicable.";

export type MemberCommunicationPreferencesActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  values: MemberCommunicationPreferences;
};

export function createMemberCommunicationPreferencesActionState(
  values: MemberCommunicationPreferences,
): MemberCommunicationPreferencesActionState {
  return {
    status: "idle",
    values,
  };
}

export function parseCommunicationPreferenceFlag(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

export const memberCommunicationPreferencesSchema = z
  .object({
    allowEmail: z.boolean(),
    allowSms: z.boolean(),
    allowPhoneCalls: z.boolean(),
    allowPostalMail: z.boolean(),
  })
  .strict();

export type MemberCommunicationPreferencesInput = z.infer<
  typeof memberCommunicationPreferencesSchema
>;
