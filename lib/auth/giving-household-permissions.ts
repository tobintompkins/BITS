import { RoleCode } from "@/app/generated/prisma/client";

export const GIVING_HOUSEHOLD_READERS: RoleCode[] = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.DATA_ENTRY,
  RoleCode.REPORT_VIEWER,
];

export const GIVING_HOUSEHOLD_WRITERS: RoleCode[] = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.DATA_ENTRY,
];

export const GIVING_HOUSEHOLD_FINANCIAL_EDITORS: RoleCode[] = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
];

export function canViewGivingHouseholds(roleCode: RoleCode | null) {
  return Boolean(roleCode && GIVING_HOUSEHOLD_READERS.includes(roleCode));
}

export function canManageGivingHouseholds(roleCode: RoleCode | null) {
  return Boolean(roleCode && GIVING_HOUSEHOLD_WRITERS.includes(roleCode));
}

export function canAssignGivingHouseholdFinancialContacts(
  roleCode: RoleCode | null,
) {
  return Boolean(
    roleCode && GIVING_HOUSEHOLD_FINANCIAL_EDITORS.includes(roleCode),
  );
}

export function canBackdateGivingHouseholdMemberships(
  roleCode: RoleCode | null,
) {
  return canAssignGivingHouseholdFinancialContacts(roleCode);
}
