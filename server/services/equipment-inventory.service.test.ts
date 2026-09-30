import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EQUIPMENT_INVENTORY_ROW_FIELDS,
  parseEquipmentCreate,
} from "@/lib/validation/equipment-inventory";

type EquipmentRow = {
  id: string;
  organizationId: string;
  name: string;
  category: string | null;
  assetTag: string | null;
  quantity: number;
  storageLocation: string | null;
  status: string;
  condition: string;
  notes: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  items: [] as EquipmentRow[],
  lastFindManyWhere: null as unknown,
  lastCreateData: null as Record<string, unknown> | null,
  lastUpdateWhere: null as unknown,
  lastUpdateData: null as Record<string, unknown> | null,
  lastFindFirstWhere: null as unknown,
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

function matchesContains(
  value: string | null,
  filter: { contains: string; mode?: string } | undefined,
) {
  if (!filter) return true;
  if (value == null) return false;
  return value.toLowerCase().includes(filter.contains.toLowerCase());
}

function matchesArchived(
  archivedAt: Date | null,
  filter: null | { not: null } | undefined,
) {
  if (filter === undefined) return true;
  if (filter === null) return archivedAt == null;
  return archivedAt != null;
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    equipmentItem: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          archivedAt?: null | { not: null };
          status?: string;
          name?: { contains: string };
          category?: { contains: string };
          storageLocation?: { contains: string };
        };
      }) => {
        store.lastFindManyWhere = where;
        return store.items
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              matchesArchived(row.archivedAt, where.archivedAt) &&
              (!where.status || row.status === where.status) &&
              matchesContains(row.name, where.name) &&
              matchesContains(row.category, where.category) &&
              matchesContains(row.storageLocation, where.storageLocation),
          )
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((row) => ({ ...row }));
      },
      count: async ({
        where,
      }: {
        where: {
          organizationId: string;
          archivedAt?: null | { not: null };
          status?: string;
        };
      }) =>
        store.items.filter(
          (row) =>
            row.organizationId === where.organizationId &&
            matchesArchived(row.archivedAt, where.archivedAt) &&
            (!where.status || row.status === where.status),
        ).length,
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          organizationId: string;
          assetTag?: string;
          archivedAt?: null | { not: null };
        };
      }) => {
        store.lastFindFirstWhere = where;
        const row = store.items.find((item) => {
          const idFilter = where.id as string | { not: string } | undefined;
          const idOk =
            !idFilter ||
            (typeof idFilter === "string"
              ? item.id === idFilter
              : item.id !== idFilter.not);
          return (
            item.organizationId === where.organizationId &&
            idOk &&
            (!where.assetTag || item.assetTag === where.assetTag) &&
            matchesArchived(item.archivedAt, where.archivedAt)
          );
        });
        return row ? { ...row } : null;
      },
      create: async ({
        data,
      }: {
        data: Omit<EquipmentRow, "id" | "updatedAt" | "archivedAt"> & {
          archivedAt?: Date | null;
        };
      }) => {
        store.lastCreateData = data as Record<string, unknown>;
        const created: EquipmentRow = {
          id: "00000000-0000-4000-8000-00000000e100",
          archivedAt: null,
          updatedAt: new Date("2026-09-29T12:00:00.000Z"),
          ...data,
          notes: data.notes ?? null,
        };
        store.items.push(created);
        return { id: created.id };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<EquipmentRow>;
      }) => {
        store.lastUpdateWhere = where;
        store.lastUpdateData = data as Record<string, unknown>;
        const row = store.items.find((item) => item.id === where.id);
        if (!row) return null;
        Object.assign(row, data, {
          updatedAt: new Date("2026-09-29T13:00:00.000Z"),
        });
        return { ...row };
      },
    },
  },
}));

import {
  archiveEquipmentItem,
  createEquipmentItem,
  getEquipmentInventory,
  restoreEquipmentItem,
  updateEquipmentItem,
} from "./equipment-inventory.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const MIC_ID = "00000000-0000-4000-8000-00000000e001";
const PROJECTOR_ID = "00000000-0000-4000-8000-00000000e002";
const MIXER_ID = "00000000-0000-4000-8000-00000000e003";
const CHAIRS_ID = "00000000-0000-4000-8000-00000000e004";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000e005";

