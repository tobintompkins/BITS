import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PURCHASE_REQUEST_ROW_FIELDS,
  parseEstimatedAmountToCents,
  parsePurchaseCreate,
  parsePurchaseDecision,
} from "@/lib/validation/purchase-request";

type RequestRow = {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  category: string | null;
  estimatedAmountCents: number | null;
  requestedForLocation: string | null;
  equipmentItemId: string | null;
  status: string;
  requestedByUserAccountId: string;
  requestedByName: string | null;
  reviewedByUserAccountId: string | null;
  decisionNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

type EquipmentRow = {
  id: string;
  organizationId: string;
  name: string;
  archivedAt: Date | null;
};

const store = vi.hoisted(() => ({
  requests: [] as RequestRow[],
  equipment: [] as EquipmentRow[],
  lastFindManyWhere: null as unknown,
  lastCreateData: null as Record<string, unknown> | null,
  lastUpdateData: null as Record<string, unknown> | null,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getEventAccess: vi.fn(),
  getGivingAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => input),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/event-permissions", () => ({
  getEventAccess: mocks.getEventAccess,
}));

vi.mock("@/lib/auth/giving-permissions", () => ({
  getGivingAccess: mocks.getGivingAccess,
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

function matchesContains(
  value: string | null,
  filter: { contains: string } | undefined,
) {
  if (!filter) return true;
  if (value == null) return false;
  return value.toLowerCase().includes(filter.contains.toLowerCase());
}

function matchesWhere(
  row: RequestRow,
  where: {
    organizationId: string;
    requestedByUserAccountId?: string;
    status?: string;
    category?: { contains: string };
  },
) {
  if (row.organizationId !== where.organizationId) return false;
  if (
    where.requestedByUserAccountId &&
    row.requestedByUserAccountId !== where.requestedByUserAccountId
  ) {
    return false;
  }
  if (where.status && row.status !== where.status) return false;
  if (where.category && !matchesContains(row.category, where.category)) {
    return false;
  }
  return true;
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    purchaseRequest: {
      findMany: async ({
        where,
      }: {
        where: Parameters<typeof matchesWhere>[1];
      }) => {
        store.lastFindManyWhere = where;
        return store.requests
          .filter((row) => matchesWhere(row, where))
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          )
          .map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            category: row.category,
            estimatedAmountCents: row.estimatedAmountCents,
            requestedForLocation: row.requestedForLocation,
            status: row.status,
            decisionNote: row.decisionNote,
            reviewedAt: row.reviewedAt,
            createdAt: row.createdAt,
            requestedByUserAccountId: row.requestedByUserAccountId,
            requestedBy: { displayName: row.requestedByName },
            equipmentItem: store.equipment.find(
              (item) => item.id === row.equipmentItemId,
            )
              ? {
                  name: store.equipment.find(
                    (item) => item.id === row.equipmentItemId,
                  )!.name,
                }
              : null,
          }));
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        const row = store.requests.find(
          (item) =>
            item.id === where.id && item.organizationId === where.organizationId,
        );
        return row
          ? {
              id: row.id,
              status: row.status,
              requestedByUserAccountId: row.requestedByUserAccountId,
              estimatedAmountCents: row.estimatedAmountCents,
            }
          : null;
      },
      create: async ({
        data,
      }: {
        data: Partial<RequestRow> & {
          organizationId: string;
          title: string;
          requestedByUserAccountId: string;
        };
      }) => {
        store.lastCreateData = data as Record<string, unknown>;
        const created: RequestRow = {
          id: "00000000-0000-4000-8000-00000000b100",
          organizationId: data.organizationId,
          title: data.title,
          description: data.description ?? "",
          category: data.category ?? null,
          estimatedAmountCents: data.estimatedAmountCents ?? null,
          requestedForLocation: data.requestedForLocation ?? null,
          equipmentItemId: data.equipmentItemId ?? null,
          status: data.status ?? "PENDING",
          requestedByUserAccountId: data.requestedByUserAccountId,
          requestedByName: "Pat Staff",
          reviewedByUserAccountId: null,
          decisionNote: null,
          reviewedAt: null,
          createdAt: new Date("2026-09-29T15:00:00.000Z"),
        };
        store.requests.push(created);
        return {
          id: created.id,
          estimatedAmountCents: created.estimatedAmountCents,
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<RequestRow>;
      }) => {
        store.lastUpdateData = data as Record<string, unknown>;
        const row = store.requests.find((item) => item.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return { ...row };
      },
    },
    equipmentItem: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        const row = store.equipment.find(
          (item) =>
            item.id === where.id && item.organizationId === where.organizationId,
        );
        return row ? { id: row.id } : null;
      },
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; archivedAt: null };
      }) =>
        store.equipment
          .filter(
            (item) =>
              item.organizationId === where.organizationId &&
              item.archivedAt === where.archivedAt,
          )
          .map((item) => ({ id: item.id, name: item.name })),
    },
  },
}));

