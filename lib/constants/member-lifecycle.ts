export const memberRecordStatusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "DECEASED", label: "Deceased" },
  { value: "MERGED", label: "Merged Record" },
] as const;

export const preferredContactMethodOptions = [
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "PHONE", label: "Phone" },
  { value: "POSTAL_MAIL", label: "Postal Mail" },
  { value: "IN_PERSON", label: "In Person" },
  { value: "NO_PREFERENCE", label: "No Preference" },
  { value: "DO_NOT_CONTACT", label: "Do Not Contact" },
] as const;

export const memberConsentTypeOptions = [
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "PHONE_CALLS", label: "Phone Calls" },
  { value: "POSTAL_MAIL", label: "Postal Mail" },
  { value: "DIRECTORY_LISTING", label: "Directory Listing" },
  { value: "PHOTO_USE", label: "Photo Use" },
  { value: "GENERAL_COMMUNICATION", label: "General Communication" },
] as const;

export const consentChangeSourceOptions = [
  { value: "MEMBER_REQUEST", label: "Member Request" },
  { value: "STAFF_UPDATE", label: "Staff Update" },
  { value: "IMPORT", label: "Import" },
  { value: "ONLINE_FORM", label: "Online Form" },
  { value: "ADMINISTRATIVE", label: "Administrative" },
  { value: "OTHER", label: "Other" },
] as const;

export const duplicateCandidateStatusOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED_DUPLICATE", label: "Confirmed Duplicate" },
  { value: "NOT_DUPLICATE", label: "Not Duplicate" },
  { value: "MERGED", label: "Merged" },
  { value: "DISMISSED", label: "Dismissed" },
] as const;

export const archiveReasonOptions = [
  { value: "Moved Away", label: "Moved Away" },
  { value: "Transferred Church", label: "Transferred Church" },
  { value: "Duplicate Under Review", label: "Duplicate Under Review" },
  { value: "Requested Removal", label: "Requested Removal" },
  { value: "Long-Term Inactive", label: "Long-Term Inactive" },
  { value: "Administrative", label: "Administrative" },
  { value: "Other", label: "Other" },
] as const;

export const DUPLICATE_SCORE_THRESHOLD = 40;
export const DUPLICATE_HIGH_CONFIDENCE_THRESHOLD = 80;

export function formatLifecycleEnumLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}
