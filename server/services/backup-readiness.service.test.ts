import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  backupReadinessNavItems,
  deriveBackupReadinessStatus,
  parseBackupReadinessCreate,
} from "@/lib/validation/backup-readiness";
import * as backupReadinessService from "./backup-readiness.service";

type LogRow = {
  id: string;
  organizationId: string;
  scope: string;
  result: string;
  checkedAt: Date;
  nextReviewAt: Date | null;
  storageSummary: string | null;
  notes: string | null;
  performedByUserAccountId: string;
  createdAt: Date;
  updatedAt: Date;
  performedBy: { displayName: string | null };
};

const store = vi.hoisted(() => ({
  logs: [] as LogRow[],
  lastFindManyWhere: null as unknown,
  lastCreateData: null as Record<string, unknown> | null,
  createCalls: 0,
  updateCalls: 0,
  deleteCalls: 0,
  filesystemCalls: 0,
  otherModelCalls: 0,
  nextId: 1,
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

vi.mock("node:fs", () => ({
  default: {
    writeFileSync: () => {
      store.filesystemCalls += 1;
    },
    mkdirSync: () => {
      store.filesystemCalls += 1;
    },
    copyFileSync: () => {
      store.filesystemCalls += 1;
    },
  },
  writeFileSync: () => {
    store.filesystemCalls += 1;
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    backupReadinessLog: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string };
      }) => {
        store.lastFindManyWhere = where;
        return store.logs
          .filter((row) => row.organizationId === where.organizationId)
          .sort((left, right) => {
            const checked = right.checkedAt.getTime() - left.checkedAt.getTime();
            if (checked !== 0) return checked;
            return right.createdAt.getTime() - left.createdAt.getTime();
          })
          .map((row) => ({
            id: row.id,
            scope: row.scope,
            result: row.result,
            checkedAt: row.checkedAt,
            nextReviewAt: row.nextReviewAt,
            storageSummary: row.storageSummary,
            notes: row.notes,
            createdAt: row.createdAt,
            performedBy: { displayName: row.performedBy.displayName },
          }));
      },
      create: async ({
        data,
      }: {
        data: Omit<
          LogRow,
          "id" | "createdAt" | "updatedAt" | "performedBy"
        > & { id?: string };
      }) => {
        store.createCalls += 1;
        const now = new Date("2026-09-30T12:00:00.000Z");
        const created: LogRow = {
          id: `00000000-0000-4000-8000-00000000b0${String(store.nextId).padStart(2, "0")}`,
          createdAt: now,
          updatedAt: now,
          performedBy: { displayName: "Pat Admin" },
          ...data,
        };
        store.nextId += 1;
        store.lastCreateData = created;
        store.logs.push(created);
        return { id: created.id };
      },
      update: async () => {
        store.updateCalls += 1;
        throw new Error("update is not allowed");
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
    leadershipDocument: {
      findMany: async () => {
        store.otherModelCalls += 1;
        return [];
      },
    },
    memberDocument: {
      findMany: async () => {
        store.otherModelCalls += 1;
        return [];
      },
    },
  },
}));

import {
  createBackupReadinessLog,
  getBackupReadinessLog,
} from "./backup-readiness.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";

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

function log(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: "00000000-0000-4000-8000-00000000b001",
    organizationId: ORG_ID,
    scope: "DATABASE",
    result: "VERIFIED",
    checkedAt: new Date("2026-09-20T10:00:00.000Z"),
        nextReviewAt: new Date("2027-12-15T00:00:00.000Z"),
    storageSummary: "Encrypted off-site backup",
    notes: "Checked the weekly database dump.",
    performedByUserAccountId: USER_ID,
    createdAt: new Date("2026-09-20T11:00:00.000Z"),
    updatedAt: new Date("2026-09-20T11:00:00.000Z"),
    performedBy: { displayName: "Pat Admin" },
    ...overrides,
  };
}

