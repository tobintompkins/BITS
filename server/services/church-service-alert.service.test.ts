import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  churchServiceAlertNavItems,
  parseChurchServiceAlertContent,
} from "@/lib/validation/church-service-alert";

type AlertRow = {
  id: string;
  organizationId: string;
  alertType: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  title: string;
  message: string;
  startsAt: Date;
  expiresAt: Date;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdByUserAccountId: string;
  updatedByUserAccountId: string;
  createdAt: Date;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  alerts: [] as AlertRow[],
  audits: [] as Array<Record<string, unknown>>,
  lastFindManyWhere: null as unknown,
  lastFindFirstWhere: null as unknown,
  lastCreateData: null as Record<string, unknown> | null,
  writeCalls: 0,
  nextId: 1,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getAnnouncementAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => {
    store.audits.push(input);
    return input;
  }),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/announcement-permissions", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/announcement-permissions")
  >("@/lib/auth/announcement-permissions");
  return {
    ...actual,
    getAnnouncementAccess: mocks.getAnnouncementAccess,
  };
});

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

vi.mock("@/lib/db/prisma", () => {
  function matchesNot(id: string, filter?: { not?: string }) {
    if (!filter?.not) return true;
    return id !== filter.not;
  }

  const churchServiceAlert = {
    findMany: async ({
      where,
    }: {
      where: {
        organizationId: string;
        status?: string;
        id?: { not?: string };
      };
    }) => {
      store.lastFindManyWhere = where;
      return store.alerts.filter((row) => {
        if (row.organizationId !== where.organizationId) return false;
        if (where.status && row.status !== where.status) return false;
        if (!matchesNot(row.id, where.id)) return false;
        return true;
      });
    },
    findFirst: async ({
      where,
    }: {
      where: {
        organizationId: string;
        id?: string;
        status?: string;
        startsAt?: { lte?: Date };
        expiresAt?: { gt?: Date };
      };
    }) => {
      store.lastFindFirstWhere = where;
      return (
        store.alerts.find((row) => {
          if (row.organizationId !== where.organizationId) return false;
          if (where.id && row.id !== where.id) return false;
          if (where.status && row.status !== where.status) return false;
          if (
            where.startsAt?.lte &&
            row.startsAt.getTime() > where.startsAt.lte.getTime()
          ) {
            return false;
          }
          if (
            where.expiresAt?.gt &&
            row.expiresAt.getTime() <= where.expiresAt.gt.getTime()
          ) {
            return false;
          }
          return true;
        }) ?? null
      );
    },
    create: async ({ data }: { data: Partial<AlertRow> }) => {
      store.writeCalls += 1;
      const now = new Date("2026-09-30T12:00:00.000Z");
      const created: AlertRow = {
        id: `00000000-0000-4000-8000-00000000d0${String(store.nextId).padStart(2, "0")}`,
        organizationId: data.organizationId!,
        alertType: data.alertType!,
        status: (data.status as AlertRow["status"]) ?? "DRAFT",
        title: data.title!,
        message: data.message!,
        startsAt: data.startsAt!,
        expiresAt: data.expiresAt!,
        publishedAt: data.publishedAt ?? null,
        archivedAt: data.archivedAt ?? null,
        createdByUserAccountId: data.createdByUserAccountId!,
        updatedByUserAccountId: data.updatedByUserAccountId!,
        createdAt: now,
        updatedAt: now,
      };
      store.nextId += 1;
      store.lastCreateData = created;
      store.alerts.push(created);
      return { id: created.id };
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<AlertRow>;
    }) => {
      store.writeCalls += 1;
      const row = store.alerts.find((item) => item.id === where.id);
      if (!row) throw new Error("missing");
      Object.assign(row, data, {
        updatedAt: new Date("2026-09-30T13:00:00.000Z"),
      });
      return row;
    },
    delete: async () => {
      store.writeCalls += 1;
      throw new Error("delete is not allowed");
    },
  };

  return {
    prisma: {
      churchServiceAlert,
      $transaction: async (
        fn: (tx: { churchServiceAlert: typeof churchServiceAlert }) => Promise<unknown>,
      ) => fn({ churchServiceAlert }),
    },
  };
});

