import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  statementFindMany: vi.fn(),
  statementDeleteMany: vi.fn(),
  accessDeleteMany: vi.fn(),
  donorFindMany: vi.fn(),
  donorDeleteMany: vi.fn(),
  batchFindMany: vi.fn(),
  batchDeleteMany: vi.fn(),
  donationFindMany: vi.fn(),
  donationDeleteMany: vi.fn(),
  allocationDeleteMany: vi.fn(),
  householdFindMany: vi.fn(),
  householdMembershipDeleteMany: vi.fn(),
  householdUpdateMany: vi.fn(),
  householdDeleteMany: vi.fn(),
  offeringTypeFindMany: vi.fn(),
  offeringTypeDeleteMany: vi.fn(),
  auditDeleteMany: vi.fn(),
}));

vi.mock("@/lib/storage/statement-pdf", () => ({
  getPrivateStatementStorageRoot: () => "/tmp/unused-original-v1-cleanup",
}));

vi.mock("@/lib/testing/original-v1-acceptance-config", () => ({
  parseOriginalV1AcceptanceConfig: vi.fn(),
}));

vi.mock("@/e2e/acceptance/fixtures/prisma", () => ({
  createOriginalV1AcceptancePrisma: vi.fn(),
}));

vi.mock("@/e2e/acceptance/fixtures/manifest", () => ({
  tryReadOriginalV1Manifest: vi.fn(),
}));

import { cleanupOwnedOriginalV1Rows } from "@/e2e/acceptance/fixtures/cleanup";

import { originalV1OwnedAuditEventWhere, originalV1OwnedAuditIdsWhere } from "./original-v1-acceptance-cleanup";

const ORG_A = "org-a";
const PREFIX_A = "E2E07-runA-";
const PREFIX_B = "E2E07-runB-";
const DONOR_A = "donor-run-a";
const DONOR_B = "donor-run-b";

const prisma = {
  contributionStatement: {
    findMany: mocks.statementFindMany,
    deleteMany: mocks.statementDeleteMany,
  },
  statementAccessEvent: { deleteMany: mocks.accessDeleteMany },
  donor: { findMany: mocks.donorFindMany, deleteMany: mocks.donorDeleteMany },
  offeringBatch: {
    findMany: mocks.batchFindMany,
    deleteMany: mocks.batchDeleteMany,
  },
  donation: {
    findMany: mocks.donationFindMany,
    deleteMany: mocks.donationDeleteMany,
  },
  donationAllocation: { deleteMany: mocks.allocationDeleteMany },
  household: {
    findMany: mocks.householdFindMany,
    updateMany: mocks.householdUpdateMany,
    deleteMany: mocks.householdDeleteMany,
  },
  householdMembership: { deleteMany: mocks.householdMembershipDeleteMany },
  offeringType: {
    findMany: mocks.offeringTypeFindMany,
    deleteMany: mocks.offeringTypeDeleteMany,
  },
  auditEvent: { deleteMany: mocks.auditDeleteMany },
};

describe("original v1 owned audit cleanup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.statementFindMany.mockResolvedValue([]);
    mocks.donorFindMany.mockResolvedValue([{ id: DONOR_A }]);
    mocks.batchFindMany.mockResolvedValue([]);
    mocks.donationFindMany.mockResolvedValue([]);
    mocks.householdFindMany.mockResolvedValue([]);
    mocks.offeringTypeFindMany.mockResolvedValue([]);
  });

  it("scopes deletes to owned entity IDs and never to action names", () => {
    const runA = originalV1OwnedAuditEventWhere([ORG_A], [DONOR_A]);
    const runB = originalV1OwnedAuditEventWhere([ORG_A], [DONOR_B]);
    expect(runA).toEqual({
      organizationId: { in: [ORG_A] },
      entityId: { in: [DONOR_A] },
    });
    expect(runB?.entityId.in).toEqual([DONOR_B]);
    expect(runA?.entityId.in).not.toContain(DONOR_B);
    expect(runA?.entityId.in).not.toContain(ORG_A);
    expect(JSON.stringify(runA)).not.toContain("CONTRIBUTION_REPORT_EXPORTED");
    expect(JSON.stringify(runA)).not.toContain("DONOR_CREATED");
    expect(PREFIX_A).not.toEqual(PREFIX_B);
  });

  it("keeps unrelated same-action records from another run prefix in the same church", async () => {
    await cleanupOwnedOriginalV1Rows(prisma as never, [ORG_A], PREFIX_A);

    expect(mocks.donorFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: { in: [ORG_A] },
        firstName: { startsWith: PREFIX_A },
      },
      select: { id: true },
    });
    expect(mocks.auditDeleteMany).toHaveBeenCalledWith({
      where: originalV1OwnedAuditEventWhere([ORG_A], [DONOR_A]),
    });
    const deletedWhere = mocks.auditDeleteMany.mock.calls[0][0].where;
    expect(deletedWhere.entityId.in).not.toContain(DONOR_B);
    expect(deletedWhere.entityId.in).not.toContain(ORG_A);
    expect(deletedWhere).not.toHaveProperty("action");
    expect(deletedWhere).not.toHaveProperty("OR");
  });

  it("includes a prefix-owned offering type in the audit cleanup before deleting it", async () => {
    const fundId = "66666666-6666-4666-8666-666666666666";
    mocks.offeringTypeFindMany.mockResolvedValue([{ id: fundId }]);

    await cleanupOwnedOriginalV1Rows(prisma as never, [ORG_A], PREFIX_A);

    expect(mocks.auditDeleteMany.mock.calls[0][0].where.entityId.in).toContain(fundId);
    expect(mocks.offeringTypeDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: [fundId] }, organizationId: { in: [ORG_A] } },
    });
  });

  it("deletes recorded audit rows by exact id inside the fixture churches", () => {
    const auditId = "55555555-5555-4555-8555-555555555555";
    const where = originalV1OwnedAuditIdsWhere([ORG_A], [auditId]);
    expect(where).toEqual({
      organizationId: { in: [ORG_A] },
      id: { in: [auditId] },
    });
    expect(where).not.toHaveProperty("action");
    expect(where).not.toHaveProperty("entityId");
    expect(originalV1OwnedAuditIdsWhere([], [auditId])).toBeNull();
  });
});