beforeEach(() => {
  store.logs = [];
  store.lastFindManyWhere = null;
  store.lastCreateData = null;
  store.createCalls = 0;
  store.updateCalls = 0;
  store.deleteCalls = 0;
  store.filesystemCalls = 0;
  store.otherModelCalls = 0;
  store.nextId = 1;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getOrganizationAccess.mockReset();
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
  mocks.getOrganizationAccess.mockResolvedValue(adminAccess());
});

describe("backup readiness navigation", () => {
  it("is available only to administrators", () => {
    expect(backupReadinessNavItems(false)).toEqual([]);
    expect(backupReadinessNavItems(true)).toEqual([
      {
        href: "/administration/backup-readiness",
        label: "Backup & Restore Readiness",
      },
    ]);
  });
});

describe("getBackupReadinessLog", () => {
  it("requires a signed-in administrator for the current organization", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    expect(await getBackupReadinessLog()).toEqual({ status: "SIGNED_OUT" });

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    expect(await getBackupReadinessLog()).toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getOrganizationAccess.mockResolvedValueOnce(
      adminAccess({ canEdit: false, roleCode: RoleCode.DATA_ENTRY }),
    );
    expect(await getBackupReadinessLog()).toEqual({ status: "UNAUTHORIZED" });
  });

  it("scopes reads to the current primary organization", async () => {
    store.logs = [
      log(),
      log({
        id: "00000000-0000-4000-8000-00000000b099",
        organizationId: OTHER_ORG,
        scope: "PHOTOGRAPHS",
        storageSummary: "Other church vault",
      }),
    ];

    const view = await getBackupReadinessLog();
    expect(store.lastFindManyWhere).toEqual({ organizationId: ORG_ID });
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.history).toHaveLength(1);
    expect(view.history[0]?.scope).toBe("DATABASE");
    expect(JSON.stringify(view)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(view)).not.toContain("Other church vault");
  });

  it("derives latest-per-scope status and marks missing or due reviews", async () => {
    store.logs = [
      log({
        id: "00000000-0000-4000-8000-00000000b010",
        scope: "DATABASE",
        result: "NOT_VERIFIED",
        checkedAt: new Date("2026-08-01T10:00:00.000Z"),
        nextReviewAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
      log({
        id: "00000000-0000-4000-8000-00000000b011",
        scope: "DATABASE",
        result: "VERIFIED",
        checkedAt: new Date("2026-09-15T10:00:00.000Z"),
        nextReviewAt: new Date("2027-12-15T00:00:00.000Z"),
        storageSummary: "Encrypted off-site backup",
      }),
      log({
        id: "00000000-0000-4000-8000-00000000b012",
        scope: "PHOTOGRAPHS",
        result: "RESTORE_TESTED",
        checkedAt: new Date("2026-09-10T08:00:00.000Z"),
        nextReviewAt: new Date("2026-09-20T00:00:00.000Z"),
      }),
    ];

    const view = await getBackupReadinessLog();
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;

    const byScope = Object.fromEntries(
      view.currentByScope.map((row) => [row.scope, row]),
    );
    expect(byScope.DATABASE?.result).toBe("VERIFIED");
    expect(byScope.DATABASE?.needsReview).toBe(false);
    expect(byScope.PHOTOGRAPHS?.needsReview).toBe(true);
    expect(byScope.LEADERSHIP_DOCUMENTS?.result).toBeNull();
    expect(byScope.LEADERSHIP_DOCUMENTS?.needsReview).toBe(true);
    expect(byScope.MEMBER_DOCUMENTS?.needsReview).toBe(true);
    expect(byScope.OTHER?.needsReview).toBe(true);
    expect(view.history[0]?.scope).toBe("DATABASE");
  });

  it("returns only safe fields and never includes emails or account ids", async () => {
    store.logs = [log({ notes: "Checked the weekly database dump." })];
    const view = await getBackupReadinessLog();
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("pat@example.com");
    expect(payload).not.toContain(USER_ID);
    expect(payload).not.toContain("performedByUserAccountId");
    expect(payload).not.toContain("organizationId");
    expect(payload).not.toContain("primaryEmail");
    expect(view.history[0]?.performedByLabel).toBe("Pat Admin");
    expect(view.history[0]?.storageSummary).toBe("Encrypted off-site backup");
  });

  it("filters history without changing current-scope status", async () => {
    store.logs = [
      log({ scope: "DATABASE", result: "VERIFIED" }),
      log({
        id: "00000000-0000-4000-8000-00000000b013",
        scope: "PHOTOGRAPHS",
        result: "NEEDS_ATTENTION",
        checkedAt: new Date("2026-09-18T10:00:00.000Z"),
      }),
    ];
    const view = await getBackupReadinessLog({
      scope: "PHOTOGRAPHS",
      result: "NEEDS_ATTENTION",
    });
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.history).toHaveLength(1);
    expect(view.history[0]?.scope).toBe("PHOTOGRAPHS");
    expect(view.currentByScope).toHaveLength(5);
    expect(
      view.currentByScope.find((row) => row.scope === "DATABASE")?.result,
    ).toBe("VERIFIED");
  });
});

