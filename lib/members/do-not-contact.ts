/**
 * Do-not-contact / communication allow-flag helpers.
 * Used by UI badges and outbound messaging guards.
 */

export type ContactPreferenceFlags = {
  preferredContactMethod?: string | null;
  allowEmail?: boolean | null;
  allowSms?: boolean | null;
  allowPhoneCalls?: boolean | null;
  allowPostalMail?: boolean | null;
};

export function isDoNotContact(member: ContactPreferenceFlags) {
  return member.preferredContactMethod === "DO_NOT_CONTACT";
}

export function canContactByEmail(member: ContactPreferenceFlags) {
  if (isDoNotContact(member)) return false;
  return member.allowEmail !== false;
}

export function canContactBySms(member: ContactPreferenceFlags) {
  if (isDoNotContact(member)) return false;
  return member.allowSms !== false;
}

export function canContactByPhone(member: ContactPreferenceFlags) {
  if (isDoNotContact(member)) return false;
  return member.allowPhoneCalls !== false;
}

export function canContactByPostalMail(member: ContactPreferenceFlags) {
  if (isDoNotContact(member)) return false;
  return member.allowPostalMail !== false;
}
