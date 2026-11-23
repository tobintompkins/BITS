import { ChurchAccessStatus, RoleCode } from "@/app/generated/prisma/client";
import { describe, expect, it } from "vitest";

import { planOwnerAuthorizedAdmin } from "./owner-authorized-admin";

const ORG = "00000000-0000-4000-8000-00000000a001";
const OWNER = "00000000-0000-4000-8000-00000000c001";
const ADMIN = "00000000-0000-4000-8000-00000000c002";

const owner = {
  id: OWNER,
  clerkUserId: "user_owner",
  primaryEmail: "owner@church.test",
  appOwner: false,
};

function plan(overrides: Partial<Parameters<typeof planOwnerAuthorizedAdmin>[0]> = {}) {
  return planOwnerAuthorizedAdmin({
    organizationId: ORG,
    ownerClerkUserId: "user_owner",
    churchAdminClerkUserId: "user_admin",
    churchAdminEmail: "admin@church.test",
    ownerAccount: owner,
    otherOwnerAccountId: null,
    churchAdminAccount: null,
    emailAccount: null,
    membership: null,
    ...overrides,
  });
}

describe("planOwnerAuthorizedAdmin", () => {
  it("plans one new church admin without a password or a second account", () => {
    expect(plan()).toMatchObject({
      ok: true,
      designateOwner: true,
      createAccount: true,
      createMembership: true,
      updateMembership: false,
    });
  });

  it("reuses an existing active organization admin", () => {
    expect(
      plan({
        ownerAccount: { ...owner, appOwner: true },
        churchAdminAccount: {
          id: ADMIN,
          clerkUserId: "user_admin",
          primaryEmail: "admin@church.test",
          appOwner: false,
        },
        emailAccount: {
          id: ADMIN,
          clerkUserId: "user_admin",
          primaryEmail: "admin@church.test",
          appOwner: false,
        },
        membership: {
          id: "00000000-0000-4000-8000-00000000b002",
          userAccountId: ADMIN,
          roleCode: RoleCode.ORG_ADMIN,
          active: true,
          churchAccess: ChurchAccessStatus.ACTIVE,
        },
      }),
    ).toMatchObject({
      ok: true,
      designateOwner: false,
      createAccount: false,
      createMembership: false,
      updateMembership: false,
      alreadyActiveAdmin: true,
    });
  });

  it("refuses a duplicate email on a different sign-in", () => {
    expect(
      plan({
        emailAccount: {
          id: ADMIN,
          clerkUserId: "user_other",
          primaryEmail: "admin@church.test",
          appOwner: false,
        },
      }),
    ).toMatchObject({ ok: false, code: "DUPLICATE_ACCOUNT" });
  });

  it("refuses to reuse the owner identity for the church administrator", () => {
    expect(
      plan({ churchAdminClerkUserId: "user_owner" }),
    ).toMatchObject({ ok: false, code: "SAME_IDENTITY" });
  });

  it("refuses a second protected owner", () => {
    expect(
      plan({ otherOwnerAccountId: "00000000-0000-4000-8000-00000000c009" }),
    ).toMatchObject({ ok: false, code: "OTHER_OWNER" });
  });

  it("refuses a missing owner account", () => {
    expect(plan({ ownerAccount: null })).toMatchObject({
      ok: false,
      code: "MISSING_OWNER",
    });
  });
});
