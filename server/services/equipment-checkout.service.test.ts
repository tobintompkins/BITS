import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EQUIPMENT_CHECKOUT_ROW_FIELDS,
  parseEquipmentCheckoutCreate,
} from "@/lib/validation/equipment-checkout";

type ItemRow = {
  id: string;
  organizationId: string;
  name: string;
  quantity: number;
  status: string;
  archivedAt: Date | null;
};

type CheckoutRow = {
  id: string;
  organizationId: string;
  equipmentItemId: string;
  quantity: number;
  checkedOutToName: string;
  purpose: string;
  dueBackAt: Date | null;
  checkedOutAt: Date;
  checkedOutByUserAccountId: string;
  returnedAt: Date | null;
  returnedByUserAccountId: string | null;
  returnNote: string | null;
};

const store = vi.hoisted(() => ({
  items: [] as ItemRow[],
  checkouts: [] as CheckoutRow[],
  lastCreateData: null as Record<string, unknown> | null,
  lastItemUpdate: null as Record<string, unknown> | null,
  lastFindManyWhere: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getEventAccess: vi.fn(),
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

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

function openQuantity(organizationId: string, equipmentItemId: string) {
  return store.checkouts
    .filter(
      (row) =>
        row.organizationId === organizationId &&
        row.equipmentItemId === equipmentItemId &&
        row.returnedAt == null,
    )
    .reduce((sum, row) => sum + row.quantity, 0);
}

const db = vi.hoisted(() => {
  const api = {
    $queryRaw: async () => [{ id: "locked" }],
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(api),
    equipmentItem: {
      findFirst: async ({
        where,
      }: {
        where: {
          id: string;
          organizationId: string;
          archivedAt?: null;
        };
      }) => {
        const row = store.items.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            (where.archivedAt === undefined || item.archivedAt === where.archivedAt),
        );
        return row
          ? {
              id: row.id,
              quantity: row.quantity,
              status: row.status,
              name: row.name,
            }
          : null;
      },
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          archivedAt: null;
          status: { in: string[] };
        };
      }) =>
        store.items.filter(
          (item) =>
            item.organizationId === where.organizationId &&
            item.archivedAt === where.archivedAt &&
            where.status.in.includes(item.status),
        ),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        store.lastItemUpdate = { where, data };
        const row = store.items.find((item) => item.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return { ...row };
      },
    },
    equipmentCheckout: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          returnedAt?: null | { not: null } | { gte: Date };
        };
      }) => {
        store.lastFindManyWhere = where;
        return store.checkouts
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.returnedAt === null && row.returnedAt != null) return false;
            if (
              where.returnedAt &&
              typeof where.returnedAt === "object" &&
              "not" in where.returnedAt &&
              row.returnedAt == null
            ) {
              return false;
            }
            if (
              where.returnedAt &&
              typeof where.returnedAt === "object" &&
              "gte" in where.returnedAt &&
              (!row.returnedAt || row.returnedAt < where.returnedAt.gte)
            ) {
              return false;
            }
            return true;
          })
          .map((row) => ({
            id: row.id,
            quantity: row.quantity,
            checkedOutToName: row.checkedOutToName,
            purpose: row.purpose,
            dueBackAt: row.dueBackAt,
            checkedOutAt: row.checkedOutAt,
            returnedAt: row.returnedAt,
            returnNote: row.returnNote,
            equipmentItemId: row.equipmentItemId,
            equipmentItem: {
              name:
                store.items.find((item) => item.id === row.equipmentItemId)?.name ??
                "Unknown",
            },
          }));
      },
      findFirst: async ({
        where,
      }: {
        where: {
          id: string;
          organizationId: string;
          returnedAt?: null;
        };
      }) => {
        const row = store.checkouts.find((item) => {
          if (item.id !== where.id) return false;
          if (item.organizationId !== where.organizationId) return false;
          if (where.returnedAt === null && item.returnedAt != null) return false;
          return true;
        });
        return row ? { ...row } : null;
      },
      count: async ({
        where,
      }: {
        where: {
          organizationId: string;
          returnedAt?: { gte: Date };
        };
      }) =>
        store.checkouts.filter((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (
            where.returnedAt?.gte &&
            (!row.returnedAt || row.returnedAt < where.returnedAt.gte)
          ) {
            return false;
          }
          return true;
        }).length,
      aggregate: async ({
        where,
      }: {
        where: {
          organizationId: string;
          equipmentItemId: string;
          returnedAt: null;
        };
      }) => ({
        _sum: {
          quantity: openQuantity(where.organizationId, where.equipmentItemId),
        },
      }),
      groupBy: async ({
        where,
      }: {
        where: { organizationId: string; returnedAt: null };
      }) => {
        const sums = new Map<string, number>();
        for (const row of store.checkouts) {
          if (
            row.organizationId === where.organizationId &&
            row.returnedAt == null
          ) {
            sums.set(
              row.equipmentItemId,
              (sums.get(row.equipmentItemId) ?? 0) + row.quantity,
            );
          }
        }
        return [...sums.entries()].map(([equipmentItemId, quantity]) => ({
          equipmentItemId,
          _sum: { quantity },
        }));
      },
      create: async ({
        data,
      }: {
        data: Partial<CheckoutRow> & {
          organizationId: string;
          equipmentItemId: string;
          quantity: number;
        };
      }) => {
        store.lastCreateData = data as Record<string, unknown>;
        const created: CheckoutRow = {
          id: "00000000-0000-4000-8000-00000000b100",
          organizationId: data.organizationId,
          equipmentItemId: data.equipmentItemId,
          quantity: data.quantity,
          checkedOutToName: data.checkedOutToName ?? "",
          purpose: data.purpose ?? "",
          dueBackAt: data.dueBackAt ?? null,
          checkedOutAt: new Date("2026-09-29T16:00:00.000Z"),
          checkedOutByUserAccountId: data.checkedOutByUserAccountId ?? "",
          returnedAt: null,
          returnedByUserAccountId: null,
          returnNote: null,
        };
        store.checkouts.push(created);
        return { id: created.id };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<CheckoutRow>;
      }) => {
        const row = store.checkouts.find((item) => item.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
  return api;
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: db,
}));

