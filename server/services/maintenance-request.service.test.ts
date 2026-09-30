import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAINTENANCE_REQUEST_ROW_FIELDS,
  parseMaintenanceCreate,
  parseMaintenanceStatusChange,
} from "@/lib/validation/maintenance-request";

type RequestRow = {
  id: string;
  organizationId: string;
  equipmentItemId: string | null;
  title: string;
  description: string;
  locationDescription: string | null;
  priority: string;
  status: string;
  reportedByUserAccountId: string | null;
  assignedToUserAccountId: string | null;
  assignedToName: string | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
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
  lastUpdateWhere: null as unknown,
  lastUpdateData: null as Record<string, unknown> | null,
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
    status?: string | { in: string[] };
    priority?: string;
    equipmentItemId?: string;
    OR?: Array<{
      title?: { contains: string };
      locationDescription?: { contains: string };
    }>;
  },
) {
  if (row.organizationId !== where.organizationId) return false;
  if (typeof where.status === "string" && row.status !== where.status) {
    return false;
  }
  if (
    where.status &&
    typeof where.status === "object" &&
    "in" in where.status &&
    !where.status.in.includes(row.status)
  ) {
    return false;
  }
  if (where.priority && row.priority !== where.priority) return false;
  if (where.equipmentItemId && row.equipmentItemId !== where.equipmentItemId) {
    return false;
  }
  if (where.OR) {
    return where.OR.some((clause) => {
      if (clause.title) return matchesContains(row.title, clause.title);
      if (clause.locationDescription) {
        return matchesContains(
          row.locationDescription,
          clause.locationDescription,
        );
      }
      return false;
    });
  }
  return true;
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    maintenanceRequest: {
      findMany: async ({
        where,
      }: {
        where: Parameters<typeof matchesWhere>[1];
      }) => {
        store.lastFindManyWhere = where;
        return store.requests
          .filter((row) => matchesWhere(row, where))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            locationDescription: row.locationDescription,
            equipmentItemId: row.equipmentItemId,
            priority: row.priority,
            status: row.status,
            resolutionNote: row.resolutionNote,
            resolvedAt: row.resolvedAt,
            createdAt: row.createdAt,
            assignedTo: row.assignedToName
              ? { displayName: row.assignedToName }
              : null,
            equipmentItem: store.equipment.find(
              (item) => item.id === row.equipmentItemId,
            )
              ? {
                  name: store.equipment.find(
                    (item) => item.id === row.equipmentItemId,
                  )!.name,
                  organizationId: store.equipment.find(
                    (item) => item.id === row.equipmentItemId,
                  )!.organizationId,
                }
              : null,
          }));
      },
      count: async ({
        where,
      }: {
        where: Parameters<typeof matchesWhere>[1];
      }) => store.requests.filter((row) => matchesWhere(row, where)).length,
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        const row = store.requests.find(
          (item) =>
            item.id === where.id && item.organizationId === where.organizationId,
        );
        return row ? { ...row } : null;
      },
      create: async ({
        data,
      }: {
        data: Partial<RequestRow> & { organizationId: string; title: string };
      }) => {
        store.lastCreateData = data as Record<string, unknown>;
        const created: RequestRow = {
          id: "00000000-0000-4000-8000-00000000f100",
          organizationId: data.organizationId,
          equipmentItemId: data.equipmentItemId ?? null,
          title: data.title,
          description: data.description ?? "",
          locationDescription: data.locationDescription ?? null,
          priority: data.priority ?? "NORMAL",
          status: data.status ?? "OPEN",
          reportedByUserAccountId: data.reportedByUserAccountId ?? null,
          assignedToUserAccountId: data.assignedToUserAccountId ?? null,
          assignedToName: null,
          resolutionNote: null,
          resolvedAt: null,
          createdAt: new Date("2026-09-29T15:00:00.000Z"),
        };
        store.requests.push(created);
        return { id: created.id };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<RequestRow>;
      }) => {
        store.lastUpdateWhere = where;
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
  changeMaintenanceRequestStatus,
  createMaintenanceRequest,
  getMaintenanceRequests,
  updateMaintenanceRequest,
} from "./maintenance-request.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const MIC_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_MIC_ID = "00000000-0000-4000-8000-00000000e002";
const OPEN_ID = "00000000-0000-4000-8000-00000000f001";
const PROGRESS_ID = "00000000-0000-4000-8000-00000000f002";
const DONE_ID = "00000000-0000-4000-8000-00000000f003";
const URGENT_ID = "00000000-0000-4000-8000-00000000f004";
const CANCELLED_ID = "00000000-0000-4000-8000-00000000f005";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000f006";

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
      id: OPEN_ID,
      organizationId: ORG_ID,
      equipmentItemId: MIC_ID,
      title: "Microphone cuts out",
      description: "Wireless mic drops during worship.",
      locationDescription: "Main Sanctuary",
      priority: "NORMAL",
      status: "OPEN",
      reportedByUserAccountId: USER_ID,
      assignedToUserAccountId: null,
      assignedToName: null,
      resolutionNote: null,
      resolvedAt: null,
      createdAt: new Date("2026-09-28T12:00:00.000Z"),
    },
    {
      id: PROGRESS_ID,
      organizationId: ORG_ID,
      equipmentItemId: null,
      title: "Hallway light out",
      description: "Second-floor hallway light is burned out.",
      locationDescription: "Education hallway",
      priority: "HIGH",
      status: "IN_PROGRESS",
      reportedByUserAccountId: USER_ID,
      assignedToUserAccountId: USER_ID,
      assignedToName: "Pat Leader",
      resolutionNote: null,
      resolvedAt: null,
      createdAt: new Date("2026-09-27T12:00:00.000Z"),
    },
    {
      id: DONE_ID,
      organizationId: ORG_ID,
      equipmentItemId: null,
      title: "Leaky kitchen sink",
      description: "Drip under the kitchen sink was repaired.",
      locationDescription: "Kitchen",
      priority: "LOW",
      status: "COMPLETED",
      reportedByUserAccountId: USER_ID,
      assignedToUserAccountId: null,
      assignedToName: null,
      resolutionNote: "Tightened the supply line.",
      resolvedAt: new Date("2026-09-26T12:00:00.000Z"),
      createdAt: new Date("2026-09-20T12:00:00.000Z"),
    },
    {
      id: URGENT_ID,
      organizationId: ORG_ID,
      equipmentItemId: null,
      title: "AC not cooling",
      description: "Sanctuary air conditioning is not cooling.",
      locationDescription: "Main Sanctuary",
      priority: "URGENT",
      status: "OPEN",
      reportedByUserAccountId: USER_ID,
      assignedToUserAccountId: null,
      assignedToName: null,
      resolutionNote: null,
      resolvedAt: null,
      createdAt: new Date("2026-09-29T10:00:00.000Z"),
    },
    {
      id: CANCELLED_ID,
      organizationId: ORG_ID,
      equipmentItemId: null,
      title: "Duplicate chair report",
      description: "This was reported twice by mistake.",
      locationDescription: "Fellowship Hall",
      priority: "LOW",
      status: "CANCELLED",
      reportedByUserAccountId: USER_ID,
      assignedToUserAccountId: null,
      assignedToName: null,
      resolutionNote: "Duplicate of an earlier request.",
      resolvedAt: new Date("2026-09-21T12:00:00.000Z"),
      createdAt: new Date("2026-09-21T11:00:00.000Z"),
    },
    {
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      equipmentItemId: OTHER_MIC_ID,
      title: "Other church projector",
      description: "Should never appear in this church list.",
      locationDescription: "Other sanctuary",
      priority: "URGENT",
      status: "OPEN",
      reportedByUserAccountId: USER_ID,
      assignedToUserAccountId: null,
      assignedToName: null,
      resolutionNote: null,
      resolvedAt: null,
      createdAt: new Date("2026-09-29T11:00:00.000Z"),
    },
  ];
}

