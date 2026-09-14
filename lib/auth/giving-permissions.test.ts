import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: vi.fn(),
}));

import { RoleCode } from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "./giving-permissions";

describe("giving permissions", () => {
  it("allows administrators and treasurers to manage statements", () => {
    expect(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN).canManageStatements,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.TREASURER).canManageStatements,
    ).toBe(true);
  });

  it("keeps report viewers read-only", () => {
    const access = getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER);
    expect(access.canViewStatements).toBe(true);
    expect(access.canManageStatements).toBe(false);
  });

  it("lets only administrators and treasurers match unmatched gifts", () => {
    expect(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN).canManageStatements,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.TREASURER).canManageStatements,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER).canManageStatements,
    ).toBe(false);
    expect(
      getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY).canManageStatements,
    ).toBe(false);
    expect(getGivingCapabilitiesForRole(RoleCode.DONOR).canManageStatements).toBe(
      false,
    );
    expect(getGivingCapabilitiesForRole(null).canViewStatements).toBe(false);
  });

  it("lets data entry manage batches while report viewers stay read-only", () => {
    expect(getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN).canManageBatches).toBe(
      true,
    );
    expect(getGivingCapabilitiesForRole(RoleCode.TREASURER).canManageBatches).toBe(
      true,
    );
    expect(getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY).canManageBatches).toBe(
      true,
    );
    expect(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER).canViewBatches,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER).canManageBatches,
    ).toBe(false);
    expect(getGivingCapabilitiesForRole(RoleCode.DONOR).canViewBatches).toBe(false);
    expect(getGivingCapabilitiesForRole(null).canViewBatches).toBe(false);
  });

  it("lets data entry add batch donations while report viewers stay read-only", () => {
    expect(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN).canAddBatchDonations,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.TREASURER).canAddBatchDonations,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY).canAddBatchDonations,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER).canAddBatchDonations,
    ).toBe(false);
    expect(
      getGivingCapabilitiesForRole(RoleCode.DONOR).canAddBatchDonations,
    ).toBe(false);
  });

  it("lets data entry complete draft entry but not reconcile", () => {
    expect(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN).canCompleteBatchEntry,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.TREASURER).canReconcileBatches,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY).canCompleteBatchEntry,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY).canReconcileBatches,
    ).toBe(false);
    expect(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER).canCompleteBatchEntry,
    ).toBe(false);
    expect(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER).canReconcileBatches,
    ).toBe(false);
  });

  it("lets only administrators and treasurers record deposits and lock batches", () => {
    expect(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN).canRecordBatchDeposits,
    ).toBe(true);
    expect(getGivingCapabilitiesForRole(RoleCode.TREASURER).canLockBatches).toBe(
      true,
    );
    expect(
      getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY).canRecordBatchDeposits,
    ).toBe(false);
    expect(getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY).canLockBatches).toBe(
      false,
    );
    expect(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER).canLockBatches,
    ).toBe(false);
  });

  it("lets only administrators and treasurers review financial corrections", () => {
    expect(
      getGivingCapabilitiesForRole(RoleCode.ORG_ADMIN)
        .canReviewFinancialCorrections,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.TREASURER)
        .canReviewFinancialCorrections,
    ).toBe(true);
    expect(
      getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY)
        .canReviewFinancialCorrections,
    ).toBe(false);
    expect(
      getGivingCapabilitiesForRole(RoleCode.REPORT_VIEWER)
        .canReviewFinancialCorrections,
    ).toBe(false);
  });

  it("does not expose statements to data entry or donor roles", () => {
    expect(
      getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY).canViewStatements,
    ).toBe(false);
    expect(getGivingCapabilitiesForRole(RoleCode.DONOR).canViewStatements).toBe(
      false,
    );
  });
});