import {
  archiveChurchServiceAlert,
  createChurchServiceAlert,
  getChurchServiceAlerts,
  getPublicChurchServiceAlert,
  publishChurchServiceAlert,
  updateChurchServiceAlert,
} from "./church-service-alert.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const ALERT_ID = "00000000-0000-4000-8000-00000000d001";
const NOW = new Date("2026-09-30T12:00:00.000Z");

function announcementAccess(overrides?: {
  canManageAnnouncements?: boolean;
  roleCode?: RoleCode | null;
}) {
  return {
    canManageAnnouncements: overrides?.canManageAnnouncements ?? true,
    roleCode: overrides?.roleCode ?? RoleCode.ORG_ADMIN,
    isSuperAdmin: false,
    userAccountId: USER_ID,
  };
}

function alert(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: ALERT_ID,
    organizationId: ORG_ID,
    alertType: "WEATHER",
    status: "PUBLISHED",
    title: "Wednesday service cancelled",
    message: "Due to weather, Wednesday service is cancelled.",
    startsAt: new Date("2026-09-30T10:00:00.000Z"),
    expiresAt: new Date("2026-10-02T12:00:00.000Z"),
    publishedAt: new Date("2026-09-30T10:00:00.000Z"),
    archivedAt: null,
    createdByUserAccountId: USER_ID,
    updatedByUserAccountId: USER_ID,
    createdAt: new Date("2026-09-30T09:00:00.000Z"),
    updatedAt: new Date("2026-09-30T10:00:00.000Z"),
    ...overrides,
  };
}

const validContent = {
  alertType: "WEATHER",
  title: "Wednesday service cancelled",
  message: "Due to weather, Wednesday service is cancelled.",
  startsAt: "2026-09-30T10:00",
  expiresAt: "2026-10-02T12:00",
};

beforeEach(() => {
  store.alerts = [];
  store.audits = [];
  store.lastFindManyWhere = null;
  store.lastFindFirstWhere = null;
  store.lastCreateData = null;
  store.writeCalls = 0;
  store.nextId = 2;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getAnnouncementAccess.mockReset();
  mocks.createAuditEvent.mockClear();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    displayName: "Pat Admin",
    primaryEmail: "pat@example.com",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({
    id: ORG_ID,
    name: "Grace Church",
  });
  mocks.getAnnouncementAccess.mockResolvedValue(announcementAccess());
});

describe("church service alert navigation", () => {
  it("is available only to announcement managers", () => {
    expect(churchServiceAlertNavItems(false)).toEqual([]);
    expect(churchServiceAlertNavItems(true)).toEqual([
      { href: "/service-alerts", label: "Church Service Alerts" },
    ]);
  });
});

describe("date validation", () => {
  it("requires expiresAt after startsAt and rejects markup", () => {
    expect(parseChurchServiceAlertContent(validContent).success).toBe(true);
    expect(
      parseChurchServiceAlertContent({
        ...validContent,
        expiresAt: "2026-09-30T09:00",
      }).success,
    ).toBe(false);
    expect(
      parseChurchServiceAlertContent({
        ...validContent,
        title: "<script>alert(1)</script>",
      }).success,
    ).toBe(false);
  });
});

