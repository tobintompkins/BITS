import { RoleCode } from "@/app/generated/prisma/client";

export const OFFERING_TYPE_READERS: RoleCode[] = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.DATA_ENTRY,
  RoleCode.REPORT_VIEWER,
];

export const OFFERING_TYPE_WRITERS: RoleCode[] = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
];

export function canViewOfferingTypes(roleCode: RoleCode | null) {
  return Boolean(roleCode && OFFERING_TYPE_READERS.includes(roleCode));
}

export function canManageOfferingTypes(roleCode: RoleCode | null) {
  return Boolean(roleCode && OFFERING_TYPE_WRITERS.includes(roleCode));
}
