import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import { GIVING_AUDIT_PAGE_SIZE } from "@/lib/validation/giving-audit-history";

type AuditRecord = {
  id: string;
  organizationId: string;
  entityId: string;
  entityType: string;
  action: string;
  occurredAt: Date;
  changeMetadata: unknown;
  actor: { displayName: string | null } | null;
};

const store = vi.hoisted(() => ({
  records: [] as AuditRecord[],
  calls: 0,
  targetCalls: 0,
  creates: 0,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: vi.fn(),
}));

vi.mock("@/lib/auth/giving-permissions", () => ({
  getGivingAccess: vi.fn(),
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: vi.fn(async () => {
    store.creates += 1;
  }),
  findGivingAuditEvents: vi.fn(async (query: {
    organizationId: string;
    pairs: Array<{ entityType: string; action: string }>;
    from: string | null;
    to: string | null;
    cursor: { occurredAt: Date; id: string } | null;
  }) => {
    store.calls += 1;
    const allowed = new Set(query.pairs.map((pair) => `${pair.entityType}:${pair.action}`));
    return store.records
      .filter((row) => row.organizationId === query.organizationId)
      .filter((row) => allowed.has(`${row.entityType}:${row.action}`))
      .filter((row) => {
        if (!query.cursor) return true;
        const time = row.occurredAt.getTime();
        const cursorTime = query.cursor.occurredAt.getTime();
        return time < cursorTime || (time === cursorTime && row.id < query.cursor.id);
      })
      .sort((left, right) => {
        const time = right.occurredAt.getTime() - left.occurredAt.getTime();
        if (time !== 0) return time;
        return right.id < left.id ? -1 : right.id > left.id ? 1 : 0;
      })
      .slice(0, GIVING_AUDIT_PAGE_SIZE + 1);
  }),
  findGivingAuditTargets: vi.fn(async () => {
    store.targetCalls += 1;
    return {
      donors: ["00000000-0000-4000-8000-00000000d001"],
      households: [],
      offeringTypes: [],
      batches: [],
      donations: [],
      donationBatchesInChurch: [],
      statements: [],
      voidRequests: [],
    };
  }),
}));

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { getGivingAccess } from "@/lib/auth/giving-permissions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";

import { getGivingAuditHistory } from "./giving-audit-history.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const MISSING_DONOR = "00000000-0000-4000-8000-00000000d099";
const getAccount = vi.mocked(getOrCreateUserAccount);
const getOrganization = vi.mocked(findPrimaryOrganization);
const getAccess = vi.mocked(getGivingAccess);

function access(roleCode: RoleCode | null, isSuperAdmin = false) {
  return {
    canViewGiving: false,
    canViewStatements: false,
    canManageStatements: false,
    canViewBatches: false,
    canManageBatches: false,
    canAddBatchDonations: false,
    canCompleteBatchEntry: false,
    canReconcileBatches: false,
    canRecordBatchDeposits: false,
    canLockBatches: false,
    canRequestFinancialCorrections: false,
    canReviewFinancialCorrections: false,
    canExportGiving: false,
    roleCode,
    isSuperAdmin,
  };
}

beforeEach(() => {
  store.records = [];
  store.calls = 0;
  store.targetCalls = 0;
  store.creates = 0;
  getAccount.mockResolvedValue({ id: "user-1" } as Awaited<ReturnType<typeof getOrCreateUserAccount>>);
  getOrganization.mockResolvedValue({ id: ORG_ID } as Awaited<ReturnType<typeof findPrimaryOrganization>>);
  getAccess.mockResolvedValue(access(RoleCode.ORG_ADMIN));
});

