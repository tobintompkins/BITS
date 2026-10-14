import { describe, expect, it } from "vitest";

import {
  intendedStaffInvitationSummary,
  normalizeStaffInvitationEmail,
  parseStaffInvitationDirectoryQuery,
  staffInvitationCreateFormFromUnknown,
} from "./staff-invitation";

describe("staff invitation validation", () => {
  it("trims and lowercases email without inventing aliases", () => {
    expect(normalizeStaffInvitationEmail("  Pat+Finance@Church.TEST ")).toBe(
      "pat+finance@church.test",
    );
    expect(normalizeStaffInvitationEmail("a.b@gmail.com")).toBe("a.b@gmail.com");
  });

  it("builds a confirmation summary from server-known church and role", () => {
    expect(
      intendedStaffInvitationSummary({
        email: "pat@church.test",
        churchName: "Northside Chapel",
        roleCode: "TREASURER",
      }),
    ).toBe("Invite pat@church.test to Northside Chapel as Treasurer.");
  });

  it("parses invitation directory filters and ignores unknown client claims", () => {
    expect(
      parseStaffInvitationDirectoryQuery({
        invitations: "HISTORY",
        iq: " Pat@ ",
        ipage: "2",
        organizationId: "forged",
      }),
    ).toEqual({
      success: true,
      data: { filter: "HISTORY", query: "Pat@", page: 2 },
    });
    expect(parseStaffInvitationDirectoryQuery({ invitations: "ALL" }).success).toBe(
      false,
    );
  });

  it("reads create-form confirmation from checkbox values", () => {
    expect(
      staffInvitationCreateFormFromUnknown({
        email: "  Pat@Church.TEST ",
        roleCode: "ORG_ADMIN",
        confirm: "on",
        confirmAdmin: "on",
      }),
    ).toEqual({
      email: "pat@church.test",
      emailDisplay: "Pat@Church.TEST",
      roleCode: "ORG_ADMIN",
      confirm: true,
      confirmAdmin: true,
    });
  });
});