function seed() {
  store.items = [
    {
      id: MIC_ID,
      organizationId: ORG_ID,
      name: "Wireless microphones",
      category: "Audio",
      assetTag: "AUD-101",
      quantity: 4,
      storageLocation: "Sound booth",
      status: "AVAILABLE",
      condition: "GOOD",
      notes: "staff-only serial note",
      archivedAt: null,
      updatedAt: new Date("2026-09-20T12:00:00.000Z"),
    },
    {
      id: PROJECTOR_ID,
      organizationId: ORG_ID,
      name: "Sanctuary projector",
      category: "Video",
      assetTag: "VID-200",
      quantity: 1,
      storageLocation: "Sanctuary booth",
      status: "IN_USE",
      condition: "NEEDS_SERVICE",
      notes: null,
      archivedAt: null,
      updatedAt: new Date("2026-09-21T12:00:00.000Z"),
    },
    {
      id: MIXER_ID,
      organizationId: ORG_ID,
      name: "Mixing board",
      category: "Audio",
      assetTag: null,
      quantity: 1,
      storageLocation: "Sound booth",
      status: "MAINTENANCE",
      condition: "OUT_OF_SERVICE",
      notes: null,
      archivedAt: null,
      updatedAt: new Date("2026-09-22T12:00:00.000Z"),
    },
    {
      id: CHAIRS_ID,
      organizationId: ORG_ID,
      name: "Folding chairs",
      category: "Furniture",
      assetTag: "FUR-009",
      quantity: 40,
      storageLocation: "Fellowship closet",
      status: "RETIRED",
      condition: "FAIR",
      notes: "replaced 2024",
      archivedAt: new Date("2026-08-01T12:00:00.000Z"),
      updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    },
    {
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      name: "Other church van",
      category: "Vehicles",
      assetTag: "VAN-1",
      quantity: 1,
      storageLocation: "Other lot",
      status: "AVAILABLE",
      condition: "EXCELLENT",
      notes: "other church note",
      archivedAt: null,
      updatedAt: new Date("2026-09-23T12:00:00.000Z"),
    },
  ];
}