describe("staff church service alerts", () => {
  it("requires announcement-management access for the current organization", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    expect(await getChurchServiceAlerts(NOW)).toEqual({ status: "SIGNED_OUT" });

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    expect(await getChurchServiceAlerts(NOW)).toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getAnnouncementAccess.mockResolvedValueOnce(
      announcementAccess({
        canManageAnnouncements: false,
        roleCode: RoleCode.DATA_ENTRY,
      }),
    );
    expect(await getChurchServiceAlerts(NOW)).toEqual({
      status: "UNAUTHORIZED",
    });
  });

  it("scopes staff lists to the current organization", async () => {
    store.alerts = [
      alert(),
      alert({
        id: "00000000-0000-4000-8000-00000000d099",
        organizationId: OTHER_ORG,
        title: "Other church delay",
      }),
    ];
    const view = await getChurchServiceAlerts(NOW);
    expect(store.lastFindManyWhere).toEqual({ organizationId: ORG_ID });
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.rows).toHaveLength(1);
    expect(view.active?.title).toBe("Wednesday service cancelled");
    expect(JSON.stringify(view)).not.toContain("Other church delay");
  });

  it("creates drafts, updates them, and keeps safe audit summaries", async () => {
    const created = await createChurchServiceAlert(validContent);
    expect(created).toEqual({
      status: "CREATED",
      alertId: "00000000-0000-4000-8000-00000000d002",
    });
    expect(store.alerts[0]?.status).toBe("DRAFT");

    const updated = await updateChurchServiceAlert({
      alertId: store.alerts[0]?.id,
      ...validContent,
      title: "Sunday start time change",
      message: "Sunday service will begin at 11:00 AM.",
    });
    expect(updated).toEqual({ status: "UPDATED" });
    expect(store.alerts[0]?.status).toBe("DRAFT");
    expect(store.audits[0]?.action).toBe("CREATE_CHURCH_SERVICE_ALERT");
    expect(store.audits[1]?.action).toBe("UPDATE_CHURCH_SERVICE_ALERT");
    const audit = JSON.stringify(store.audits);
    expect(audit).not.toContain("Due to weather");
    expect(audit).not.toContain("Sunday service will begin");
    expect(audit).toContain("WEATHER");
    expect(audit).toContain("DRAFT");
  });

  it("publishes a draft and archives an overlapping active alert", async () => {
    store.alerts = [alert()];
    await createChurchServiceAlert({
      ...validContent,
      title: "Sunday start time change",
      message: "Sunday service will begin at 11:00 AM.",
    });
    const draftId = store.alerts[1]?.id;
    const published = await publishChurchServiceAlert(
      { alertId: draftId, ...validContent, title: "Sunday start time change" },
      NOW,
    );
    expect(published).toEqual({ status: "PUBLISHED" });
    expect(store.alerts[0]?.status).toBe("ARCHIVED");
    expect(store.alerts[1]?.status).toBe("PUBLISHED");
    expect(store.audits.at(-1)?.action).toBe("PUBLISH_CHURCH_SERVICE_ALERT");
    expect(JSON.stringify(store.audits.at(-1))).not.toContain(
      "Sunday service will begin",
    );
  });

  it("archives a published alert so it leaves the public home page", async () => {
    store.alerts = [alert()];
    expect(await archiveChurchServiceAlert({ alertId: ALERT_ID }, NOW)).toEqual(
      { status: "ARCHIVED" },
    );
    expect(store.alerts[0]?.status).toBe("ARCHIVED");
    const publicView = await getPublicChurchServiceAlert(NOW);
    expect(publicView).toEqual({ status: "NONE" });
  });
});

describe("public church service alert", () => {
  it("returns only the currently active published alert with safe fields", async () => {
    store.alerts = [
      alert(),
      alert({
        id: "00000000-0000-4000-8000-00000000d002",
        status: "DRAFT",
        title: "Draft snow plan",
        message: "Draft message should stay internal.",
      }),
      alert({
        id: "00000000-0000-4000-8000-00000000d003",
        status: "ARCHIVED",
        title: "Old cancellation",
        archivedAt: NOW,
      }),
      alert({
        id: "00000000-0000-4000-8000-00000000d004",
        startsAt: new Date("2026-09-01T00:00:00.000Z"),
        expiresAt: new Date("2026-09-29T00:00:00.000Z"),
        title: "Expired weather note",
      }),
      alert({
        id: "00000000-0000-4000-8000-00000000d099",
        organizationId: OTHER_ORG,
        title: "Other church delay",
      }),
    ];

    const view = await getPublicChurchServiceAlert(NOW);
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.alert).toEqual({
      typeLabel: "Weather",
      title: "Wednesday service cancelled",
      message: "Due to weather, Wednesday service is cancelled.",
      expiresAtLabel: expect.stringContaining("Expires"),
      updatedAtLabel: expect.stringContaining("Updated"),
    });
    const payload = JSON.stringify(view);
    expect(payload).not.toContain(ALERT_ID);
    expect(payload).not.toContain(USER_ID);
    expect(payload).not.toContain("organizationId");
    expect(payload).not.toContain("createdByUserAccountId");
    expect(payload).not.toContain("pat@example.com");
    expect(payload).not.toContain("Draft snow plan");
    expect(payload).not.toContain("Old cancellation");
    expect(payload).not.toContain("Expired weather note");
    expect(payload).not.toContain("Other church delay");
  });

  it("does not return a public alert when none is currently active", async () => {
    store.alerts = [
      alert({
        status: "DRAFT",
      }),
    ];
    expect(await getPublicChurchServiceAlert(NOW)).toEqual({ status: "NONE" });
  });
});
