export const eventStatusOptions = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export const eventVisibilityOptions = [
  { value: "PUBLIC", label: "Public" },
  { value: "MEMBERS_ONLY", label: "Members Only" },
  { value: "STAFF_ONLY", label: "Staff Only" },
  { value: "PRIVATE", label: "Private" },
] as const;

export const eventOrganizerRoleOptions = [
  { value: "PRIMARY_CONTACT", label: "Primary Contact" },
  { value: "HOST", label: "Host" },
  { value: "COORDINATOR", label: "Coordinator" },
  { value: "PASTOR", label: "Pastor" },
  { value: "MINISTRY_LEADER", label: "Ministry Leader" },
  { value: "VOLUNTEER_LEAD", label: "Volunteer Lead" },
  { value: "OTHER", label: "Other" },
] as const;

export const recurrencePresetOptions = [
  { value: "NONE", label: "Does not repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every two weeks" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "CUSTOM", label: "Custom" },
] as const;

export const DEFAULT_EVENT_CATEGORIES = [
  { name: "Worship Service", color: "#2563eb", icon: "church" },
  { name: "Bible Study", color: "#7c3aed", icon: "book" },
  { name: "Prayer Meeting", color: "#0d9488", icon: "hands" },
  { name: "Youth", color: "#ea580c", icon: "users" },
  { name: "Children", color: "#db2777", icon: "smile" },
  { name: "Outreach", color: "#16a34a", icon: "heart" },
  { name: "Fellowship", color: "#ca8a04", icon: "coffee" },
  { name: "Training", color: "#4f46e5", icon: "graduation" },
  { name: "Leadership", color: "#9333ea", icon: "flag" },
  { name: "Conference", color: "#0891b2", icon: "mic" },
  { name: "Special Event", color: "#e11d48", icon: "star" },
  { name: "Other", color: "#71717a", icon: "calendar" },
] as const;

export const DEFAULT_EVENT_LOCATIONS = [
  { name: "Main Sanctuary", roomName: "Sanctuary", capacity: 400, isOnline: false },
  { name: "Fellowship Hall", roomName: "Hall A", capacity: 150, isOnline: false },
  { name: "Youth Room", roomName: "Youth Wing", capacity: 60, isOnline: false },
  { name: "Church Office", roomName: "Office", capacity: 12, isOnline: false },
  { name: "Online Event", isOnline: true, capacity: null },
] as const;

export const EVENT_OCCURRENCE_WINDOW_MONTHS = 12;

export function formatEventEnumLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}