import {
  cancelPurchaseRequest,
  createPurchaseRequest,
  decidePurchaseRequest,
  getPurchaseRequests,
} from "./purchase-request.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const STAFF_ID = "00000000-0000-4000-8000-00000000c001";
const REVIEWER_ID = "00000000-0000-4000-8000-00000000c002";
const OTHER_STAFF_ID = "00000000-0000-4000-8000-00000000c003";
const MIC_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_MIC_ID = "00000000-0000-4000-8000-00000000e002";
const OWN_PENDING_ID = "00000000-0000-4000-8000-00000000b001";
const OTHER_PENDING_ID = "00000000-0000-4000-8000-00000000b002";
const APPROVED_ID = "00000000-0000-4000-8000-00000000b003";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000b004";

function seed() {
  store.equipment = [
    {
      id: MIC_ID,
      organizationId: ORG_ID,
      name: "Wireless microphones",
      archivedAt: null,
    },
    {
      id: OTHER_MIC_ID,
      organizationId: OTHER_ORG,
      name: "Other church mic",
      archivedAt: null,
    },
  ];
  store.requests = [
    {
      id: OWN_PENDING_ID,
      organizationId: ORG_ID,
      title: "Replacement microphone",
      description: "Need a backup wireless microphone for worship.",
      category: "Audio",
      estimatedAmountCents: 12500,
      requestedForLocation: "Main Sanctuary",
      equipmentItemId: MIC_ID,
      status: "PENDING",
      requestedByUserAccountId: STAFF_ID,
      requestedByName: "Pat Staff",
      reviewedByUserAccountId: null,
      decisionNote: null,
      reviewedAt: null,
      createdAt: new Date("2026-09-28T12:00:00.000Z"),
    },
    {
      id: OTHER_PENDING_ID,
      organizationId: ORG_ID,
      title: "Kitchen mixer",
      description: "Fellowship hall mixer needs replacement.",
      category: "Kitchen",
      estimatedAmountCents: 8900,
      requestedForLocation: "Kitchen",
      equipmentItemId: null,
      status: "PENDING",
      requestedByUserAccountId: OTHER_STAFF_ID,
      requestedByName: "Jordan Volunteer",
      reviewedByUserAccountId: null,
      decisionNote: null,
      reviewedAt: null,
      createdAt: new Date("2026-09-27T12:00:00.000Z"),
    },
    {
      id: APPROVED_ID,
      organizationId: ORG_ID,
      title: "Folding chairs",
      description: "Replace worn folding chairs in the hall.",
      category: "Furniture",
      estimatedAmountCents: 24000,
      requestedForLocation: "Fellowship Hall",
      equipmentItemId: null,
      status: "APPROVED",
      requestedByUserAccountId: OTHER_STAFF_ID,
      requestedByName: "Jordan Volunteer",
      reviewedByUserAccountId: REVIEWER_ID,
      decisionNote: "Approved to proceed with the quoted set.",
      reviewedAt: new Date("2026-09-20T12:00:00.000Z"),
      createdAt: new Date("2026-09-19T12:00:00.000Z"),
    },
    {
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      title: "Other church copier",
      description: "Should never appear in this church list.",
      category: "Office",
      estimatedAmountCents: 50000,
      requestedForLocation: "Office",
      equipmentItemId: OTHER_MIC_ID,
      status: "PENDING",
      requestedByUserAccountId: STAFF_ID,
      requestedByName: "Pat Staff",
      reviewedByUserAccountId: null,
      decisionNote: null,
      reviewedAt: null,
      createdAt: new Date("2026-09-29T11:00:00.000Z"),
    },
  ];
}

