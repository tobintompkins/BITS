import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const MEMBER_COMMUNICATION_HISTORY_NOTICE =
  "This is a record of communication and privacy preference changes for your membership. It is not a record of messages you received.";

export const MEMBER_COMMUNICATION_HISTORY_EMPTY_COPY =
  "No preference changes have been recorded yet.";

export const MEMBER_COMMUNICATION_HISTORY_PENDING_COPY =
  "Your account must be connected to your church membership record before communication history can appear. Contact the church office if this information needs correction.";

export const MEMBER_COMMUNICATION_HISTORY_ROW_FIELDS = [
  "preferenceLabel",
  "previousValueLabel",
  "newValueLabel",
  "sourceLabel",
  "changedAtLabel",
] as const;

export const memberCommunicationHistoryHref = "/portal/communication-history";
export const memberCommunicationPreferencesHref =
  "/portal/communication-preferences";

export const MEMBER_CONSENT_TYPE_LABELS: Record<string, string> = {
  EMAIL: "Email",
  SMS: "Text / SMS",
  PHONE_CALLS: "Phone calls",
  POSTAL_MAIL: "Postal mail",
  DIRECTORY_LISTING: "Directory listing",
  PHOTO_USE: "Photo use",
  GENERAL_COMMUNICATION: "General communication",
};

export const MEMBER_CONSENT_SOURCE_LABELS: Record<string, string> = {
  MEMBER_REQUEST: "You updated this in the member portal",
  MEMBER_PORTAL: "You updated this in the member portal",
  STAFF_UPDATE: "Updated by church staff",
  IMPORT: "Imported record",
  ONLINE_FORM: "Updated from an online form",
  ADMINISTRATIVE: "Updated by church administration",
  OTHER: "Updated",
};

const ALLOWED_VALUES = new Set(["true", "yes", "1", "allowed", "on"]);
const NOT_ALLOWED_VALUES = new Set([
  "false",
  "no",
  "0",
  "not allowed",
  "not_allowed",
  "off",
]);

function titleFromEnum(value: string) {
  const words = value
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return value.trim();
  return words
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(" ");
}

export function formatConsentHistoryTypeLabel(consentType: string) {
  return MEMBER_CONSENT_TYPE_LABELS[consentType] ?? titleFromEnum(consentType);
}

export function formatConsentHistorySourceLabel(source: string) {
  return MEMBER_CONSENT_SOURCE_LABELS[source] ?? titleFromEnum(source);
}

export function formatConsentHistoryValueLabel(value: string | null) {
  if (value == null) return "Not recorded";
  const trimmed = value.trim();
  if (!trimmed) return "Not recorded";
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (ALLOWED_VALUES.has(normalized)) return "Allowed";
  if (NOT_ALLOWED_VALUES.has(normalized)) return "Not allowed";
  return trimmed;
}

export function formatConsentHistoryChangedAt(value: Date) {
  return formatVolunteerTimeOffDate(value);
}
