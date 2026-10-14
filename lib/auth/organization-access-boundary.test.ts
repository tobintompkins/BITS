import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  userAccountFindUnique: vi.fn(),
  userAccountCreate: vi.fn(),
  organizationFindFirst: vi.fn(),
  organizationFindMany: vi.fn(),
  membershipFindFirst: vi.fn(),
  membershipFindMany: vi.fn(),
  membershipCreate: vi.fn(),
  membershipUpsert: vi.fn(),
  roleTypeFindUnique: vi.fn(),
  donorFindMany: vi.fn(),
  donorFindFirst: vi.fn(),
  donorCount: vi.fn(),
  donationAggregate: vi.fn(),
  countOfferingBatches: vi.fn(),
  findOfferingBatches: vi.fn(),
  countOfferingBatchesByStatus: vi.fn(),
  sumRecordedTotal: vi.fn(),
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
      findMany: mocks.organizationFindMany,
    },
    organizationMembership: {
      findFirst: mocks.membershipFindFirst,
      findMany: mocks.membershipFindMany,
      create: mocks.membershipCreate,
      upsert: mocks.membershipUpsert,
    },
    roleType: {
      findUnique: mocks.roleTypeFindUnique,
    },
    donor: {
      findMany: mocks.donorFindMany,
      findFirst: mocks.donorFindFirst,
      count: mocks.donorCount,
    },
    donation: {
      aggregate: mocks.donationAggregate,
    },
  },
}));

vi.mock("@/server/repositories/offering-batch.repository", () => ({
  countOfferingBatches: mocks.countOfferingBatches,
  findOfferingBatches: mocks.findOfferingBatches,
  countOfferingBatchesByStatus: mocks.countOfferingBatchesByStatus,
  sumRecordedTotalForOfferingDateRange: mocks.sumRecordedTotal,
}));

import { listDonors, saveDonor } from "@/server/services/donor-management.service";
import { getMemberPortalDashboard } from "@/server/services/member-portal.service";
import { getOfferingBatchDirectory } from "@/server/services/offering-batch.service";
import { emptyDonor } from "@/lib/validation/donor";

const ACCOUNT = {
  id: "account-1",
  clerkUserId: "user-1",
  primaryEmail: "guest@example.test",
  displayName: "Guest",
  active: true,
};
const ORG_A = {
  id: "org-a",
  name: "Church A",
  displayName: "Church A",
  clerkOrganizationId: "clerk-org-a",
  active: true,
};
const ORG_B = {
  id: "org-b",
  name: "Church B",
  displayName: "Church B",
  clerkOrganizationId: "clerk-org-b",
  active: true,
};
const TREASURER = {
  organizationId: ORG_A.id,
  organization: ORG_A,
  roleType: { code: "TREASURER" },
  active: true,
};
const DIRECTORY_QUERY = {
  status: "all" as const,
  page: 1,
  pageSize: 20,
  sort: "offeringDate" as const,
  order: "desc" as const,
};

function expectNoPrivateReadsOrMembershipWrites() {
  expect(mocks.membershipCreate).not.toHaveBeenCalled();
  expect(mocks.membershipUpsert).not.toHaveBeenCalled();
  expect(mocks.donorFindMany).not.toHaveBeenCalled();
  expect(mocks.donorCount).not.toHaveBeenCalled();
  expect(mocks.donationAggregate).not.toHaveBeenCalled();
  expect(mocks.findOfferingBatches).not.toHaveBeenCalled();
  expect(mocks.countOfferingBatches).not.toHaveBeenCalled();
}

