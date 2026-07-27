export function getMemberDisplayName(member: {
  preferredName?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
}) {
  const baseName = member.preferredName?.trim() || member.firstName;
  const parts = [baseName, member.middleName, member.lastName, member.suffix]
    .filter(Boolean)
    .join(" ");

  return parts.replace(/\s+/g, " ").trim();
}
