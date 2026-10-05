import { RoleCode } from "@/app/generated/prisma/client";

export const BATCH_RECONCILIATION_REPORT_READERS: RoleCode[] = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.REPORT_VIEWER,
];

export const STATEMENT_ACCESS_REPORT_READERS: RoleCode[] = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
];

export function canViewBatchReconciliationReports(roleCode: RoleCode | null) {
  return Boolean(
    roleCode && BATCH_RECONCILIATION_REPORT_READERS.includes(roleCode),
  );
}

export function canExportBatchReconciliationReports(roleCode: RoleCode | null) {
  return canViewBatchReconciliationReports(roleCode);
}

export function canViewStatementAccessReports(roleCode: RoleCode | null) {
  return Boolean(roleCode && STATEMENT_ACCESS_REPORT_READERS.includes(roleCode));
}

export function canExportStatementAccessReports(roleCode: RoleCode | null) {
  return canViewStatementAccessReports(roleCode);
}