import {
  createEquipmentCheckout,
  getEquipmentCheckouts,
  returnEquipmentCheckout,
} from "./equipment-checkout.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const MIC_ID = "00000000-0000-4000-8000-00000000e001";
const CHAIR_ID = "00000000-0000-4000-8000-00000000e002";
const MAINT_ID = "00000000-0000-4000-8000-00000000e003";
const OTHER_MIC_ID = "00000000-0000-4000-8000-00000000e004";
const OPEN_ID = "00000000-0000-4000-8000-00000000b001";
const OVERDUE_ID = "00000000-0000-4000-8000-00000000b002";
const RETURNED_ID = "00000000-0000-4000-8000-00000000b003";
const OTHER_ORG_CHECKOUT = "00000000-0000-4000-8000-00000000b004";

function seed() {
  store.items = [
    {
      id: MIC_ID,
      organizationId: ORG_ID,
      name: "Wireless microphones",
      quantity: 4,
      status: "AVAILABLE",
      archivedAt: null,
    },
    {
      id: CHAIR_ID,
      organizationId: ORG_ID,
      name: "Folding chairs",
      quantity: 12,
      status: "IN_USE",
      archivedAt: null,
    },
    {
      id: MAINT_ID,
      organizationId: ORG_ID,
      name: "Broken projector",
      quantity: 1,
      status: "MAINTENANCE",
      archivedAt: null,
    },
    {
      id: OTHER_MIC_ID,
      organizationId: OTHER_ORG,
      name: "Other church mic",
      quantity: 2,
      status: "AVAILABLE",
      archivedAt: null,
    },
  ];
  store.checkouts = [
    {
      id: OPEN_ID,
      organizationId: ORG_ID,
      equipmentItemId: MIC_ID,
      quantity: 2,
      checkedOutToName: "Worship team",
      purpose: "Sunday morning service",
      dueBackAt: new Date("2026-10-02T00:00:00.000Z"),
      checkedOutAt: new Date("2026-09-28T12:00:00.000Z"),
      checkedOutByUserAccountId: USER_ID,
      returnedAt: null,
      returnedByUserAccountId: null,
      returnNote: null,
    },
    {
      id: OVERDUE_ID,
      organizationId: ORG_ID,
      equipmentItemId: CHAIR_ID,
      quantity: 4,
      checkedOutToName: "Youth ministry",
      purpose: "Friday night gathering",
      dueBackAt: new Date("2026-09-20T00:00:00.000Z"),
      checkedOutAt: new Date("2026-09-10T12:00:00.000Z"),
      checkedOutByUserAccountId: USER_ID,
      returnedAt: null,
      returnedByUserAccountId: null,
      returnNote: null,
    },
    {
      id: RETURNED_ID,
      organizationId: ORG_ID,
      equipmentItemId: CHAIR_ID,
      quantity: 2,
      checkedOutToName: "Facilities",
      purpose: "Fellowship hall setup",
      dueBackAt: new Date("2026-09-12T00:00:00.000Z"),
      checkedOutAt: new Date("2026-09-08T12:00:00.000Z"),
      checkedOutByUserAccountId: USER_ID,
      returnedAt: new Date("2026-09-15T12:00:00.000Z"),
      returnedByUserAccountId: USER_ID,
      returnNote: "Returned to the closet.",
    },
    {
      id: OTHER_ORG_CHECKOUT,
      organizationId: OTHER_ORG,
      equipmentItemId: OTHER_MIC_ID,
      quantity: 1,
      checkedOutToName: "Other church",
      purpose: "Should never appear.",
      dueBackAt: new Date("2026-09-20T00:00:00.000Z"),
      checkedOutAt: new Date("2026-09-19T12:00:00.000Z"),
      checkedOutByUserAccountId: USER_ID,
      returnedAt: null,
      returnedByUserAccountId: null,
      returnNote: null,
    },
  ];
}

