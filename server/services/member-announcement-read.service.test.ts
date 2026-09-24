import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import { getAnnouncementCapabilitiesForRole } from "@/lib/auth/announcement-permissions";

type AnnouncementRow = {
  id: string;
  organizationId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: Date | null;
};

type ReceiptRow = {
  organizationId: string;
  announcementId: string;
  userAccountId: string;
  readAt: Date;
};

const store = vi.hoisted(() => ({
  announcements: [] as AnnouncementRow[],
  receipts: [] as ReceiptRow[],
  lastAnnouncementWhere: null as unknown,
  lastReceiptUniqueWhere: null as unknown,
  lastCreateData: null as unknown,
  lastGroupByWhere: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getAnnouncementAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => input),
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

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    churchAnnouncement: {
      findFirst: async ({
        where,
      }: {
        where: {
          id: string;
          organizationId: string;
          status: string;
          publishedAt: { not: null };
        };
      }) => {
        store.lastAnnouncementWhere = where;
        const row = store.announcements.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.status === where.status &&
            item.publishedAt != null,
        );
        return row ? { id: row.id } : null;
      },
    },
    churchAnnouncementReadReceipt: {
      findUnique: async ({
        where,
      }: {
        where: {
          organizationId_announcementId_userAccountId: {
            organizationId: string;
            announcementId: string;
            userAccountId: string;
          };
        };
      }) => {
        store.lastReceiptUniqueWhere = where;
        const key = where.organizationId_announcementId_userAccountId;
        const row = store.receipts.find(
          (item) =>
            item.organizationId === key.organizationId &&
            item.announcementId === key.announcementId &&
            item.userAccountId === key.userAccountId,
        );
        return row ? { readAt: row.readAt } : null;
      },
      create: async ({
        data,
      }: {
        data: {
          organizationId: string;
          announcementId: string;
          userAccountId: string;
        };
      }) => {
        store.lastCreateData = data;
        const readAt = new Date("2026-09-24T16:30:00.000Z");
        store.receipts.push({ ...data, readAt });
        return { readAt };
      },
      groupBy: async ({
        where,
      }: {
        by: string[];
        where: { organizationId: string };
        _count: { _all: true };
      }) => {
        store.lastGroupByWhere = where;
        const counts = new Map<string, number>();
        for (const row of store.receipts) {
          if (row.organizationId !== where.organizationId) continue;
          counts.set(row.announcementId, (counts.get(row.announcementId) ?? 0) + 1);
        }
        return [...counts.entries()].map(([announcementId, readCount]) => ({
          announcementId,
          _count: { _all: readCount },
        }));
      },
    },
  },
}));

import {
  getStaffAnnouncementReadTotals,
  markMemberAnnouncementRead,
} from "./member-announcement-read.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const STAFF_ID = "00000000-0000-4000-8000-00000000c099";
const PUBLISHED_ID = "00000000-0000-4000-8000-00000000e001";
const DRAFT_ID = "00000000-0000-4000-8000-00000000e003";
const ARCHIVED_ID = "00000000-0000-4000-8000-00000000e004";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000e005";
const READ_AT = new Date("2026-09-20T12:00:00.000Z");

function seed() {
  store.announcements = [
    {
      id: PUBLISHED_ID,
      organizationId: ORG_ID,
      status: "PUBLISHED",
      publishedAt: new Date("2026-09-24T16:00:00.000Z"),
    },
    {
      id: DRAFT_ID,
      organizationId: ORG_ID,
      status: "DRAFT",
      publishedAt: null,
    },
    {
      id: ARCHIVED_ID,
      organizationId: ORG_ID,
      status: "ARCHIVED",
      publishedAt: new Date("2026-07-01T12:00:00.000Z"),
    },
    {
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      status: "PUBLISHED",
      publishedAt: new Date("2026-09-25T12:00:00.000Z"),
    },
  ];
  store.receipts = [];
  store.lastAnnouncementWhere = null;
  store.lastReceiptUniqueWhere = null;
  store.lastCreateData = null;
  store.lastGroupByWhere = null;
}