function asSubmitter() {
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: STAFF_ID,
    primaryEmail: "staff@church.test",
    displayName: "Pat Staff",
  });
  mocks.getEventAccess.mockResolvedValue({ canView: true });
  mocks.getGivingAccess.mockResolvedValue({
    canReviewFinancialCorrections: false,
  });
}

function asReviewer(userId = REVIEWER_ID) {
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: userId,
    primaryEmail: "treasurer@church.test",
    displayName: "Taylor Treasurer",
  });
  mocks.getEventAccess.mockResolvedValue({ canView: true });
  mocks.getGivingAccess.mockResolvedValue({
    canReviewFinancialCorrections: true,
  });
}

beforeEach(() => {
  store.requests = [];
  store.equipment = [];
  store.lastFindManyWhere = null;
  store.lastCreateData = null;
  store.lastUpdateData = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getEventAccess.mockReset();
  mocks.getGivingAccess.mockReset();
  mocks.createAuditEvent.mockClear();
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  asSubmitter();
  seed();
});

describe("purchase request validation", () => {
  it("converts dollar estimates to integer cents and rejects unsafe amounts", () => {
    expect(parseEstimatedAmountToCents("12.50")).toEqual({
      ok: true,
      cents: 1250,
    });
    expect(parseEstimatedAmountToCents("$1,250.00")).toEqual({
      ok: true,
      cents: 125000,
    });
    expect(parseEstimatedAmountToCents("")).toEqual({ ok: true, cents: null });
    expect(parseEstimatedAmountToCents("-12.50").ok).toBe(false);
    expect(parseEstimatedAmountToCents("12.555").ok).toBe(false);
    expect(parseEstimatedAmountToCents("USD 12").ok).toBe(false);
    expect(
      parsePurchaseCreate({
        title: "New mic",
        description: "Backup microphone for Sunday worship.",
        estimatedAmount: "89.99",
      }).success,
    ).toBe(true);
    expect(
      parsePurchaseCreate({
        title: "Hi",
        description: "Too short",
        estimatedAmount: "12.555",
      }).success,
    ).toBe(false);
    expect(
      parsePurchaseDecision({
        requestId: OTHER_PENDING_ID,
        decision: "APPROVED",
      }).success,
    ).toBe(false);
  });
});