beforeEach(() => {
  store.items = [];
  store.lastFindManyWhere = null;
  store.lastCreateData = null;
  store.lastUpdateWhere = null;
  store.lastUpdateData = null;
  store.lastFindFirstWhere = null;
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

describe("equipment inventory validation", () => {
  it("rejects invalid quantity, status, and condition", () => {
    expect(parseEquipmentCreate({ name: "Mic", quantity: 0 }).success).toBe(
      false,
    );
    expect(parseEquipmentCreate({ name: "Mic", quantity: 1.5 }).success).toBe(
      false,
    );
    expect(
      parseEquipmentCreate({ name: "Mic", status: "LOST" }).success,
    ).toBe(false);
    expect(
      parseEquipmentCreate({ name: "Mic", condition: "BROKEN" }).success,
    ).toBe(false);
    expect(parseEquipmentCreate({ name: "Mic", quantity: 2 }).success).toBe(
      true,
    );
  });
});

describe("equipment inventory access", () => {
  it("returns signed-out, no-organization, and forbidden states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getEquipmentInventory()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastFindManyWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getEquipmentInventory()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getEventAccess.mockResolvedValueOnce({
      canView: false,
      canManageLocations: false,
    });
    await expect(getEquipmentInventory()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    expect(store.lastFindManyWhere).toBeNull();
  });

  it("lets event viewers read but not manage", async () => {
    mocks.getEventAccess.mockResolvedValue({
      canView: true,
      canManageLocations: false,
    });
    const list = await getEquipmentInventory();
    expect(list.status).toBe("READY");
    if (list.status !== "READY") return;
    expect(list.canManage).toBe(false);
    expect(list.rows[0]?.notes).toBeNull();
    await expect(
      createEquipmentItem({ name: "Cable", quantity: 1 }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
  });
});

describe("equipment inventory scoping and filters", () => {
  it("queries only the current organization and hides other-church records", async () => {
    const result = await getEquipmentInventory();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastFindManyWhere).toMatchObject({
      organizationId: ORG_ID,
      archivedAt: null,
    });
    expect(JSON.stringify(store.lastFindManyWhere)).not.toContain(OTHER_ORG);
    expect(result.rows.map((row) => row.name)).toEqual([
      "Mixing board",
      "Sanctuary projector",
      "Wireless microphones",
    ]);
    expect(result.rows.map((row) => row.name).join(" ")).not.toContain(
      "Other church van",
    );
    expect(result.counts).toEqual({
      available: 1,
      inUse: 1,
      maintenance: 1,
      retired: 1,
    });
  });

  it("filters by name, category, status, storage, and archived records", async () => {
    const byName = await getEquipmentInventory({ q: "mic" });
    expect(byName.status).toBe("READY");
    if (byName.status === "READY") {
      expect(byName.rows.map((row) => row.name)).toEqual([
        "Wireless microphones",
      ]);
    }

    const byStatus = await getEquipmentInventory({ status: "IN_USE" });
    expect(byStatus.status).toBe("READY");
    if (byStatus.status === "READY") {
      expect(byStatus.rows.map((row) => row.id)).toEqual([PROJECTOR_ID]);
    }

    const archived = await getEquipmentInventory({ archived: "1" });
    expect(archived.status).toBe("READY");
    if (archived.status === "READY") {
      expect(archived.showArchived).toBe(true);
      expect(archived.rows.map((row) => row.id)).toEqual([CHAIRS_ID]);
      expect(store.items.find((row) => row.id === CHAIRS_ID)?.archivedAt).toBeInstanceOf(
        Date,
      );
    }
  });
});

describe("equipment inventory mutations", () => {
  it("creates from the current organization and keeps audit summaries safe", async () => {
    const result = await createEquipmentItem({
      name: "  Nursery monitor  ",
      category: "Nursery",
      quantity: "2",
      storageLocation: "Nursery closet",
      status: "AVAILABLE",
      condition: "GOOD",
      notes: "secret serial 9988",
      organizationId: OTHER_ORG,
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      name: "Nursery monitor",
      quantity: 2,
    });
    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      action: string;
      changes: Array<{ field: string; newValue: string | null }>;
    };
    expect(audit.action).toBe("CREATE_EQUIPMENT_ITEM");
    expect(JSON.stringify(audit)).not.toContain("secret serial");
    expect(JSON.stringify(audit)).not.toContain("9988");
    expect(audit.changes).toContainEqual({
      field: "notes",
      oldValue: null,
      newValue: "set",
    });
  });

  it("does not edit another organization and retains archived rows", async () => {
    await expect(
      updateEquipmentItem({
        equipmentId: OTHER_ORG_ID,
        name: "Taken van",
        quantity: 1,
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    await expect(
      updateEquipmentItem({
        equipmentId: PROJECTOR_ID,
        name: "Sanctuary projector",
        quantity: 1,
        status: "MAINTENANCE",
        condition: "NEEDS_SERVICE",
        storageLocation: "Sanctuary booth",
        category: "Video",
        assetTag: "VID-200",
      }),
    ).resolves.toEqual({ status: "UPDATED" });
    expect(store.lastUpdateWhere).toEqual({ id: PROJECTOR_ID });
    expect(store.lastUpdateData).toMatchObject({ status: "MAINTENANCE" });

    await expect(
      archiveEquipmentItem({ equipmentId: MIC_ID, organizationId: OTHER_ORG }),
    ).resolves.toEqual({ status: "ARCHIVED" });
    expect(store.items.find((row) => row.id === MIC_ID)?.archivedAt).toBeInstanceOf(
      Date,
    );
    expect(store.items.find((row) => row.id === MIC_ID)?.status).toBe("RETIRED");
    expect(store.items).toHaveLength(5);

    await expect(
      restoreEquipmentItem({ equipmentId: MIC_ID }),
    ).resolves.toEqual({ status: "RESTORED" });
    expect(store.items.find((row) => row.id === MIC_ID)?.archivedAt).toBeNull();
  });

  it("returns only the safe list fields", async () => {
    const result = await getEquipmentInventory();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...EQUIPMENT_INVENTORY_ROW_FIELDS].sort(),
    );
    expect(result.rows.find((row) => row.id === PROJECTOR_ID)).toMatchObject({
      conditionLabel: "Needs service",
      statusLabel: "In use",
    });
    expect(result.rows.find((row) => row.id === MIXER_ID)).toMatchObject({
      conditionLabel: "Out of service",
    });
  });
});