describe("giving audit history", () => {
  it("shows an administrator the current church and hides other churches", async () => {
    const occurredAt = new Date("2026-11-05T15:00:00.000Z");
    store.records = [
      {
        id: "00000000-0000-4000-8000-0000000000a2",
        organizationId: ORG_ID,
        entityId: DONOR_ID,
        entityType: "Donor",
        action: "DONOR_PROFILE_UPDATED",
        occurredAt,
        changeMetadata: {
          changes: [{ field: "email", oldValue: "hidden@church.test", newValue: "hidden@church.test" }],
        },
        actor: { displayName: "Ann Admin" },
      },
      {
        id: "00000000-0000-4000-8000-0000000000a1",
        organizationId: OTHER_ORG,
        entityId: DONOR_ID,
        entityType: "Donor",
        action: "DONOR_CREATED",
        occurredAt,
        changeMetadata: { changes: [] },
        actor: { displayName: "Other Church" },
      },
      {
        id: "00000000-0000-4000-8000-0000000000a3",
        organizationId: ORG_ID,
        entityId: "00000000-0000-4000-8000-00000000f001",
        entityType: "LeadershipDocument",
        action: "DOWNLOAD_LEADERSHIP_DOCUMENT",
        occurredAt,
        changeMetadata: { changes: [{ field: "notes", newValue: "secret-document" }] },
        actor: { displayName: "Ann Admin" },
      },
    ];
    const result = await getGivingAuditHistory({});
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.rows.map((row) => row.actionLabel)).toEqual(["Updated a donor"]);
    expect(result.rows[0]?.summary).toBe("Email changed.");
    expect(result.rows[0]?.occurredAtLabel).toContain("UTC");
    expect(result.rows[0]?.summary).not.toContain("hidden@church.test");
    expect(result.rows[0]?.recordHref).toBe(`/donors/${DONOR_ID}`);
    expect(result.rows[0]?.performedBy).toBe("Ann Admin");
    expect(store.creates).toBe(0);
    expect(createAuditEvent).not.toHaveBeenCalled();
  });

  it("lets a treasurer review giving history without opening security activity", async () => {
    getAccess.mockResolvedValue(access(RoleCode.TREASURER));
    store.records = [
      {
        id: "00000000-0000-4000-8000-0000000000b1",
        organizationId: ORG_ID,
        entityId: ORG_ID,
        entityType: "Organization",
        action: "UPDATE",
        occurredAt: new Date("2026-11-05T15:00:00.000Z"),
        changeMetadata: {
          changes: [{ field: "ein", oldValue: "12-3456789", newValue: "98-7654321" }],
        },
        actor: null,
      },
    ];
    const result = await getGivingAuditHistory({});
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.canOpenOrganizationSettings).toBe(false);
    expect(result.rows[0]?.recordHref).toBeNull();
    expect(result.rows[0]?.summary).toBe("Tax identification number changed.");
    expect(result.rows[0]?.summary).not.toContain("12-3456789");
    expect(result.rows[0]?.performedBy).toBe("System or unknown user");
  });

  it.each([RoleCode.DATA_ENTRY, RoleCode.REPORT_VIEWER, RoleCode.DONOR])(
    "denies %s before reading audit rows",
    async (roleCode) => {
      getAccess.mockResolvedValue(access(roleCode));
      await expect(getGivingAuditHistory({ category: "PRIVACY" })).resolves.toEqual({
        status: "UNAUTHORIZED",
      });
      expect(store.calls).toBe(0);
      expect(store.targetCalls).toBe(0);
    },
  );

  it("denies a revoked membership before reading audit rows", async () => {
    getAccess.mockResolvedValue(access(null));
    await expect(getGivingAuditHistory({})).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(store.calls).toBe(0);
  });

  it("rejects a tampered security category before reading rows", async () => {
    await expect(getGivingAuditHistory({ category: "PRIVACY" })).resolves.toEqual({
      status: "INVALID_FILTER",
    });
    expect(store.calls).toBe(0);
    expect(store.targetCalls).toBe(0);
  });

  it("returns the older row when two actions share a timestamp", async () => {
    const occurredAt = new Date("2026-11-05T15:00:00.000Z");
    store.records = Array.from({ length: GIVING_AUDIT_PAGE_SIZE + 1 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
      organizationId: ORG_ID,
      entityId: index === 0 ? MISSING_DONOR : DONOR_ID,
      entityType: "Donor",
      action: "DONOR_CREATED",
      occurredAt,
      changeMetadata: null,
      actor: { displayName: "Ann Admin" },
    }));
    const first = await getGivingAuditHistory({});
    expect(first.status).toBe("READY");
    if (first.status !== "READY") return;
    expect(first.rows).toHaveLength(GIVING_AUDIT_PAGE_SIZE);
    expect(first.hasOlder).toBe(true);
    expect(first.rows[0]?.summary).toBe("No additional details were recorded.");
    expect(first.rows.some((row) => row.recordHref === `/donors/${MISSING_DONOR}`)).toBe(false);
    const second = await getGivingAuditHistory({ cursor: first.olderCursor });
    expect(second.status).toBe("READY");
    if (second.status !== "READY") return;
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0]?.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(second.hasOlder).toBe(false);
  });

  it("does not query when the church is ambiguous", async () => {
    getOrganization.mockResolvedValue(null);
    await expect(getGivingAuditHistory({})).resolves.toEqual({ status: "NO_ORGANIZATION" });
    expect(store.calls).toBe(0);
  });
});
