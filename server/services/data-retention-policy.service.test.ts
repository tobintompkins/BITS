import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  dataRetentionPolicyNavItems,
  parseDataRetentionPolicyCreate,
} from "@/lib/validation/data-retention-policy";
import * as policyService from "./data-retention-policy.service";

type PolicyRow = {
  id: string;
  organizationId: string;
  category: string;
  title: string;
  retentionPeriodMonths: number | null;
  policySummary: string;
  reviewDueAt: Date | null;
  isActive: boolean;
  createdByUserAccountId: string;
  updatedByUserAccountId: string;
  createdAt: Date;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  policies: [] as PolicyRow[],
  lastFindManyWhere: null as unknown,
  lastFindFirstWhere: null as unknown,
  lastCreateData: null as Record<string, unknown> | null,
  lastUpdateWhere: null as unknown,
  lastUpdateData: null as Record<string, unknown> | null,
  deleteCalls: 0,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getOrganizationAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => input),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/permissions", () => ({
  getOrganizationAccess: mocks.getOrganizationAccess,
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    dataRetentionPolicy: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string };
      }) => {
        store.lastFindManyWhere = where;
        return store.policies
          .filter((row) => row.organizationId === where.organizationId)
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
      },
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          id?: string;
          category?: string;
        };
      }) => {
        store.lastFindFirstWhere = where;
        return (
          store.policies.find((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.id && row.id !== where.id) return false;
            if (where.category && row.category !== where.category) return false;
            return true;
          }) ?? null
        );
      },
      create: async ({
        data,
      }: {
        data: Omit<PolicyRow, "id" | "createdAt" | "updatedAt"> & {
          id?: string;
        };
      }) => {
        if (
          store.policies.some(
            (row) =>
              row.organizationId === data.organizationId &&
              row.category === data.category,
          )
        ) {
          throw { code: "P2002" };
        }
        const now = new Date("2026-09-30T12:00:00.000Z");
        const created: PolicyRow = {
          id: "00000000-0000-4000-8000-00000000e010",
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        store.lastCreateData = created;
        store.policies.push(created);
        return created;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<PolicyRow>;
      }) => {
        store.lastUpdateWhere = where;
        store.lastUpdateData = data;
        const index = store.policies.findIndex((row) => row.id === where.id);
        if (index < 0) throw new Error("missing");
        store.policies[index] = {
          ...store.policies[index],
          ...data,
          updatedAt: new Date("2026-09-30T15:00:00.000Z"),
        };
        return store.policies[index];
      },
      delete: async () => {
        store.deleteCalls += 1;
        throw new Error("delete is not allowed");
      },
      deleteMany: async () => {
        store.deleteCalls += 1;
        throw new Error("deleteMany is not allowed");
      },
    },
  },
}));

import {
  createDataRetentionPolicy,
  deactivateDataRetentionPolicy,
  getDataRetentionPolicies,
  reactivateDataRetentionPolicy,
  updateDataRetentionPolicy,
} from "./data-retention-policy.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const POLICY_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_POLICY_ID = "00000000-0000-4000-8000-00000000e002";

function adminAccess(overrides?: {
  canEdit?: boolean;
  isSuperAdmin?: boolean;
  roleCode?: RoleCode | null;
}) {
  return {
    canEdit: overrides?.canEdit ?? true,
    isReadOnly: !(overrides?.canEdit ?? true),
    roleCode: overrides?.roleCode ?? RoleCode.ORG_ADMIN,
    isSuperAdmin: overrides?.isSuperAdmin ?? false,
  };
}

function policy(overrides: Partial<PolicyRow> = {}): PolicyRow {
  return {
    id: POLICY_ID,
    organizationId: ORG_ID,
    category: "MEMBER_RECORDS",
    title: "Keep active member records",
    retentionPeriodMonths: 84,
    policySummary:
      "Keep current membership records while the person remains connected to the church.",
    reviewDueAt: new Date("2026-10-15T00:00:00.000Z"),
    isActive: true,
    createdByUserAccountId: USER_ID,
    updatedByUserAccountId: USER_ID,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  store.policies = [];
  store.lastFindManyWhere = null;
  store.lastFindFirstWhere = null;
  store.lastCreateData = null;
  store.lastUpdateWhere = null;
  store.lastUpdateData = null;
  store.deleteCalls = 0;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getOrganizationAccess.mockReset();
  mocks.createAuditEvent.mockClear();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "ann@church.test",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getOrganizationAccess.mockResolvedValue(adminAccess());
});

