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

  it("does not expose statements to data entry or donor roles", () => {
    expect(
      getGivingCapabilitiesForRole(RoleCode.DATA_ENTRY).canViewStatements,
    ).toBe(false);
    expect(getGivingCapabilitiesForRole(RoleCode.DONOR).canViewStatements).toBe(
      false,
    );
  });
});
