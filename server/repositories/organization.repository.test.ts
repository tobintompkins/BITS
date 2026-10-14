import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  userAccountFindUnique: vi.fn(),
  memberships: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: {
      findFirst: mocks.findFirst,
      findMany: mocks.findMany,
    },
    userAccount: {
      findUnique: mocks.userAccountFindUnique,
    },
    organizationMembership: {
      findMany: mocks.memberships,
    },
  },
}));

import { findPrimaryOrganization } from "./organization.repository";

const ORG_A = { id: "00000000-0000-4000-8000-00000000a001", active: true };
const ORG_B = { id: "00000000-0000-4000-8000-00000000a002", active: true };

describe("findPrimaryOrganization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: null, orgId: null });
  });

  it("returns the first organization for signed-out public pages", async () => {
    mocks.findFirst.mockResolvedValue(ORG_A);
    await expect(findPrimaryOrganization()).resolves.toEqual(ORG_A);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("uses the active Clerk organization instead of the oldest church", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: "clerk-org-b" });
    mocks.findFirst.mockResolvedValue(ORG_B);
    await expect(findPrimaryOrganization()).resolves.toEqual(ORG_B);
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { active: true, clerkOrganizationId: "clerk-org-b" },
    });
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it("does not fall back to another church when the Clerk org is unknown", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: "clerk-org-missing" });
    mocks.findFirst.mockResolvedValue(null);
    await expect(findPrimaryOrganization()).resolves.toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("falls back to exactly one active membership when Clerk has no organization", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: null });
    mocks.userAccountFindUnique.mockResolvedValue({ id: "account-1" });
    mocks.memberships.mockResolvedValue([{ organization: ORG_A }]);
    await expect(findPrimaryOrganization()).resolves.toEqual(ORG_A);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("denies ambiguous membership instead of picking the first church", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: null });
    mocks.userAccountFindUnique.mockResolvedValue({ id: "account-1" });
    mocks.memberships.mockResolvedValue([
      { organization: ORG_A },
      { organization: ORG_B },
    ]);
    await expect(findPrimaryOrganization()).resolves.toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("does not grant the only church to a signed-in user without a membership", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: null });
    mocks.userAccountFindUnique.mockResolvedValue({ id: "account-1" });
    mocks.memberships.mockResolvedValue([]);
    await expect(findPrimaryOrganization()).resolves.toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("does not grant the only church when the signed-in user has no UserAccount", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: null });
    mocks.userAccountFindUnique.mockResolvedValue(null);
    await expect(findPrimaryOrganization()).resolves.toBeNull();
    expect(mocks.memberships).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("does not pick among multiple churches for a signed-in user without membership", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: null });
    mocks.userAccountFindUnique.mockResolvedValue({ id: "account-1" });
    mocks.memberships.mockResolvedValue([]);
    await expect(findPrimaryOrganization()).resolves.toBeNull();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns null when Postgres refuses the connection", async () => {
    mocks.findFirst.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    );
    await expect(findPrimaryOrganization()).resolves.toBeNull();
  });

  it("rethrows unexpected Prisma errors", async () => {
    mocks.findFirst.mockRejectedValue(
      Object.assign(new Error("Unknown argument"), { code: "P2009" }),
    );
    await expect(findPrimaryOrganization()).rejects.toThrow("Unknown argument");
  });
});
