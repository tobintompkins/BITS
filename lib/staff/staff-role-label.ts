import { RoleCode } from "@/app/generated/prisma/client";

export function formatStaffRoleLabel(
  roleCode: RoleCode | string | null,
  isSuperAdmin = false,
) {
  if (isSuperAdmin) {
    return "Super Admin";
  }

  switch (roleCode) {
    case RoleCode.ORG_ADMIN:
    case "ORG_ADMIN":
      return "Organization Admin";
    case RoleCode.TREASURER:
    case "TREASURER":
      return "Treasurer";
    case RoleCode.DATA_ENTRY:
    case "DATA_ENTRY":
      return "Data Entry";
    case RoleCode.REPORT_VIEWER:
    case "REPORT_VIEWER":
      return "Report Viewer";
    case RoleCode.DONOR:
    case "DONOR":
      return "Donor";
    default:
      return null;
  }
}

export function staffChurchDisplayName(organization: {
  displayName?: string | null;
  name: string;
} | null) {
  if (!organization) return null;
  const displayName = organization.displayName?.trim();
  const name = organization.name.trim();
  return displayName || name || null;
}
