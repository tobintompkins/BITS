export const attendanceTypeOptions = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "EXCUSED", label: "Excused" },
  { value: "ONLINE", label: "Online" },
  { value: "VOLUNTEER", label: "Volunteer" },
  { value: "GUEST", label: "Guest" },
] as const;

export const followUpTypeOptions = [
  { value: "VISITOR_WELCOME", label: "Visitor Welcome" },
  { value: "PHONE_CALL", label: "Phone Call" },
  { value: "EMAIL", label: "Email" },
  { value: "TEXT_MESSAGE", label: "Text Message" },
  { value: "HOME_VISIT", label: "Home Visit" },
  { value: "PASTORAL_CARE", label: "Pastoral Care" },
  { value: "PRAYER_FOLLOW_UP", label: "Prayer Follow-Up" },
  { value: "MEMBERSHIP_FOLLOW_UP", label: "Membership Follow-Up" },
  { value: "BAPTISM_FOLLOW_UP", label: "Baptism Follow-Up" },
  { value: "GENERAL", label: "General" },
] as const;

export const followUpStatusOptions = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "OVERDUE", label: "Overdue" },
] as const;

export const followUpPriorityOptions = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
] as const;

export const pastoralCareCategoryOptions = [
  { value: "GENERAL", label: "General" },
  { value: "HOSPITAL_VISIT", label: "Hospital Visit" },
  { value: "BEREAVEMENT", label: "Bereavement" },
  { value: "COUNSELING", label: "Counseling" },
  { value: "FAMILY_SUPPORT", label: "Family Support" },
  { value: "FINANCIAL_ASSISTANCE", label: "Financial Assistance" },
  { value: "SPIRITUAL_GUIDANCE", label: "Spiritual Guidance" },
  { value: "MARRIAGE_SUPPORT", label: "Marriage Support" },
  { value: "HEALTH_CONCERN", label: "Health Concern" },
  { value: "OTHER", label: "Other" },
] as const;

export const prayerRequestStatusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "IN_PRAYER", label: "In Prayer" },
  { value: "ANSWERED", label: "Answered" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export const prayerPrivacyLevelOptions = [
  { value: "PUBLIC", label: "Public" },
  { value: "PRAYER_TEAM", label: "Prayer Team" },
  { value: "PASTORAL_STAFF", label: "Pastoral Staff" },
  { value: "PRIVATE", label: "Private" },
] as const;

export const communicationTypeOptions = [
  { value: "PHONE", label: "Phone" },
  { value: "EMAIL", label: "Email" },
  { value: "TEXT", label: "Text" },
  { value: "IN_PERSON", label: "In Person" },
  { value: "VIDEO_CALL", label: "Video Call" },
  { value: "LETTER", label: "Letter" },
  { value: "OTHER", label: "Other" },
] as const;

export const communicationDirectionOptions = [
  { value: "INBOUND", label: "Inbound" },
  { value: "OUTBOUND", label: "Outbound" },
] as const;

export function formatEnumLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}
