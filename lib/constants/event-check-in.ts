export const eventAttendanceStatusOptions = [
  { value: "EXPECTED", label: "Expected" },
  { value: "PRESENT", label: "Present" },
  { value: "CHECKED_OUT", label: "Checked Out" },
  { value: "NO_SHOW", label: "No Show" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export const eventAttendanceSourceOptions = [
  { value: "STAFF_SEARCH", label: "Staff search" },
  { value: "STAFF_QR", label: "Staff QR" },
  { value: "SELF_QR", label: "Self QR" },
  { value: "WALK_IN", label: "Walk-in" },
  { value: "IMPORT", label: "Import" },
  { value: "ADMIN_CORRECTION", label: "Admin correction" },
] as const;

export const ELIGIBLE_REGISTRATION_STATUSES_FOR_CHECK_IN = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
] as const;

export function formatCheckInEnumLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}
