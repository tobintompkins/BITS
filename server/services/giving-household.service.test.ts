import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  emptyGivingHousehold,
  givingHouseholdRefreshPaths,
} from "@/lib/validation/giving-household";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  actor: vi.fn(),
  memberships: vi.fn(),
  householdFind: vi.fn(),
  householdList: vi.fn(),
  householdCount: vi.fn(),
  householdCreate: vi.fn(),
  householdUpdate: vi.fn(),
  householdUpdateMany: vi.fn(),
  donorFind: vi.fn(),
  donorList: vi.fn(),
  donorCount: vi.fn(),
  membershipFind: vi.fn(),
  membershipFindMany: vi.fn(),
  membershipCreate: vi.fn(),
  membershipUpdate: vi.fn(),
  lock: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAccount: { findUnique: m.actor },
    organizationMembership: { findMany: m.memberships },
    household: {
      findFirst: m.householdFind,
      findMany: m.householdList,
      count: m.householdCount,
      create: m.householdCreate,
      update: m.householdUpdate,
      updateMany: m.householdUpdateMany,
    },
    donor: {
      findFirst: m.donorFind,
      findMany: m.donorList,
      count: m.donorCount,
    },
    householdMembership: {
      findFirst: m.membershipFind,
      findMany: m.membershipFindMany,
      create: m.membershipCreate,
      update: m.membershipUpdate,
    },
    $queryRaw: m.lock,
    $transaction: m.transaction,
  },
}));
vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: m.audit,
}));

import {
  endGivingHouseholdMembership,
  linkGivingHouseholdDonor,
  listGivingHouseholdDirectory,
  moveGivingHouseholdDonor,
  requireGivingHouseholdAccess,
  saveGivingHousehold,
  searchGivingHouseholdMoveTargets,
  searchUnassignedGivingDonors,
} from "./giving-household.service";

const org = {
  id: "org-a",
  active: true,
  name: "Church A",
  timeZone: "America/New_York",
};
const now = new Date("2026-10-03T16:00:00.000Z");
const updatedAt = new Date("2026-10-01T12:00:00.000Z");
const HH_A = "00000000-0000-4000-8000-0000000000a1";
const HH_B = "00000000-0000-4000-8000-0000000000b1";
const DONOR_A = "00000000-0000-4000-8000-0000000000d1";
const DONOR_26 = "00000000-0000-4000-8000-000000000026";
const MEM_A = "00000000-0000-4000-8000-0000000000e1";
const MEM_B = "00000000-0000-4000-8000-0000000000e2";

function role(code: string) {
  m.memberships.mockResolvedValue([
    { organizationId: org.id, organization: org, roleType: { code } },
  ]);
}

const householdInput = {
  ...emptyGivingHousehold,
  displayName: "The Adams Household",
  mailingAddressLine1: "10 Main St",
  city: "Saco",
  state: "ME",
  postalCode: "04072",
};