describe("member announcement read tracking", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "ann@church.test",
    });
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
    mocks.getAnnouncementAccess.mockResolvedValue(
      getAnnouncementCapabilitiesForRole(RoleCode.ORG_ADMIN, false, STAFF_ID),
    );
  });

  it("denies signed-out members without looking up announcements", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(markMemberAnnouncementRead(PUBLISHED_ID)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastAnnouncementWhere).toBeNull();
    expect(store.lastCreateData).toBeNull();
  });

  it("scopes the mark to the current organization and ignores client identity fields", async () => {
    await expect(
      markMemberAnnouncementRead({
        announcementId: PUBLISHED_ID,
        userId: OTHER_USER,
        userAccountId: OTHER_USER,
        organizationId: OTHER_ORG,
      }),
    ).resolves.toMatchObject({ status: "MARKED" });
    expect(store.lastAnnouncementWhere).toEqual({
      id: PUBLISHED_ID,
      organizationId: ORG_ID,
      status: "PUBLISHED",
      publishedAt: { not: null },
    });
    expect(store.lastCreateData).toEqual({
      organizationId: ORG_ID,
      announcementId: PUBLISHED_ID,
      userAccountId: USER_ID,
    });
    expect(JSON.stringify(store.lastCreateData)).not.toContain(OTHER_USER);
    expect(JSON.stringify(store.lastCreateData)).not.toContain(OTHER_ORG);
  });

  it("does not mark draft, archived, or other-organization announcements", async () => {
    await expect(markMemberAnnouncementRead(DRAFT_ID)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    await expect(markMemberAnnouncementRead(ARCHIVED_ID)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    await expect(markMemberAnnouncementRead(OTHER_ORG_ID)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    expect(store.lastCreateData).toBeNull();
  });

  it("treats a repeated mark as an idempotent success and does not create another receipt", async () => {
    store.receipts.push({
      organizationId: ORG_ID,
      announcementId: PUBLISHED_ID,
      userAccountId: USER_ID,
      readAt: READ_AT,
    });
    await expect(markMemberAnnouncementRead(PUBLISHED_ID)).resolves.toEqual({
      status: "MARKED",
      readAt: READ_AT,
    });
    expect(store.lastCreateData).toBeNull();
    expect(store.receipts).toHaveLength(1);
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("audits the first mark without contact or identity extras", async () => {
    await markMemberAnnouncementRead(PUBLISHED_ID);
    expect(mocks.createAuditEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
      action: "MARK_ANNOUNCEMENT_READ",
      entityType: "ChurchAnnouncement",
      entityId: PUBLISHED_ID,
      changes: [
        { field: "action", oldValue: null, newValue: "MARK_ANNOUNCEMENT_READ" },
      ],
    });
    const text = JSON.stringify(mocks.createAuditEvent.mock.calls);
    expect(text).not.toContain("ann@church.test");
    expect(text).not.toMatch(/primaryEmail/);
    expect(text).not.toMatch(/donorId/);
  });

  it("returns staff aggregates without member identity fields", async () => {
    store.receipts = [
      {
        organizationId: ORG_ID,
        announcementId: PUBLISHED_ID,
        userAccountId: USER_ID,
        readAt: READ_AT,
      },
      {
        organizationId: ORG_ID,
        announcementId: PUBLISHED_ID,
        userAccountId: OTHER_USER,
        readAt: READ_AT,
      },
      {
        organizationId: OTHER_ORG,
        announcementId: OTHER_ORG_ID,
        userAccountId: USER_ID,
        readAt: READ_AT,
      },
    ];
    const result = await getStaffAnnouncementReadTotals();
    expect(result).toEqual({
      status: "READY",
      totals: [{ announcementId: PUBLISHED_ID, readCount: 2 }],
    });
    expect(store.lastGroupByWhere).toEqual({ organizationId: ORG_ID });
    const text = JSON.stringify(result);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toContain(OTHER_USER);
    expect(text).not.toContain("ann@church.test");
    expect(text).not.toMatch(/userAccountId/);
    expect(text).not.toMatch(/email/);
    expect(text).not.toContain(OTHER_ORG_ID);
  });

  it("denies staff totals without announcement management permission", async () => {
    mocks.getAnnouncementAccess.mockResolvedValue(
      getAnnouncementCapabilitiesForRole(RoleCode.TREASURER, false, STAFF_ID),
    );
    await expect(getStaffAnnouncementReadTotals()).resolves.toEqual({
      status: "FORBIDDEN",
    });
    expect(store.lastGroupByWhere).toBeNull();
  });
});