describe("createBackupReadinessLog", () => {
  it("rejects non-administrators and keeps the log empty", async () => {
    mocks.getOrganizationAccess.mockResolvedValueOnce(
      adminAccess({ canEdit: false, roleCode: RoleCode.REPORT_VIEWER }),
    );
    const result = await createBackupReadinessLog({
      scope: "DATABASE",
      result: "VERIFIED",
      checkedAt: "2026-09-30T10:00",
    });
    expect(result).toEqual({ status: "UNAUTHORIZED" });
    expect(store.createCalls).toBe(0);
    expect(store.logs).toHaveLength(0);
  });

  it("validates required dates and next-review ordering", async () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    expect(
      parseBackupReadinessCreate(
        { scope: "DATABASE", result: "VERIFIED" },
        now,
      ).success,
    ).toBe(false);
    expect(
      parseBackupReadinessCreate(
        {
          scope: "DATABASE",
          result: "VERIFIED",
          checkedAt: "2026-10-10T12:00",
        },
        now,
      ).success,
    ).toBe(false);
    expect(
      parseBackupReadinessCreate(
        {
          scope: "DATABASE",
          result: "VERIFIED",
          checkedAt: "2026-09-30T10:00",
          nextReviewAt: "2026-09-29",
        },
        now,
      ).success,
    ).toBe(false);
    expect(
      parseBackupReadinessCreate(
        {
          scope: "DATABASE",
          result: "VERIFIED",
          checkedAt: "2026-09-30T10:00",
          nextReviewAt: "2026-10-15",
          storageSummary: "https://secret-bucket.example/backup",
        },
        now,
      ).success,
    ).toBe(false);

    expect(
      await createBackupReadinessLog({
        scope: "DATABASE",
        result: "VERIFIED",
        checkedAt: "2026-09-30T10:00",
        nextReviewAt: "2026-09-01",
      }),
    ).toEqual({ status: "INVALID" });
    expect(store.createCalls).toBe(0);
  });

  it("appends a new log entry without editing prior history", async () => {
    store.logs = [log()];
    const first = await createBackupReadinessLog({
      scope: "DATABASE",
      result: "RESTORE_TESTED",
      checkedAt: "2026-09-29T09:00",
      nextReviewAt: "2026-12-01",
      storageSummary: "Encrypted off-site backup",
      notes: "Restored a sample table in a throwaway copy.",
    });
    expect(first).toEqual({ status: "CREATED" });
    expect(store.logs).toHaveLength(2);
    expect(store.logs[0]?.result).toBe("VERIFIED");
    expect(store.updateCalls).toBe(0);
    expect(store.deleteCalls).toBe(0);

    const second = await createBackupReadinessLog({
      scope: "MEMBER_DOCUMENTS",
      result: "NEEDS_ATTENTION",
      checkedAt: "2026-09-28T08:00",
    });
    expect(second).toEqual({ status: "CREATED" });
    expect(store.logs).toHaveLength(3);
    expect(store.logs.map((row) => row.result)).toEqual([
      "VERIFIED",
      "RESTORE_TESTED",
      "NEEDS_ATTENTION",
    ]);
  });

  it("writes a safe audit payload without notes or storage summary", async () => {
    const result = await createBackupReadinessLog({
      scope: "LEADERSHIP_DOCUMENTS",
      result: "VERIFIED",
      checkedAt: "2026-09-30T10:00",
      storageSummary: "Encrypted off-site backup",
      notes: "Binder check completed.",
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
      action: "CREATE_BACKUP_READINESS_LOG",
      entityType: "BackupReadinessLog",
      entityId: expect.any(String),
      changes: [
        { field: "scope", oldValue: null, newValue: "LEADERSHIP_DOCUMENTS" },
        { field: "result", oldValue: null, newValue: "VERIFIED" },
        { field: "checkedAt", oldValue: null, newValue: "2026-09-30" },
      ],
    });
    const audit = JSON.stringify(mocks.createAuditEvent.mock.calls[0]);
    expect(audit).not.toContain("Encrypted off-site backup");
    expect(audit).not.toContain("Binder check completed");
    expect(audit).not.toContain("pat@example.com");
  });

  it("does not mutate backups, filesystems, or other church records", async () => {
    await createBackupReadinessLog({
      scope: "DATABASE",
      result: "VERIFIED",
      checkedAt: "2026-09-30T10:00",
    });
    expect(store.createCalls).toBe(1);
    expect(store.updateCalls).toBe(0);
    expect(store.deleteCalls).toBe(0);
    expect(store.filesystemCalls).toBe(0);
    expect(store.otherModelCalls).toBe(0);
    expect(backupReadinessService).not.toHaveProperty(
      "updateBackupReadinessLog",
    );
    expect(backupReadinessService).not.toHaveProperty(
      "deleteBackupReadinessLog",
    );
    expect(backupReadinessService).not.toHaveProperty("restoreBackup");
    expect(backupReadinessService).not.toHaveProperty("createBackup");
  });

  it("does not write logs for another organization", async () => {
    const result = await createBackupReadinessLog({
      scope: "OTHER",
      result: "NOT_VERIFIED",
      checkedAt: "2026-09-30T10:00",
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData?.organizationId).toBe(ORG_ID);
    expect(store.lastCreateData?.organizationId).not.toBe(OTHER_ORG);
  });
});

