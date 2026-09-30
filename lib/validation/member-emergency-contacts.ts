export const MEMBER_EMERGENCY_CONTACTS_NOTICE =
  "These are the emergency contacts currently recorded on your membership. This page is read-only.";

export const MEMBER_EMERGENCY_CONTACTS_CORRECTION_COPY =
  "Need to add or correct an emergency contact? Please contact the church office.";

export const MEMBER_EMERGENCY_CONTACTS_EMPTY_COPY =
  "No emergency contact is recorded on your membership yet. Contact the church office if this information needs correction.";

export const MEMBER_EMERGENCY_CONTACTS_PENDING_COPY =
  "Your account must be connected to your church membership record before emergency contacts can appear. Contact the church office if this information needs correction.";

export const MEMBER_EMERGENCY_CONTACTS_ROW_FIELDS = [
  "name",
  "relationship",
  "phone",
  "email",
  "isPrimary",
  "primaryStatusLabel",
] as const;

export const memberEmergencyContactsHref = "/portal/emergency-contacts";

export function emergencyContactPrimaryStatusLabel(isPrimary: boolean) {
  return isPrimary ? "Primary" : "Additional";
}