describe("purchase request access", () => {
  it("returns signed-out, missing organization, and forbidden states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getPurchaseRequests()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastFindManyWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getPurchaseRequests()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getEventAccess.mockResolvedValueOnce({ canView: false });
    mocks.getGivingAccess.mockResolvedValueOnce({
      canReviewFinancialCorrections: false,
    });
    await expect(getPurchaseRequests()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
  });

  it("lets submitters see only their own requests and refuse review actions", async () => {
    const list = await getPurchaseRequests();
    expect(list.status).toBe("READY");
    if (list.status !== "READY") return;
    expect(list.canReview).toBe(false);
    expect(store.lastFindManyWhere).toMatchObject({
      organizationId: ORG_ID,
      requestedByUserAccountId: STAFF_ID,
    });
    expect(list.rows.map((row) => row.id)).toEqual([OWN_PENDING_ID]);
    expect(JSON.stringify(list)).not.toContain("Kitchen mixer");
    expect(JSON.stringify(list)).not.toContain("staff@church.test");
    expect(Object.keys(list.rows[0]!).sort()).toEqual(
      [...PURCHASE_REQUEST_ROW_FIELDS].sort(),
    );

    await expect(
      decidePurchaseRequest({
        requestId: OTHER_PENDING_ID,
        decision: "APPROVED",
        decisionNote: "Looks reasonable for the kitchen.",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
  });

  it("lets financial reviewers see the organization queue", async () => {
    asReviewer();
    const list = await getPurchaseRequests();
    expect(list.status).toBe("READY");
    if (list.status !== "READY") return;
    expect(list.canReview).toBe(true);
    expect(store.lastFindManyWhere).toMatchObject({ organizationId: ORG_ID });
    expect(
      (store.lastFindManyWhere as { requestedByUserAccountId?: string })
        .requestedByUserAccountId,
    ).toBeUndefined();
    expect(list.rows.some((row) => row.id === OTHER_PENDING_ID)).toBe(true);
    expect(JSON.stringify(list)).not.toContain("Other church copier");
    expect(JSON.stringify(list)).not.toContain("treasurer@church.test");
  });
});

describe("purchase request scoping", () => {
  it("rejects other-organization equipment and records", async () => {
    await expect(
      createPurchaseRequest({
        title: "Other church mic",
        description: "This equipment belongs to another church.",
        equipmentItemId: OTHER_MIC_ID,
        estimatedAmount: "25.00",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    asReviewer();
    await expect(
      decidePurchaseRequest({
        requestId: OTHER_ORG_ID,
        decision: "APPROVED",
        decisionNote: "Should not approve another church request.",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
  });

  it("filters the reviewer queue by status and category", async () => {
    asReviewer();
    const pending = await getPurchaseRequests({ status: "PENDING" });
    expect(pending.status).toBe("READY");
    if (pending.status === "READY") {
      expect(pending.rows.every((row) => row.status === "PENDING")).toBe(true);
    }
    const kitchen = await getPurchaseRequests({ category: "Kitchen" });
    expect(kitchen.status).toBe("READY");
    if (kitchen.status === "READY") {
      expect(kitchen.rows.map((row) => row.id)).toEqual([OTHER_PENDING_ID]);
    }
  });
});

describe("purchase request mutations", () => {
  it("creates a pending request with integer cents and a small audit summary", async () => {
    const result = await createPurchaseRequest({
      title: "Projector lamp",
      description: "Replacement lamp for the sanctuary projector.",
      category: "Audio",
      estimatedAmount: "89.99",
      requestedForLocation: "Main Sanctuary",
      equipmentItemId: MIC_ID,
      organizationId: OTHER_ORG,
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      estimatedAmountCents: 8999,
      status: "PENDING",
      requestedByUserAccountId: STAFF_ID,
      equipmentItemId: MIC_ID,
    });
    const audit = JSON.stringify(mocks.createAuditEvent.mock.calls[0]?.[0]);
    expect(audit).toContain("CREATE_PURCHASE_REQUEST");
    expect(audit).toContain("8999");
    expect(audit).toContain("PENDING");
    expect(audit).not.toContain("Replacement lamp for the sanctuary projector.");
  });

  it("lets a requester cancel only their own pending request", async () => {
    await expect(
      cancelPurchaseRequest({
        requestId: OTHER_PENDING_ID,
        decisionNote: "Not mine to cancel.",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });

    await expect(
      cancelPurchaseRequest({
        requestId: OWN_PENDING_ID,
        decisionNote: "Found one to borrow instead.",
      }),
    ).resolves.toEqual({ status: "CANCELLED" });
    const cancelled = store.requests.find((row) => row.id === OWN_PENDING_ID);
    expect(cancelled?.status).toBe("CANCELLED");
    expect(cancelled?.decisionNote).toBe("Found one to borrow instead.");
    expect(store.requests).toHaveLength(4);
  });

  it("blocks self-approval and non-pending decisions", async () => {
    asReviewer(STAFF_ID);
    await expect(
      decidePurchaseRequest({
        requestId: OWN_PENDING_ID,
        decision: "APPROVED",
        decisionNote: "I should not approve my own request.",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });

    asReviewer();
    await expect(
      decidePurchaseRequest({
        requestId: APPROVED_ID,
        decision: "DECLINED",
        decisionNote: "Already decided earlier this month.",
      }),
    ).resolves.toEqual({ status: "NOT_PENDING" });

    await expect(
      decidePurchaseRequest({
        requestId: OTHER_PENDING_ID,
        decision: "APPROVED",
        decisionNote: "Approved to proceed with the kitchen mixer.",
      }),
    ).resolves.toEqual({ status: "DECIDED" });
    const decided = store.requests.find((row) => row.id === OTHER_PENDING_ID);
    expect(decided?.status).toBe("APPROVED");
    const audit = JSON.stringify(mocks.createAuditEvent.mock.calls.at(-1)?.[0]);
    expect(audit).toContain("APPROVE_PURCHASE_REQUEST");
    expect(audit).toContain("8900");
    expect(audit).not.toContain("Fellowship hall mixer needs replacement.");
  });
});