describe("backup readiness status helpers", () => {
  it("treats a missing entry or due review date as needing review", () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    const statuses = deriveBackupReadinessStatus(
      [
        {
          id: "1",
          scope: "DATABASE",
          result: "VERIFIED",
          checkedAt: new Date("2026-09-01T10:00:00.000Z"),
          createdAt: new Date("2026-09-01T11:00:00.000Z"),
          nextReviewAt: new Date("2026-10-01T00:00:00.000Z"),
          storageSummary: "Encrypted off-site backup",
          notes: null,
          performedByLabel: "Church administrator",
        },
        {
          id: "2",
          scope: "PHOTOGRAPHS",
          result: "RESTORE_TESTED",
          checkedAt: new Date("2026-09-10T10:00:00.000Z"),
          createdAt: new Date("2026-09-10T11:00:00.000Z"),
          nextReviewAt: new Date("2026-09-30T00:00:00.000Z"),
          storageSummary: null,
          notes: null,
          performedByLabel: "Church administrator",
        },
      ],
      now,
    );
    const byScope = Object.fromEntries(
      statuses.map((row) => [row.scope, row]),
    );
    expect(byScope.DATABASE?.needsReview).toBe(false);
    expect(byScope.PHOTOGRAPHS?.needsReview).toBe(true);
    expect(byScope.MEMBER_DOCUMENTS?.needsReview).toBe(true);
    expect(byScope.MEMBER_DOCUMENTS?.resultLabel).toBe("No check recorded");
  });
});
