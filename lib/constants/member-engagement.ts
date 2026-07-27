export const membershipMilestoneTypeOptions = [
  { value: "SALVATION", label: "Salvation" },
  { value: "BAPTISM", label: "Baptism" },
  { value: "MEMBERSHIP", label: "Membership" },
  { value: "BABY_DEDICATION", label: "Baby Dedication" },
  { value: "CHILD_DEDICATION", label: "Child Dedication" },
  { value: "MARRIAGE", label: "Marriage" },
  { value: "ORDINATION", label: "Ordination" },
  { value: "LICENSED_MINISTRY", label: "Licensed Ministry" },
  { value: "FIRST_VISIT", label: "First Visit" },
  { value: "TRANSFER_IN", label: "Transfer In" },
  { value: "TRANSFER_OUT", label: "Transfer Out" },
  { value: "DECEASED", label: "Deceased" },
  { value: "OTHER", label: "Other" },
] as const;

export const giftProficiencyLevelOptions = [
  { value: "DISCOVERING", label: "Discovering" },
  { value: "DEVELOPING", label: "Developing" },
  { value: "CONFIDENT", label: "Confident" },
  { value: "STRONG", label: "Strong" },
  { value: "MENTOR", label: "Mentor" },
] as const;

export const ministryTypeOptions = [
  { value: "WORSHIP", label: "Worship" },
  { value: "CHILDREN", label: "Children" },
  { value: "YOUTH", label: "Youth" },
  { value: "OUTREACH", label: "Outreach" },
  { value: "HOSPITALITY", label: "Hospitality" },
  { value: "PRAYER", label: "Prayer" },
  { value: "DISCIPLESHIP", label: "Discipleship" },
  { value: "MISSIONS", label: "Missions" },
  { value: "MEDIA", label: "Media" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "ADMINISTRATION", label: "Administration" },
  { value: "PASTORAL_CARE", label: "Pastoral Care" },
  { value: "SECURITY", label: "Security" },
  { value: "FACILITIES", label: "Facilities" },
  { value: "TRANSPORTATION", label: "Transportation" },
  { value: "OTHER", label: "Other" },
] as const;

export const memberMinistryRoleOptions = [
  { value: "PARTICIPANT", label: "Participant" },
  { value: "VOLUNTEER", label: "Volunteer" },
  { value: "TEAM_MEMBER", label: "Team Member" },
  { value: "TEAM_LEAD", label: "Team Lead" },
  { value: "COORDINATOR", label: "Coordinator" },
  { value: "DIRECTOR", label: "Director" },
  { value: "PASTOR", label: "Pastor" },
  { value: "OTHER", label: "Other" },
] as const;

export const memberMinistryStatusOptions = [
  { value: "INTERESTED", label: "Interested" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "COMPLETED", label: "Completed" },
] as const;

export const skillProficiencyLevelOptions = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
  { value: "EXPERT", label: "Expert" },
] as const;

export const memberDocumentTypeOptions = [
  { value: "BAPTISM_CERTIFICATE", label: "Baptism Certificate" },
  { value: "MEMBERSHIP_FORM", label: "Membership Form" },
  { value: "BACKGROUND_CHECK", label: "Background Check" },
  { value: "VOLUNTEER_APPLICATION", label: "Volunteer Application" },
  { value: "TRAINING_CERTIFICATE", label: "Training Certificate" },
  { value: "PASTORAL_DOCUMENT", label: "Pastoral Document" },
  { value: "MEDICAL_FORM", label: "Medical Form" },
  { value: "PERMISSION_FORM", label: "Permission Form" },
  { value: "IDENTIFICATION", label: "Identification" },
  { value: "MARRIAGE_CERTIFICATE", label: "Marriage Certificate" },
  { value: "ORDINATION_DOCUMENT", label: "Ordination Document" },
  { value: "OTHER", label: "Other" },
] as const;

export const DEFAULT_SPIRITUAL_GIFTS = [
  {
    name: "Administration",
    category: "Serving",
    description: "Organizing people and resources to accomplish ministry goals.",
  },
  {
    name: "Encouragement",
    category: "Speaking",
    description: "Strengthening others through words of hope and affirmation.",
  },
  {
    name: "Evangelism",
    category: "Speaking",
    description: "Sharing the gospel clearly and inviting others to faith.",
  },
  {
    name: "Faith",
    category: "Speaking",
    description: "Trusting God confidently and inspiring others to do the same.",
  },
  {
    name: "Giving",
    category: "Serving",
    description: "Generously supporting ministry needs with resources.",
  },
  {
    name: "Helps",
    category: "Serving",
    description: "Supporting others practically so ministry can flourish.",
  },
  {
    name: "Hospitality",
    category: "Serving",
    description: "Welcoming people and creating a sense of belonging.",
  },
  {
    name: "Leadership",
    category: "Speaking",
    description: "Guiding teams with vision, care, and accountability.",
  },
  {
    name: "Mercy",
    category: "Serving",
    description: "Showing compassion to those who are hurting or overlooked.",
  },
  {
    name: "Pastoring",
    category: "Speaking",
    description: "Shepherding people toward spiritual growth and care.",
  },
  {
    name: "Prayer",
    category: "Serving",
    description: "Interceding faithfully for people, ministries, and needs.",
  },
  {
    name: "Service",
    category: "Serving",
    description: "Meeting practical needs with a willing and humble heart.",
  },
  {
    name: "Teaching",
    category: "Speaking",
    description: "Explaining Scripture clearly so others can understand and apply it.",
  },
  {
    name: "Wisdom",
    category: "Speaking",
    description: "Discerning godly insight and applying it to real situations.",
  },
] as const;

export function formatEngagementEnumLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}