describe("data retention policy navigation", () => {
  it("shows Data Retention Policies only for permitted administrators", () => {
    expect(dataRetentionPolicyNavItems(false)).toEqual([]);
    expect(dataRetentionPolicyNavItems(true)).toEqual([
      {
        href: "/administration/data-retention",
        label: "Data Retention Policies",
      },
    ]);
  });
});

describe("data retention policy access and scope", () => {
  it("denies signed-out users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getDataRetentionPolicies()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastFindManyWhere).toBeNull();
  });

  it.each([
    RoleCode.TREASURER,
    RoleCode.DATA_ENTRY,
    RoleCode.REPORT_VIEWER,
    RoleCode.DONOR,
  ])("denies non-admin role %s", async (roleCode) => {
    mocks.getOrganizationAccess.mockResolvedValue(
      adminAccess({ canEdit: false, roleCode, isSuperAdmin: false }),
    );
    await expect(
      createDataRetentionPolicy({
        category: "MEMBER_RECORDS",
        title: "Keep member records",
        policySummary: "Review membership files with church leadership annually.",
        retentionPeriodMonths: "24",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(store.lastCreateData).toBeNull();
  });

  it("lets organization administrators and super administrators list current-organization policies", async () => {
    store.policies = [
      policy(),
      policy({
        id: OTHER_POLICY_ID,
        organizationId: OTHER_ORG,
        category: "AUDIT_HISTORY",
        title: "Other church policy",
      }),
    ];
    const result = await getDataRetentionPolicies();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastFindManyWhere).toEqual({ organizationId: ORG_ID });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.title).toBe("Keep active member records");

    mocks.getOrganizationAccess.mockResolvedValue(
      adminAccess({ canEdit: true, isSuperAdmin: true }),
    );
    await expect(getDataRetentionPolicies()).resolves.toMatchObject({
      status: "READY",
    });
  });
});

