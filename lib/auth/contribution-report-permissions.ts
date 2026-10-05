import { RoleCode } from "@/app/generated/prisma/client";

export const CONTRIBUTION_REPORT_READERS: RoleCode[] = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.REPORT_VIEWER,
];

export function canViewContributionReports(roleCode: RoleCode | null) {
  return Boolean(roleCode && CONTRIBUTION_REPORT_READERS.includes(roleCode));
}

export function canExportContributionReports(roleCode: RoleCode | null) {
  return canViewContributionReports(roleCode);
}
