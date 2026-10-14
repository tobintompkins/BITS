import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  organizationFindFirst: vi.fn(),
  memberships: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    organization: { findFirst: mocks.organizationFindFirst },
    organizationMembership: { findMany: mocks.memberships },
  },
}));

import { findCurrentOrganizationForUser } from "./current-organization";

const ORG_A = { id: "org-a", clerkOrganizationId: "clerk-org-a", active: true };

describe("findCurrentOrganizationForUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: "clerk-org-a" });
    mocks.organizationFindFirst.mockResolvedValue(ORG_A);
    mocks.memberships.mockResolvedValue([]);
  });

  it("uses the active Clerk organization instead of the oldest church row", async () => {
    await expect(findCurrentOrganizationForUser("account-1")).resolves.toEqual(ORG_A);
    expect(mocks.organizationFindFirst).toHaveBeenCalledWith({
      where: { active: true, clerkOrganizationId: "clerk-org-a" },
    });
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it("falls back to exactly one active membership when Clerk has no organization", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: null });
    mocks.memberships.mockResolvedValue([{ organization: ORG_A }]);
    await expect(findCurrentOrganizationForUser("account-1")).resolves.toEqual(ORG_A);
    expect(mocks.organizationFindFirst).not.toHaveBeenCalled();
  });

  it("denies ambiguous membership instead of picking the first church", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: null });
    mocks.memberships.mockResolvedValue([
      { organization: ORG_A },
      { organization: { id: "org-b" } },
    ]);
    await expect(findCurrentOrganizationForUser("account-1")).resolves.toBeNull();
  });
});