describe("protected original-v1 access boundaries", () => {
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
      publicMetadata: {},
    });
    mocks.userAccountFindUnique.mockResolvedValue(ACCOUNT);
    mocks.organizationFindFirst.mockResolvedValue(ORG_A);
    mocks.organizationFindMany.mockResolvedValue([ORG_A]);
    mocks.membershipFindFirst.mockResolvedValue(null);
    mocks.membershipFindMany.mockResolvedValue([]);
    mocks.roleTypeFindUnique.mockResolvedValue({ id: "role-admin" });
    mocks.findOfferingBatches.mockResolvedValue([]);
    mocks.countOfferingBatches.mockResolvedValue(0);
    mocks.countOfferingBatchesByStatus.mockResolvedValue(0);
    mocks.sumRecordedTotal.mockResolvedValue({ _sum: { recordedTotal: null } });
    mocks.donorFindMany.mockResolvedValue([
      { id: "secret-donor", firstName: "Private", lastName: "Gift" },
    ]);
    mocks.donorCount.mockResolvedValue(1);
  });

  afterEach(() => {
    if (previousAutoProvision === undefined) {
      delete process.env.BITS_AUTO_PROVISION_ORG_ACCESS;
    } else {
      process.env.BITS_AUTO_PROVISION_ORG_ACCESS = previousAutoProvision;
    }
  });

  it("denies batch, donor, and portal data to a signed-in nonmember of the only church", async () => {
    await expect(getOfferingBatchDirectory(DIRECTORY_QUERY)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(listDonors("", "all", 1)).rejects.toThrow(/Select a church/i);
    await expect(getMemberPortalDashboard()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(mocks.organizationFindMany).not.toHaveBeenCalled();
    expectNoPrivateReadsOrMembershipWrites();
  });

  it("does not create an account-less privilege path when UserAccount is missing", async () => {
    mocks.userAccountFindUnique.mockResolvedValue(null);
    mocks.userAccountCreate.mockResolvedValue(ACCOUNT);

    await expect(getOfferingBatchDirectory(DIRECTORY_QUERY)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(listDonors("", "all", 1)).rejects.toThrow(/active staff account/i);
    await expect(getMemberPortalDashboard()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
    expect(mocks.findOfferingBatches).not.toHaveBeenCalled();
    expect(mocks.donorFindMany).not.toHaveBeenCalled();
    expect(mocks.donationAggregate).not.toHaveBeenCalled();
  });

  it("does not restore a revoked membership or return private rows", async () => {
    mocks.membershipFindFirst.mockResolvedValue({
      id: "revoked",
      organizationId: ORG_A.id,
      userAccountId: ACCOUNT.id,
      active: false,
    });

    await expect(getOfferingBatchDirectory(DIRECTORY_QUERY)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(saveDonor(ORG_A.id, null, { ...emptyDonor, firstName: "Ada", lastName: "Lovelace" })).rejects.toThrow(
      /Select a church/i,
    );
    await expect(getMemberPortalDashboard()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expectNoPrivateReadsOrMembershipWrites();
  });

  it("does not fall through to another church for an unknown Clerk organization", async () => {
    mocks.auth.mockResolvedValue({
      userId: "user-1",
      orgId: "clerk-org-missing",
    });
    mocks.organizationFindFirst.mockResolvedValue(null);

    await expect(getOfferingBatchDirectory(DIRECTORY_QUERY)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(listDonors("", "all", 1)).rejects.toThrow(/Select a church/i);
    await expect(getMemberPortalDashboard()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(mocks.organizationFindMany).not.toHaveBeenCalled();
    expectNoPrivateReadsOrMembershipWrites();
  });

  it("denies ambiguous memberships instead of choosing a church", async () => {
    mocks.membershipFindMany.mockResolvedValue([
      { ...TREASURER, organization: ORG_A },
      { ...TREASURER, organizationId: ORG_B.id, organization: ORG_B },
    ]);

    await expect(getOfferingBatchDirectory(DIRECTORY_QUERY)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(listDonors("", "all", 1)).rejects.toThrow(/Select a church/i);
    await expect(getMemberPortalDashboard()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expectNoPrivateReadsOrMembershipWrites();
  });

  it("denies a selected-org Clerk member with no BITS membership even when auto-provision is enabled", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: "clerk-org-a" });

    await expect(getOfferingBatchDirectory(DIRECTORY_QUERY)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(listDonors("", "all", 1)).rejects.toThrow(/Select a church/i);
    await expect(getMemberPortalDashboard()).resolves.toMatchObject({
      status: "CONNECTION_PENDING",
      hasLeadershipAccess: false,
    });
    expect(mocks.donationAggregate).not.toHaveBeenCalled();
    expectNoPrivateReadsOrMembershipWrites();
  });

  it("allows batch and donor reads for a valid selected Clerk organization", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1", orgId: "clerk-org-a" });
    mocks.membershipFindFirst.mockResolvedValue(TREASURER);
    mocks.membershipFindMany.mockResolvedValue([TREASURER]);

    const batches = await getOfferingBatchDirectory(DIRECTORY_QUERY);
    const donors = await listDonors("", "all", 1);

    expect(batches.organizationName).toBe("Church A");
    expect(mocks.findOfferingBatches).toHaveBeenCalled();
    expect(donors.donors).toHaveLength(1);
    expect(mocks.donorFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_A.id }),
      }),
    );
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });

  it("allows the exactly-one authorized membership fallback without a Clerk organization", async () => {
    mocks.membershipFindFirst.mockResolvedValue(TREASURER);
    mocks.membershipFindMany.mockResolvedValue([TREASURER]);

    const batches = await getOfferingBatchDirectory(DIRECTORY_QUERY);
    const donors = await listDonors("", "all", 1);

    expect(batches.canManage).toBe(true);
    expect(donors.organization.id).toBe(ORG_A.id);
    expect(mocks.organizationFindMany).not.toHaveBeenCalled();
    expect(mocks.membershipCreate).not.toHaveBeenCalled();
  });
});
