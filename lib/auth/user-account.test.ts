import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  userAccountFindUnique: vi.fn(),
  userAccountCreate: vi.fn(),
  organizationFindFirst: vi.fn(),
  membershipFindFirst: vi.fn(),
  membershipCreate: vi.fn(),
  membershipUpsert: vi.fn(),
  roleTypeFindUnique: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAccount: {
      findUnique: mocks.userAccountFindUnique,
      create: mocks.userAccountCreate,
    },
    organization: {
      findFirst: mocks.organizationFindFirst,
    },
    organizationMembership: {
      findFirst: mocks.membershipFindFirst,
      create: mocks.membershipCreate,
      upsert: mocks.membershipUpsert,
    },
    roleType: {
      findUnique: mocks.roleTypeFindUnique,
    },
  },
}));

import { getOrCreateUserAccount } from "./user-account";

const ACCOUNT = {
  id: "account-1",
  clerkUserId: "user-1",
  primaryEmail: "guest@example.test",
  displayName: "Guest",
  active: true,
};
const ORG_A = { id: "org-a", clerkOrganizationId: "clerk-org-a", active: true };

describe("getOrCreateUserAccount does not grant membership", () => {
  const previousAutoProvision = process.env.BITS_AUTO_PROVISION_ORG_ACCESS;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.BITS_AUTO_PROVISION_ORG_ACCESS = "true";
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: null });
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: ACCOUNT.primaryEmail },
      emailAddresses: [],
      firstName: "Guest",
      lastName: null,
      fullName: "Guest",
    });
    mocks.userAccountFindUnique.mockResolvedValue(ACCOUNT);
    mocks.organizationFindFirst.mockResolvedValue(ORG_A);
    mocks.membershipFindFirst.mockResolvedValue(null);
    mocks.roleTypeFindUnique.mockResolvedValue({ id: "role-admin" });
    mocks.membershipCreate.mockResolvedValue({ id: "membership-1" });
  });

  afterEach(() => {
    if (previousAutoProvision === undefined) {
      delete process.env.BITS_AUTO_PROVISION_ORG_ACCESS;
    } else {
      process.env.BITS_AUTO_PROVISION_ORG_ACCESS = previousAutoProvision;
    }
  });

  it("does not provision a membership from a lone church when Clerk has no organization", async () => {
    await expect(getOrCreateUserAccount()).resolves.toEqual(ACCOUNT);
    expect(mocks.organizationFindFirst).not.toHaveBeenCalled();
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
    expect(mocks.membershipUpsert).not.toHaveBeenCalled();
  });

  it("does not reactivate a revoked membership or escalate its role", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: "clerk-org-a" });
    mocks.membershipFindFirst.mockResolvedValue({
      id: "revoked",
      organizationId: ORG_A.id,
      userAccountId: ACCOUNT.id,
      active: false,
      roleTypeId: "role-donor",
    });

    await expect(getOrCreateUserAccount()).resolves.toEqual(ACCOUNT);
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
    expect(mocks.membershipUpsert).not.toHaveBeenCalled();
  });

  it("does not provision into an unknown Clerk organization", async () => {
    mocks.auth.mockResolvedValue({
      userId: "user-1",
      orgId: "clerk-org-missing",
    });
    mocks.organizationFindFirst.mockResolvedValue(null);

    await expect(getOrCreateUserAccount()).resolves.toEqual(ACCOUNT);
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
    expect(mocks.membershipUpsert).not.toHaveBeenCalled();
  });

  it("does not grant ORG_ADMIN to a selected-org Clerk member with no BITS membership", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: "clerk-org-a" });

    await expect(getOrCreateUserAccount()).resolves.toEqual(ACCOUNT);
    expect(mocks.organizationFindFirst).not.toHaveBeenCalled();
    expect(mocks.roleTypeFindUnique).not.toHaveBeenCalled();
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
    expect(mocks.membershipUpsert).not.toHaveBeenCalled();
  });
});
