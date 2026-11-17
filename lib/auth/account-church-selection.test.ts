import { describe, expect, it } from "vitest";

import { selectChurchAfterSignIn } from "./account-church-selection";

const FIRST_COMMUNITY = "org-first-community";
const FIRST_UPC = "org-first-upc";

describe("selectChurchAfterSignIn", () => {
  it("keeps the only membership when no Clerk organization is active", () => {
    expect(
      selectChurchAfterSignIn({
        clerkMappedOrganizationId: null,
        membershipOrganizationIds: [FIRST_COMMUNITY],
        savedOrganizationId: null,
      }),
    ).toEqual({
      status: "selected",
      organizationId: FIRST_COMMUNITY,
      source: "only-membership",
    });
  });

  it("does not guess a church when a fresh sign-in has two memberships and no saved choice", () => {
    expect(
      selectChurchAfterSignIn({
        clerkMappedOrganizationId: null,
        membershipOrganizationIds: [FIRST_COMMUNITY, FIRST_UPC],
        savedOrganizationId: null,
      }),
    ).toEqual({ status: "none", reason: "ambiguous" });
  });

  it("uses the saved First UPC membership after a fresh sign-in", () => {
    expect(
      selectChurchAfterSignIn({
        clerkMappedOrganizationId: null,
        membershipOrganizationIds: [FIRST_COMMUNITY, FIRST_UPC],
        savedOrganizationId: FIRST_UPC,
      }),
    ).toEqual({
      status: "selected",
      organizationId: FIRST_UPC,
      source: "saved-choice",
    });
  });

  it("does not honor a saved church without an active membership", () => {
    expect(
      selectChurchAfterSignIn({
        clerkMappedOrganizationId: null,
        membershipOrganizationIds: [FIRST_COMMUNITY],
        savedOrganizationId: FIRST_UPC,
      }),
    ).toEqual({
      status: "selected",
      organizationId: FIRST_COMMUNITY,
      source: "only-membership",
    });
  });

  it("keeps the active Clerk membership ahead of a saved choice", () => {
    expect(
      selectChurchAfterSignIn({
        clerkMappedOrganizationId: FIRST_COMMUNITY,
        membershipOrganizationIds: [FIRST_COMMUNITY, FIRST_UPC],
        savedOrganizationId: FIRST_UPC,
      }),
    ).toEqual({
      status: "selected",
      organizationId: FIRST_COMMUNITY,
      source: "clerk-membership",
    });
  });

  it("does not fall through when the Clerk organization is not one of the memberships", () => {
    expect(
      selectChurchAfterSignIn({
        clerkMappedOrganizationId: "org-other",
        membershipOrganizationIds: [FIRST_COMMUNITY, FIRST_UPC],
        savedOrganizationId: FIRST_UPC,
      }),
    ).toEqual({ status: "none", reason: "clerk-without-membership" });
  });

  it("reports no church when the account has no membership", () => {
    expect(
      selectChurchAfterSignIn({
        clerkMappedOrganizationId: null,
        membershipOrganizationIds: [],
        savedOrganizationId: FIRST_UPC,
      }),
    ).toEqual({ status: "none", reason: "no-membership" });
  });
});