describe("giving household administration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    m.actor.mockResolvedValue({ id: "staff-a", active: true });
    role("TREASURER");
    m.householdList.mockResolvedValue([]);
    m.householdCount.mockResolvedValue(0);
    m.householdCreate.mockResolvedValue({ id: HH_A, organizationId: org.id });
    m.householdUpdate.mockResolvedValue({ id: HH_A, organizationId: org.id });
    m.householdUpdateMany.mockResolvedValue({ count: 1 });
    m.donorList.mockResolvedValue([]);
    m.donorCount.mockResolvedValue(0);
    m.lock.mockResolvedValue([{ id: HH_A }]);
    m.membershipFindMany.mockResolvedValue([]);
    m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        household: {
          findFirst: m.householdFind,
          create: m.householdCreate,
          update: m.householdUpdate,
          updateMany: m.householdUpdateMany,
        },
        donor: { findFirst: m.donorFind },
        householdMembership: {
          findFirst: m.membershipFind,
          findMany: m.membershipFindMany,
          create: m.membershipCreate,
          update: m.membershipUpdate,
        },
        $queryRaw: m.lock,
      }),
    );
  });

  it("rejects signed-out and donor roles", async () => {
    m.auth.mockResolvedValue({ userId: null });
    await expect(listGivingHouseholdDirectory("", "all", 1)).rejects.toThrow();
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    role("DONOR");
    await expect(listGivingHouseholdDirectory("", "all", 1)).rejects.toThrow();
  });

  it("rejects ambiguous organization fallback", async () => {
    m.auth.mockResolvedValue({ userId: "u", orgId: null });
    m.memberships.mockResolvedValue([{}, {}]);
    await expect(requireGivingHouseholdAccess()).rejects.toThrow("Select a church");
  });

  it("lets data entry create a household but not assign a statement recipient", async () => {
    role("DATA_ENTRY");
    await saveGivingHousehold(org.id, null, householdInput);
    expect(m.householdCreate.mock.calls[0][0].data.preferredStatementRecipientId).toBeNull();
    m.householdFind.mockResolvedValue({
      id: HH_A,
      organizationId: org.id,
      primaryDonorId: null,
      preferredStatementRecipientId: null,
      updatedAt,
    });
    await expect(
      saveGivingHousehold(
        org.id,
        HH_A,
        {
          ...householdInput,
          preferredStatementRecipientId: DONOR_A,
        },
        updatedAt.toISOString(),
      ),
    ).rejects.toThrow("preferred statement recipient");
    expect(m.householdUpdateMany).not.toHaveBeenCalled();
  });

  it("does not write financial-contact fields on a data-entry basic edit", async () => {
    role("DATA_ENTRY");
    m.householdFind.mockResolvedValue({
      id: HH_A,
      organizationId: org.id,
      primaryDonorId: null,
      preferredStatementRecipientId: null,
      updatedAt,
    });
    await saveGivingHousehold(org.id, HH_A, householdInput, updatedAt.toISOString());
    expect(m.householdUpdateMany.mock.calls[0][0].data).not.toHaveProperty(
      "primaryDonorId",
    );
    expect(m.householdUpdateMany.mock.calls[0][0].data).not.toHaveProperty(
      "preferredStatementRecipientId",
    );
  });

  it("rejects a data-entry attempt to resurrect a concurrently cleared recipient", async () => {
    role("DATA_ENTRY");
    m.householdFind.mockResolvedValue({
      id: HH_A,
      organizationId: org.id,
      primaryDonorId: null,
      preferredStatementRecipientId: null,
      updatedAt,
    });
    await expect(
      saveGivingHousehold(
        org.id,
        HH_A,
        { ...householdInput, preferredStatementRecipientId: DONOR_A },
        updatedAt.toISOString(),
      ),
    ).rejects.toThrow("preferred statement recipient");
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("rejects a competing settings write after the timestamp is read", async () => {
    m.householdFind.mockResolvedValue({
      id: HH_A,
      organizationId: org.id,
      primaryDonorId: null,
      preferredStatementRecipientId: null,
      updatedAt,
    });
    m.householdUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      saveGivingHousehold(org.id, HH_A, householdInput, updatedAt.toISOString()),
    ).rejects.toThrow("updated by someone else");
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("rejects a recipient who is no longer an eligible current member", async () => {
    m.householdFind.mockResolvedValue({
      id: HH_A,
      organizationId: org.id,
      primaryDonorId: null,
      preferredStatementRecipientId: null,
      updatedAt,
    });
    m.membershipFindMany.mockResolvedValue([]);
    await expect(
      saveGivingHousehold(
        org.id,
        HH_A,
        { ...householdInput, preferredStatementRecipientId: DONOR_A },
        updatedAt.toISOString(),
      ),
    ).rejects.toThrow("preferred statement recipient");
  });

  it("rejects a stale form after a church switch", async () => {
    await expect(saveGivingHousehold("org-b", null, householdInput)).rejects.toThrow(
      "selection changed",
    );
  });

  it("links an accountless donor and audits without private fields", async () => {
    m.householdFind.mockResolvedValue({
      id: HH_A,
      organizationId: org.id,
      active: true,
    });
    m.donorFind.mockResolvedValue({
      id: DONOR_A,
      organizationId: org.id,
      userAccountId: null,
    });
    m.membershipFind.mockResolvedValue(null);
    m.membershipCreate.mockResolvedValue({ id: MEM_A });
    const saved = await linkGivingHouseholdDonor(org.id, {
      householdId: HH_A,
      donorId: DONOR_A,
      startDate: "2026-10-03",
      now,
    });
    expect(saved).toEqual({
      membershipId: MEM_A,
      donorId: DONOR_A,
      householdIds: [HH_A],
    });
    expect(m.lock).toHaveBeenCalled();
    expect(m.membershipCreate.mock.calls[0][0].data).toMatchObject({
      organizationId: org.id,
      householdId: HH_A,
      donorId: DONOR_A,
    });
    expect(JSON.stringify(m.audit.mock.calls[0][0])).not.toMatch(/Main St|notes/i);
  });

  it("moves a donor by closing the old row the day before and creating a new row", async () => {
    m.householdFind
      .mockResolvedValueOnce({
        id: HH_A,
        organizationId: org.id,
        active: true,
        primaryDonorId: DONOR_A,
        preferredStatementRecipientId: DONOR_A,
        updatedAt,
      })
      .mockResolvedValueOnce({ id: HH_B, organizationId: org.id, active: true });
    const currentMembership = {
      id: MEM_A,
      organizationId: org.id,
      householdId: HH_A,
      donorId: DONOR_A,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: null,
      relationshipLabel: "SELF",
    };
    m.membershipFind
      .mockResolvedValueOnce(currentMembership)
      .mockResolvedValueOnce(currentMembership)
      .mockResolvedValueOnce(null);
    m.membershipCreate.mockResolvedValue({ id: MEM_B });
    const saved = await moveGivingHouseholdDonor(org.id, {
      donorId: DONOR_A,
      fromHouseholdId: HH_A,
      toHouseholdId: HH_B,
      currentMembershipId: MEM_A,
      effectiveDate: "2026-06-15",
      confirmBackdate: true,
      now,
    });
    expect(saved).toEqual({
      membershipId: MEM_B,
      donorId: DONOR_A,
      householdIds: [HH_A, HH_B],
    });
    expect(m.membershipUpdate.mock.calls[0][0].data.endDate.toISOString()).toBe(
      "2026-06-14T00:00:00.000Z",
    );
    expect(m.membershipCreate.mock.calls[0][0].data).toMatchObject({
      householdId: HH_B,
      startDate: new Date("2026-06-15T00:00:00.000Z"),
    });
    expect(m.householdUpdateMany.mock.calls[0][0].data).toMatchObject({
      primaryDonorId: null,
      preferredStatementRecipientId: null,
    });
  });

  it("locks source and destination households in sorted id order even when reversed", async () => {
    const currentMembership = {
      id: MEM_A,
      organizationId: org.id,
      householdId: HH_B,
      donorId: DONOR_A,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: null,
    };
    m.membershipFind.mockResolvedValue(currentMembership);
    m.householdFind
      .mockResolvedValueOnce({ id: HH_B, organizationId: org.id, active: true, updatedAt })
      .mockResolvedValueOnce({ id: HH_A, organizationId: org.id, active: false });
    await expect(
      moveGivingHouseholdDonor(org.id, {
        fromHouseholdId: HH_B,
        toHouseholdId: HH_A,
        currentMembershipId: MEM_A,
        effectiveDate: "2026-06-15",
        confirmBackdate: true,
        now,
      }),
    ).rejects.toThrow("active giving household");
    const lockSql = m.lock.mock.calls.map((call) => String(call[0]?.strings?.join(" ") ?? call[0]));
    const householdLocks = lockSql.filter((sql) => sql.includes("households"));
    expect(householdLocks.length).toBeGreaterThanOrEqual(2);
    expect(m.lock.mock.calls[0][1]).toBe(HH_A);
    expect(m.lock.mock.calls[1][1]).toBe(HH_B);
  });

  it("rejects a same-household move and a move at the current start date", async () => {
    await expect(
      moveGivingHouseholdDonor(org.id, {
        donorId: DONOR_A,
        fromHouseholdId: HH_A,
        toHouseholdId: HH_A,
        currentMembershipId: MEM_A,
        effectiveDate: "2026-06-15",
        confirmBackdate: true,
        now,
      }),
    ).rejects.toThrow("same household");
    m.householdFind
      .mockResolvedValueOnce({ id: HH_A, organizationId: org.id, active: true })
      .mockResolvedValueOnce({ id: HH_B, organizationId: org.id, active: true });
    const startedToday = {
      id: MEM_A,
      organizationId: org.id,
      householdId: HH_A,
      donorId: DONOR_A,
      startDate: new Date("2026-06-15T00:00:00.000Z"),
      endDate: null,
    };
    m.membershipFind
      .mockResolvedValueOnce(startedToday)
      .mockResolvedValueOnce(startedToday);
    await expect(
      moveGivingHouseholdDonor(org.id, {
        donorId: DONOR_A,
        fromHouseholdId: HH_A,
        toHouseholdId: HH_B,
        currentMembershipId: MEM_A,
        effectiveDate: "2026-06-15",
        confirmBackdate: true,
        now,
      }),
    ).rejects.toThrow("correction workflow");
  });

  it("rejects future membership dates and data-entry backdating", async () => {
    await expect(
      linkGivingHouseholdDonor(org.id, {
        householdId: HH_A,
        donorId: DONOR_A,
        startDate: "2026-10-04",
        now,
      }),
    ).rejects.toThrow("Future-effective");
    role("DATA_ENTRY");
    await expect(
      linkGivingHouseholdDonor(org.id, {
        householdId: HH_A,
        donorId: DONOR_A,
        startDate: "2026-06-01",
        confirmBackdate: true,
        now,
      }),
    ).rejects.toThrow("administrator or treasurer");
  });

  it("rejects overlapping history and rolls back when audit fails", async () => {
    m.householdFind.mockResolvedValue({
      id: HH_A,
      organizationId: org.id,
      active: true,
    });
    m.donorFind.mockResolvedValue({ id: DONOR_A, organizationId: org.id });
    m.membershipFind.mockResolvedValue(null);
    m.membershipFindMany.mockResolvedValue([
      {
        id: "old",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T00:00:00.000Z"),
      },
    ]);
    await expect(
      linkGivingHouseholdDonor(org.id, {
        householdId: HH_A,
        donorId: DONOR_A,
        startDate: "2026-06-15",
        confirmBackdate: true,
        now,
      }),
    ).rejects.toThrow("overlaps");
    m.membershipFindMany.mockResolvedValue([]);
    m.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(saveGivingHousehold(org.id, null, householdInput)).rejects.toThrow(
      "audit unavailable",
    );
  });

  it("ends membership on the last included day and keeps the historical row", async () => {
    m.membershipFind.mockResolvedValue({
      id: MEM_A,
      organizationId: org.id,
      householdId: HH_A,
      donorId: DONOR_A,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: null,
      updatedAt,
    });
    m.householdFind.mockResolvedValue({
      id: HH_A,
      organizationId: org.id,
      primaryDonorId: null,
      preferredStatementRecipientId: null,
    });
    const saved = await endGivingHouseholdMembership(org.id, {
      membershipId: MEM_A,
      endDate: "2026-10-03",
      expectedUpdatedAt: updatedAt.toISOString(),
      now,
    });
    expect(saved.donorId).toBe(DONOR_A);
    expect(saved.householdIds).toEqual([HH_A]);
    expect(saved.membershipId).toBe(MEM_A);
    expect(m.membershipUpdate.mock.calls[0][0].data.endDate.toISOString()).toBe(
      "2026-10-03T00:00:00.000Z",
    );
    expect(m.membershipUpdate.mock.calls[0][0]).not.toHaveProperty("delete");
  });

  it("does not accept a report viewer mutation", async () => {
    role("REPORT_VIEWER");
    await expect(saveGivingHousehold(org.id, null, householdInput)).rejects.toThrow();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("lets a report viewer search pickers without gaining mutation rights", async () => {
    role("REPORT_VIEWER");
    m.donorList.mockResolvedValue([
      { id: DONOR_26, firstName: "Zeta", lastName: "Young", email: "z@example.com" },
    ]);
    m.donorCount.mockResolvedValue(26);
    const donors = await searchUnassignedGivingDonors(org.id, "Young", 2);
    expect(donors.page).toBe(2);
    expect(m.donorList.mock.calls[0][0].skip).toBe(25);
    expect(m.donorList.mock.calls[0][0].where.organizationId).toBe(org.id);
    expect(m.donorList.mock.calls[0][0].where.active).toBe(true);
    expect(m.donorList.mock.calls[0][0].where.householdMemberships).toEqual({
      none: { organizationId: org.id, endDate: null },
    });
    await expect(saveGivingHousehold(org.id, null, householdInput)).rejects.toThrow();
  });

  it("discovers household 201 through move-target pagination and excludes inactive rows", async () => {
    m.householdList.mockResolvedValue([{ id: HH_B, displayName: "Household 201" }]);
    m.householdCount.mockResolvedValue(201);
    const targets = await searchGivingHouseholdMoveTargets(org.id, HH_A, "201", 9);
    expect(targets.page).toBe(9);
    expect(m.householdList.mock.calls[0][0].skip).toBe(200);
    expect(m.householdList.mock.calls[0][0].where).toMatchObject({
      organizationId: org.id,
      active: true,
      id: { not: HH_A },
    });
  });

  it("never uses a membership id as the donor refresh path", async () => {
    const paths = givingHouseholdRefreshPaths({
      membershipId: MEM_A,
      donorId: DONOR_A,
      householdIds: [HH_A, HH_B],
    });
    expect(paths.donor).toBe(`/donors/${DONOR_A}`);
    expect(paths.donor).not.toContain(MEM_A);
    expect(paths.households).toEqual([
      `/giving-households/${HH_A}`,
      `/giving-households/${HH_B}`,
    ]);
  });
});
