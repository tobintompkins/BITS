import { describe, expect, it } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";

import {
  formatStaffRoleLabel,
  staffChurchDisplayName,
} from "./staff-role-label";

describe("staff church and role display", () => {
  it("uses the authorized church name and does not invent a fallback", () => {
    expect(staffChurchDisplayName(null)).toBeNull();
    expect(staffChurchDisplayName({ name: "  ", displayName: null })).toBeNull();
    expect(
      staffChurchDisplayName({
        name: "First UPC of Saco",
        displayName: "First United Pentecostal Church of Saco",
      }),
    ).toBe("First United Pentecostal Church of Saco");
    expect(
      staffChurchDisplayName({ name: "First UPC of Saco", displayName: null }),
    ).toBe("First UPC of Saco");
  });

  it("labels original staff roles without inventing a church membership", () => {
    expect(formatStaffRoleLabel(null)).toBeNull();
    expect(formatStaffRoleLabel(RoleCode.ORG_ADMIN)).toBe("Organization Admin");
    expect(formatStaffRoleLabel(RoleCode.TREASURER)).toBe("Treasurer");
    expect(formatStaffRoleLabel(RoleCode.DATA_ENTRY)).toBe("Data Entry");
    expect(formatStaffRoleLabel(RoleCode.REPORT_VIEWER)).toBe("Report Viewer");
    expect(formatStaffRoleLabel(RoleCode.DONOR)).toBe("Donor");
    expect(formatStaffRoleLabel(RoleCode.ORG_ADMIN, true)).toBe("Super Admin");
  });
});
