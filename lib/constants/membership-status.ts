export const membershipStatusValues = [
  "VISITOR",
  "REGULAR_ATTENDER",
  "MEMBER",
  "INACTIVE",
  "TRANSFERRED",
  "DECEASED",
] as const;

export type MembershipStatusValue = (typeof membershipStatusValues)[number];

export function formatMembershipStatus(status: MembershipStatusValue | string) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