describe("data retention policy mutations", () => {
  it("validates title, summary, months, and unique category", async () => {
    expect(
      parseDataRetentionPolicyCreate({
        category: "MEMBER_RECORDS",
        title: "ab",
        policySummary: "Too short",
      }).success,
    ).toBe(false);
    expect(
      parseDataRetentionPolicyCreate({
        category: "MEMBER_RECORDS",
        title: "Keep member records",
        policySummary: "Review membership files with church leadership annually.",
        retentionPeriodMonths: "0",
      }).success,
    ).toBe(false);
    expect(
      parseDataRetentionPolicyCreate({
        category: "MEMBER_RECORDS",
        title: "Keep member records",
        policySummary: "Review membership files with church leadership annually.",
        retentionPeriodMonths: "12.5",
      }).success,
    ).toBe(false);

    store.policies = [policy()];
    await expect(
      createDataRetentionPolicy({
        category: "MEMBER_RECORDS",
        title: "Second member policy",
        policySummary: "Another summary for the same category should not save.",
        retentionPeriodMonths: "12",
      }),
    ).resolves.toEqual({ status: "DUPLICATE_CATEGORY" });
  });

  it("creates, updates, deactivates, and reactivates without deleting", async () => {
    const created = await createDataRetentionPolicy({
      category: "PRIVACY_REQUESTS",
      title: "Privacy request files",
      policySummary: "Keep privacy request decisions for the approved period.",
      retentionPeriodMonths: "36",
      reviewDueAt: "2027-01-15",
    });
    expect(created).toEqual({ status: "CREATED" });
    expect(store.policies).toHaveLength(1);
    expect(store.policies[0]?.isActive).toBe(true);

    const updated = await updateDataRetentionPolicy({
      policyId: store.policies[0]?.id,
      title: "Privacy request files",
      policySummary: "Keep privacy request decisions for the approved period.",
      retentionPeriodMonths: "",
      reviewDueAt: "2027-06-01",
    });
    expect(updated).toEqual({ status: "UPDATED" });
    expect(store.lastUpdateData).toMatchObject({
      retentionPeriodMonths: null,
    });

    const deactivated = await deactivateDataRetentionPolicy({
      policyId: store.policies[0]?.id,
    });
    expect(deactivated).toEqual({ status: "DEACTIVATED" });
    expect(store.policies[0]?.isActive).toBe(false);
    expect(store.lastUpdateData).toMatchObject({ isActive: false });

    const reactivated = await reactivateDataRetentionPolicy({
      policyId: store.policies[0]?.id,
    });
    expect(reactivated).toEqual({ status: "REACTIVATED" });
    expect(store.policies[0]?.isActive).toBe(true);
    expect(store.deleteCalls).toBe(0);
  });

  it("does not update or read another organization's policies", async () => {
    store.policies = [
      policy({
        id: OTHER_POLICY_ID,
        organizationId: OTHER_ORG,
        category: "AUDIT_HISTORY",
        title: "Other church policy",
        policySummary: "This belongs to another organization and must stay hidden.",
      }),
    ];
    await expect(
      updateDataRetentionPolicy({
        policyId: OTHER_POLICY_ID,
        organizationId: OTHER_ORG,
        title: "Hijacked policy",
        policySummary: "Attempted cross-organization update should fail.",
        retentionPeriodMonths: "12",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.policies[0]?.title).toBe("Other church policy");
  });

  it("counts active, review-due, and no-fixed-period policies", async () => {
    store.policies = [
      policy({
        reviewDueAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
      policy({
        id: "00000000-0000-4000-8000-00000000e003",
        category: "GIVING_AND_STATEMENTS",
        title: "Giving records",
        retentionPeriodMonths: null,
        reviewDueAt: new Date("2027-01-01T00:00:00.000Z"),
      }),
      policy({
        id: "00000000-0000-4000-8000-00000000e004",
        category: "AUDIT_HISTORY",
        title: "Inactive audit policy",
        isActive: false,
        retentionPeriodMonths: null,
        reviewDueAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ];
    const result = await getDataRetentionPolicies();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.counts).toEqual({
      activePolicies: 2,
      reviewDue: 1,
      noFixedPeriod: 1,
    });
    expect(result.rows.find((row) => row.category === "MEMBER_RECORDS")?.reviewDue).toBe(
      true,
    );
  });

  it("writes safe audit summaries without policy text", async () => {
    await createDataRetentionPolicy({
      category: "LEADERSHIP_DOCUMENTS",
      title: "Board minutes guidance",
      policySummary:
        "Keep approved board minutes according to the church’s legal review.",
      retentionPeriodMonths: "120",
    });
    const audit = JSON.stringify(mocks.createAuditEvent.mock.calls[0]?.[0]);
    expect(mocks.createAuditEvent.mock.calls[0]?.[0]).toMatchObject({
      action: "CREATE_DATA_RETENTION_POLICY",
      entityType: "DataRetentionPolicy",
      organizationId: ORG_ID,
    });
    expect(audit).toContain("LEADERSHIP_DOCUMENTS");
    expect(audit).toContain("ACTIVE");
    expect(audit).toContain("120");
    expect(audit).not.toContain("Board minutes guidance");
    expect(audit).not.toContain("legal review");
    expect(audit).not.toContain("ann@church.test");
  });

  it("does not expose deletion or purge behavior", () => {
    expect("deleteDataRetentionPolicy" in policyService).toBe(false);
    expect("purgeDataRetentionPolicy" in policyService).toBe(false);
    expect("anonymizeDataRetentionPolicy" in policyService).toBe(false);
    expect(typeof policyService.deactivateDataRetentionPolicy).toBe("function");
    expect(typeof policyService.reactivateDataRetentionPolicy).toBe("function");
  });
});
