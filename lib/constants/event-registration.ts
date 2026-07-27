export const eventRegistrationVisibilityOptions = [
  { value: "PUBLIC", label: "Public" },
  { value: "MEMBERS_ONLY", label: "Members Only" },
  { value: "STAFF_ONLY", label: "Staff Only / Manual" },
] as const;

export const waitlistPromotionModeOptions = [
  { value: "AUTOMATIC", label: "Automatic" },
  { value: "STAFF_APPROVAL", label: "Staff Approval" },
] as const;

export const eventRegistrationStatusOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "WAITLISTED", label: "Waitlisted" },
  { value: "OFFERED", label: "Offer Pending" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "DECLINED", label: "Declined" },
  { value: "CHECKED_IN", label: "Checked In" },
  { value: "NO_SHOW", label: "No Show" },
  { value: "EXPIRED", label: "Expired" },
] as const;

export const eventAttendeeStatusOptions = [
  { value: "REGISTERED", label: "Registered" },
  { value: "WAITLISTED", label: "Waitlisted" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "CHECKED_IN", label: "Checked In" },
  { value: "NO_SHOW", label: "No Show" },
] as const;

export const eventRegistrationSourceOptions = [
  { value: "MEMBER_PORTAL", label: "Member Portal" },
  { value: "PUBLIC_GUEST", label: "Public Guest" },
  { value: "STAFF", label: "Staff" },
  { value: "IMPORT", label: "Import" },
] as const;

/** Statuses that consume event capacity seats (including reserved offers). */
export const COUNTED_TOWARD_CAPACITY_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "OFFERED",
  "CHECKED_IN",
] as const;

export const ACTIVE_REGISTRATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "OFFERED",
  "CHECKED_IN",
] as const;

export const WAITLIST_ACTIVE_ENTRY_STATUSES = ["WAITING", "OFFERED"] as const;

export function formatRegistrationEnumLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}