// Keep fixture dates stable as the real calendar advances.
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
  store.items = [];
  store.checkouts = [];
  store.lastCreateData = null;
  store.lastItemUpdate = null;
  store.lastFindManyWhere = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getEventAccess.mockReset();
  mocks.createAuditEvent.mockClear();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "leader@church.test",
    displayName: "Leader",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getEventAccess.mockResolvedValue({
    canView: true,
    canManageLocations: true,
  });
  seed();
});

describe("equipment checkout validation", () => {
  it("requires a name, purpose, and positive quantity", () => {
    expect(
      parseEquipmentCheckoutCreate({
        equipmentItemId: MIC_ID,
        quantity: 0,
        checkedOutToName: "A",
        purpose: "Use",
      }).success,
    ).toBe(false);
    expect(
      parseEquipmentCheckoutCreate({
        equipmentItemId: MIC_ID,
        quantity: 2,
        checkedOutToName: "Worship team",
        purpose: "Sunday morning service",
        dueBackAt: "2026-10-05",
      }).success,
    ).toBe(true);
  });
});

describe("equipment checkout access", () => {
  it("returns signed-out, missing organization, and forbidden states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getEquipmentCheckouts()).resolves.toEqual({
      status: "SIGNED_OUT",
    });

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getEquipmentCheckouts()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getEventAccess.mockResolvedValue({
      canView: false,
      canManageLocations: false,
    });
    await expect(getEquipmentCheckouts()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
  });

  it("lets viewers read but not mutate", async () => {
    mocks.getEventAccess.mockResolvedValue({
      canView: true,
      canManageLocations: false,
    });
    const list = await getEquipmentCheckouts();
    expect(list.status).toBe("READY");
    if (list.status === "READY") expect(list.canManage).toBe(false);
    await expect(
      createEquipmentCheckout({
        equipmentItemId: MIC_ID,
        quantity: 1,
        checkedOutToName: "Choir",
        purpose: "Wednesday rehearsal",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
  });
});

describe("equipment checkout scoping and availability", () => {
  it("scopes lists to the current organization and hides emails", async () => {
    const result = await getEquipmentCheckouts();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastFindManyWhere).toMatchObject({ organizationId: ORG_ID });
    expect(JSON.stringify(result)).not.toContain("Other church");
    expect(JSON.stringify(result)).not.toContain("leader@church.test");
    expect(result.counts).toEqual({
      currentlyCheckedOut: 2,
      dueBackSoon: 1,
      overdue: 1,
      returnedThisMonth: 1,
    });
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...EQUIPMENT_CHECKOUT_ROW_FIELDS].sort(),
    );
    const mic = result.equipmentOptions.find((item) => item.id === MIC_ID);
    expect(mic).toMatchObject({
      available: 2,
      label: "Wireless microphones — 2 available",
    });
    expect(result.equipmentOptions.some((item) => item.id === MAINT_ID)).toBe(
      false,
    );
  });

  it("rejects maintenance, retired, other-org, and over-quantity check-outs", async () => {
    await expect(
      createEquipmentCheckout({
        equipmentItemId: MAINT_ID,
        quantity: 1,
        checkedOutToName: "Repair vendor",
        purpose: "Should not leave the shop.",
      }),
    ).resolves.toEqual({ status: "INELIGIBLE" });

    store.items.find((item) => item.id === MAINT_ID)!.status = "RETIRED";
    await expect(
      createEquipmentCheckout({
        equipmentItemId: MAINT_ID,
        quantity: 1,
        checkedOutToName: "Storage",
        purpose: "Retired items stay put.",
      }),
    ).resolves.toEqual({ status: "INELIGIBLE" });

    await expect(
      createEquipmentCheckout({
        equipmentItemId: OTHER_MIC_ID,
        quantity: 1,
        checkedOutToName: "Other church",
        purpose: "Cross-organization checkout.",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    await expect(
      createEquipmentCheckout({
        equipmentItemId: MIC_ID,
        quantity: 3,
        checkedOutToName: "Worship team",
        purpose: "More mics than remain available.",
      }),
    ).resolves.toEqual({ status: "UNAVAILABLE" });
    expect(store.items.find((item) => item.id === MIC_ID)?.quantity).toBe(4);
  });
});

describe("equipment checkout mutations", () => {
  it("creates a check-out without changing saved inventory quantity", async () => {
    const result = await createEquipmentCheckout({
      equipmentItemId: MIC_ID,
      quantity: 2,
      checkedOutToName: "Choir",
      purpose: "Wednesday rehearsal",
      dueBackAt: "2026-10-05",
      organizationId: OTHER_ORG,
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      equipmentItemId: MIC_ID,
      quantity: 2,
      checkedOutByUserAccountId: USER_ID,
    });
    expect(store.lastItemUpdate).toBeNull();
    expect(store.items.find((item) => item.id === MIC_ID)?.quantity).toBe(4);
    const audit = JSON.stringify(mocks.createAuditEvent.mock.calls[0]?.[0]);
    expect(audit).toContain("CHECK_OUT_EQUIPMENT");
    expect(audit).toContain(MIC_ID);
    expect(audit).toContain("CHECKED_OUT");
    expect(audit).not.toContain("Wednesday rehearsal");
  });

  it("returns an open check-out once and keeps history", async () => {
    await expect(
      returnEquipmentCheckout({
        checkoutId: OTHER_ORG_CHECKOUT,
        returnNote: "Should not return another church item.",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    await expect(
      returnEquipmentCheckout({
        checkoutId: OPEN_ID,
        returnNote: "Back in the sound booth.",
      }),
    ).resolves.toEqual({ status: "RETURNED" });
    const returned = store.checkouts.find((row) => row.id === OPEN_ID);
    expect(returned?.returnedAt).toBeInstanceOf(Date);
    expect(returned?.returnNote).toBe("Back in the sound booth.");
    expect(store.checkouts).toHaveLength(4);
    expect(store.items.find((item) => item.id === MIC_ID)?.quantity).toBe(4);

    await expect(
      returnEquipmentCheckout({ checkoutId: OPEN_ID }),
    ).resolves.toEqual({ status: "ALREADY_RETURNED" });

    const history = await getEquipmentCheckouts({ view: "returned" });
    expect(history.status).toBe("READY");
    if (history.status === "READY") {
      expect(history.rows.some((row) => row.id === OPEN_ID)).toBe(true);
      expect(history.rows.some((row) => row.id === RETURNED_ID)).toBe(true);
    }
  });
});