beforeEach(() => {
  store.requests = [];
  store.equipment = [];
  store.lastFindManyWhere = null;
  store.lastCreateData = null;
  store.lastUpdateWhere = null;
  store.lastUpdateData = null;
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

describe("maintenance request validation", () => {
  it("requires title, description, and a resolution note when closing", () => {
    expect(parseMaintenanceCreate({ title: "Hi", description: "Too short" }).success).toBe(
      false,
    );
    expect(
      parseMaintenanceCreate({
        title: "Broken mic",
        description: "The sanctuary microphone cuts out.",
      }).success,
    ).toBe(true);
    expect(
      parseMaintenanceStatusChange({
        requestId: OPEN_ID,
        status: "COMPLETED",
      }).success,
    ).toBe(false);
    expect(
      parseMaintenanceStatusChange({
        requestId: OPEN_ID,
        status: "CANCELLED",
        resolutionNote: "Duplicate report.",
      }).success,
    ).toBe(true);
  });
});

describe("maintenance request access", () => {
  it("returns signed-out, missing organization, and forbidden states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getMaintenanceRequests()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastFindManyWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getMaintenanceRequests()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getEventAccess.mockResolvedValueOnce({
      canView: false,
      canManageLocations: false,
    });
    await expect(getMaintenanceRequests()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
  });

  it("lets viewers read but not mutate", async () => {
    mocks.getEventAccess.mockResolvedValue({
      canView: true,
      canManageLocations: false,
    });
    const list = await getMaintenanceRequests();
    expect(list.status).toBe("READY");
    if (list.status === "READY") expect(list.canManage).toBe(false);
    await expect(
      createMaintenanceRequest({
        title: "Broken chair",
        description: "A folding chair is damaged in the hall.",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    await expect(
      updateMaintenanceRequest({
        requestId: OPEN_ID,
        title: "Microphone cuts out",
        description: "Wireless mic drops during worship.",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    await expect(
      changeMaintenanceRequestStatus({
        requestId: OPEN_ID,
        status: "IN_PROGRESS",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
  });
});

describe("maintenance request scoping", () => {
  it("queries only the current organization and hides other-church rows", async () => {
    const result = await getMaintenanceRequests();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastFindManyWhere).toMatchObject({ organizationId: ORG_ID });
    expect(JSON.stringify(result)).not.toContain("Other church projector");
    expect(JSON.stringify(result)).not.toContain("leader@church.test");
    expect(result.counts).toEqual({
      open: 2,
      inProgress: 1,
      completed: 1,
      urgent: 1,
    });
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...MAINTENANCE_REQUEST_ROW_FIELDS].sort(),
    );
  });

  it("filters by status, priority, equipment, and search text", async () => {
    const open = await getMaintenanceRequests({ status: "OPEN" });
    expect(open.status).toBe("READY");
    if (open.status === "READY") {
      expect(open.rows.every((row) => row.status === "OPEN")).toBe(true);
    }
    const mic = await getMaintenanceRequests({ equipmentItemId: MIC_ID });
    expect(mic.status).toBe("READY");
    if (mic.status === "READY") {
      expect(mic.rows.map((row) => row.id)).toEqual([OPEN_ID]);
    }
    const search = await getMaintenanceRequests({ q: "hallway" });
    expect(search.status).toBe("READY");
    if (search.status === "READY") {
      expect(search.rows.map((row) => row.id)).toEqual([PROGRESS_ID]);
    }
    const high = await getMaintenanceRequests({ priority: "HIGH" });
    expect(high.status).toBe("READY");
    if (high.status === "READY") {
      expect(high.rows.map((row) => row.id)).toEqual([PROGRESS_ID]);
    }
  });
});

describe("maintenance request mutations", () => {
  it("creates for current-org equipment and keeps audit text small", async () => {
    const result = await createMaintenanceRequest({
      title: "Projector flicker",
      description: "The sanctuary projector flickers during songs.",
      locationDescription: "Main Sanctuary",
      priority: "HIGH",
      equipmentItemId: MIC_ID,
      assignedToUserAccountId: USER_ID,
      organizationId: OTHER_ORG,
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      equipmentItemId: MIC_ID,
      reportedByUserAccountId: USER_ID,
      status: "OPEN",
    });
    expect(store.lastCreateData).not.toHaveProperty("assignedToUserAccountId");
    const audit = JSON.stringify(mocks.createAuditEvent.mock.calls[0]?.[0]);
    expect(audit).not.toContain("flickers during songs");
    expect(audit).toContain("CREATE_MAINTENANCE_REQUEST");
  });

  it("rejects other-organization equipment and records", async () => {
    await expect(
      createMaintenanceRequest({
        title: "Other church issue",
        description: "This equipment belongs to another church.",
        equipmentItemId: OTHER_MIC_ID,
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    await expect(
      updateMaintenanceRequest({
        requestId: OTHER_ORG_ID,
        title: "Taken request",
        description: "Should not update another church request.",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
  });

  it("updates current-org requests and moves them in progress without a note", async () => {
    await expect(
      updateMaintenanceRequest({
        requestId: OPEN_ID,
        title: "Microphone still cuts out",
        description: "Wireless mic drops during worship.",
        locationDescription: "Main Sanctuary",
        priority: "HIGH",
        equipmentItemId: MIC_ID,
      }),
    ).resolves.toEqual({ status: "UPDATED" });
    expect(store.lastUpdateWhere).toEqual({ id: OPEN_ID });
    expect(store.lastUpdateData).toMatchObject({
      title: "Microphone still cuts out",
      priority: "HIGH",
      equipmentItemId: MIC_ID,
    });

    await expect(
      changeMaintenanceRequestStatus({
        requestId: OPEN_ID,
        status: "IN_PROGRESS",
      }),
    ).resolves.toEqual({ status: "STATUS_CHANGED" });
    expect(store.lastUpdateData).toMatchObject({
      status: "IN_PROGRESS",
    });
    expect(store.lastUpdateData?.resolutionNote).toBeUndefined();
  });

  it("requires a resolution note and keeps cancelled history", async () => {
    await expect(
      changeMaintenanceRequestStatus({
        requestId: OPEN_ID,
        status: "COMPLETED",
      }),
    ).resolves.toEqual({ status: "INVALID" });

    await expect(
      changeMaintenanceRequestStatus({
        requestId: OPEN_ID,
        status: "CANCELLED",
        resolutionNote: "Duplicate of an earlier report.",
      }),
    ).resolves.toEqual({ status: "STATUS_CHANGED" });
    const cancelled = store.requests.find((row) => row.id === OPEN_ID);
    expect(cancelled?.status).toBe("CANCELLED");
    expect(cancelled?.resolutionNote).toBe("Duplicate of an earlier report.");
    expect(cancelled?.resolvedAt).toBeInstanceOf(Date);
    expect(store.requests).toHaveLength(6);

    const list = await getMaintenanceRequests({ status: "CANCELLED" });
    expect(list.status).toBe("READY");
    if (list.status === "READY") {
      expect(list.rows.some((row) => row.id === OPEN_ID)).toBe(true);
      expect(list.rows.some((row) => row.id === CANCELLED_ID)).toBe(true);
    }
  });
});
