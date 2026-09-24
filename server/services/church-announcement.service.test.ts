import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import { getAnnouncementCapabilitiesForRole } from "@/lib/auth/announcement-permissions";

type AnnouncementRow = {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: Date | null;
  createdByUserAccountId: string;
  createdAt: Date;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  announcements: [] as AnnouncementRow[],
  audits: [] as Array<Record<string, unknown>>,
  lastFindFirstWhere: null as unknown,
  lastFindManyWheres: [] as unknown[],
  lastCreateData: null as unknown,
  lastUpdateWhere: null as unknown,
  lastUpdateData: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getAnnouncementAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => {
    store.audits.push(input);
    return { id: "audit-1" };
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
  function publicRow(row: AnnouncementRow) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      status: row.status,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  return {
    prisma: {
      churchAnnouncement: {
        findMany: async ({
          where,
        }: {
          where: {
            organizationId: string;
            status?: string | { in: string[] };
          };
        }) => {
          store.lastFindManyWheres.push(where);
          return store.announcements
            .filter((row) => {
              if (row.organizationId !== where.organizationId) return false;
              if (typeof where.status === "string") {
                return row.status === where.status;
              }
              if (where.status?.in) return where.status.in.includes(row.status);
              return true;
            })
            .sort((left, right) => {
              if (where.status === "PUBLISHED") {
                const leftPublished = left.publishedAt?.getTime() ?? 0;
                const rightPublished = right.publishedAt?.getTime() ?? 0;
                if (rightPublished !== leftPublished) {
                  return rightPublished - leftPublished;
                }
              }
              return right.createdAt.getTime() - left.createdAt.getTime();
            })
            .map(publicRow);
        },
        findFirst: async ({
          where,
        }: {
          where: { id: string; organizationId: string };
        }) => {
          store.lastFindFirstWhere = where;
          const row = store.announcements.find(
            (item) =>
              item.id === where.id && item.organizationId === where.organizationId,
          );
          return row
            ? {
                id: row.id,
                status: row.status,
                title: row.title,
                publishedAt: row.publishedAt,
              }
            : null;
        },
        create: async ({
          data,
        }: {
          data: {
            organizationId: string;
            title: string;
            body: string;
            status: "DRAFT";
            publishedAt: Date | null;
            createdByUserAccountId: string;
          };
        }) => {
          store.lastCreateData = data;
          const now = new Date("2026-09-18T20:00:00.000Z");
          const row: AnnouncementRow = {
            id: "00000000-0000-4000-8000-00000000e001",
            organizationId: data.organizationId,
            title: data.title,
            body: data.body,
            status: data.status,
            publishedAt: data.publishedAt,
            createdByUserAccountId: data.createdByUserAccountId,
            createdAt: now,
            updatedAt: now,
          };
          store.announcements.push(row);
          return publicRow(row);
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<
            Pick<AnnouncementRow, "title" | "body" | "status" | "publishedAt">
          >;
        }) => {
          store.lastUpdateWhere = where;
          store.lastUpdateData = data;
          const row = store.announcements.find((item) => item.id === where.id);
          if (!row) throw new Error("missing");
          Object.assign(row, data, { updatedAt: new Date("2026-09-18T21:00:00.000Z") });
          return publicRow(row);
        },
      },
    },
  };
});

import {
  archiveChurchAnnouncement,
  createDraftAnnouncement,
  listChurchAnnouncements,
  publishChurchAnnouncement,
  updateDraftAnnouncement,
} from "./church-announcement.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DRAFT_ID = "00000000-0000-4000-8000-00000000e010";
const PUBLISHED_ID = "00000000-0000-4000-8000-00000000e011";
const ARCHIVED_ID = "00000000-0000-4000-8000-00000000e012";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000e013";
const OLD_PUBLISHED_ID = "00000000-0000-4000-8000-00000000e014";
const NEW_DRAFT_ID = "00000000-0000-4000-8000-00000000e015";

const VALID_TITLE = "Sunday Morning Reminder";
const VALID_BODY =
  "Join us this Sunday at 10:30 AM for worship and fellowship.";
const SECRET_BODY = "CONFIDENTIAL body text that must never be audited";

function row(
  overrides: Partial<AnnouncementRow> & Pick<AnnouncementRow, "id" | "status">,
): AnnouncementRow {
  return {
    organizationId: ORG_ID,
    title: VALID_TITLE,
    body: VALID_BODY,
    publishedAt: null,
    createdByUserAccountId: USER_ID,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-01T12:00:00.000Z"),
    ...overrides,
  };
}

function seed() {
  store.announcements = [
    row({
      id: OLD_PUBLISHED_ID,
      status: "PUBLISHED",
      title: "Older published note",
      publishedAt: new Date("2026-08-01T12:00:00.000Z"),
      createdAt: new Date("2026-07-01T12:00:00.000Z"),
    }),
    row({
      id: PUBLISHED_ID,
      status: "PUBLISHED",
      title: "Newer published note",
      publishedAt: new Date("2026-09-10T12:00:00.000Z"),
      createdAt: new Date("2026-09-09T12:00:00.000Z"),
    }),
    row({
      id: DRAFT_ID,
      status: "DRAFT",
      title: "Older draft",
      body: SECRET_BODY,
      createdAt: new Date("2026-09-02T12:00:00.000Z"),
    }),
    row({
      id: NEW_DRAFT_ID,
      status: "DRAFT",
      title: "Newer draft",
      createdAt: new Date("2026-09-12T12:00:00.000Z"),
    }),
    row({
      id: ARCHIVED_ID,
      status: "ARCHIVED",
      title: "Archived note",
      createdAt: new Date("2026-09-11T12:00:00.000Z"),
    }),
    row({
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      status: "PUBLISHED",
      title: "Other church secret",
      body: "Do not leak this other-tenant announcement",
      publishedAt: new Date("2026-09-18T12:00:00.000Z"),
    }),
  ];
  store.audits = [];
  store.lastFindFirstWhere = null;
  store.lastFindManyWheres = [];
  store.lastCreateData = null;
  store.lastUpdateWhere = null;
  store.lastUpdateData = null;
}

function grantAccess() {
  mocks.getAnnouncementAccess.mockResolvedValue({
    canManageAnnouncements: true,
    roleCode: RoleCode.ORG_ADMIN,
    isSuperAdmin: false,
    userAccountId: USER_ID,
  });
}

describe("church announcement permissions", () => {
  it("allows only organization administrators and super-admins", () => {
    expect(
      getAnnouncementCapabilitiesForRole(RoleCode.ORG_ADMIN).canManageAnnouncements,
    ).toBe(true);
    expect(
      getAnnouncementCapabilitiesForRole(RoleCode.ORG_ADMIN, true)
        .canManageAnnouncements,
    ).toBe(true);
    expect(
      getAnnouncementCapabilitiesForRole(null, true).canManageAnnouncements,
    ).toBe(true);
    expect(
      getAnnouncementCapabilitiesForRole(RoleCode.TREASURER)
        .canManageAnnouncements,
    ).toBe(false);
    expect(
      getAnnouncementCapabilitiesForRole(RoleCode.DATA_ENTRY)
        .canManageAnnouncements,
    ).toBe(false);
    expect(
      getAnnouncementCapabilitiesForRole(RoleCode.REPORT_VIEWER)
        .canManageAnnouncements,
    ).toBe(false);
    expect(
      getAnnouncementCapabilitiesForRole(RoleCode.DONOR).canManageAnnouncements,
    ).toBe(false);
  });
});

describe("church announcement service", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.createAuditEvent.mockImplementation(async (input: Record<string, unknown>) => {
      store.audits.push(input);
      return { id: "audit-1" };
    });
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "admin@church.test",
    });
    grantAccess();
  });

  it("denies signed-out users without querying announcements", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(listChurchAnnouncements()).rejects.toThrow("You must be signed in.");
    expect(store.lastFindManyWheres).toEqual([]);
    expect(mocks.getAnnouncementAccess).not.toHaveBeenCalled();
  });

  it("denies treasurer, data-entry, and report-viewer roles", async () => {
    mocks.getAnnouncementAccess.mockResolvedValue({
      canManageAnnouncements: false,
      roleCode: RoleCode.TREASURER,
      isSuperAdmin: false,
      userAccountId: USER_ID,
    });
    await expect(
      createDraftAnnouncement({ title: VALID_TITLE, body: VALID_BODY }),
    ).rejects.toThrow("You do not have permission to manage church announcements.");
    expect(store.lastCreateData).toBeNull();
    expect(store.audits).toEqual([]);
  });

  it("lists only the current organization in published-then-draft/archived order", async () => {
    const rows = await listChurchAnnouncements();
    expect(rows.map((item) => item.id)).toEqual([
      PUBLISHED_ID,
      OLD_PUBLISHED_ID,
      NEW_DRAFT_ID,
      ARCHIVED_ID,
      DRAFT_ID,
    ]);
    expect(rows.map((item) => item.title)).not.toContain("Other church secret");
    expect(store.lastFindManyWheres).toEqual([
      { organizationId: ORG_ID, status: "PUBLISHED" },
      {
        organizationId: ORG_ID,
        status: { in: ["DRAFT", "ARCHIVED"] },
      },
    ]);
  });

  it("rejects markup and out-of-range plain-text content", async () => {
    await expect(
      createDraftAnnouncement({
        title: "Hi",
        body: VALID_BODY,
      }),
    ).rejects.toThrow("Title must be 3–140 characters.");
    await expect(
      createDraftAnnouncement({
        title: VALID_TITLE,
        body: "Too short",
      }),
    ).rejects.toThrow("Announcement text must be 10–5000 characters.");
    await expect(
      createDraftAnnouncement({
        title: "<b>Sunday</b>",
        body: VALID_BODY,
      }),
    ).rejects.toThrow("Use plain text only. HTML and markup are not allowed.");
    await expect(
      createDraftAnnouncement({
        title: VALID_TITLE,
        body: "<p>Join us this Sunday at church.</p>",
      }),
    ).rejects.toThrow("Use plain text only. HTML and markup are not allowed.");
    expect(store.lastCreateData).toBeNull();
  });

  it("creates a draft and audits safe metadata without the body", async () => {
    const created = await createDraftAnnouncement({
      title: VALID_TITLE,
      body: SECRET_BODY,
    });
    expect(created.status).toBe("DRAFT");
    expect(created.publishedAt).toBeNull();
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      createdByUserAccountId: USER_ID,
      status: "DRAFT",
      publishedAt: null,
    });
    expect(store.audits).toHaveLength(1);
    const auditText = JSON.stringify(store.audits[0]);
    expect(auditText).not.toContain(SECRET_BODY);
    expect(auditText).not.toContain("body");
    expect(store.audits[0]).toMatchObject({
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
      action: "CREATE_CHURCH_ANNOUNCEMENT",
      entityType: "ChurchAnnouncement",
      entityId: created.id,
    });
    expect(store.audits[0].changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "action", newValue: "CREATE_CHURCH_ANNOUNCEMENT" }),
        expect.objectContaining({ field: "status", newValue: "DRAFT" }),
        expect.objectContaining({
          field: "titleLength",
          newValue: String(VALID_TITLE.length),
        }),
        expect.objectContaining({ field: "entityId", newValue: created.id }),
      ]),
    );
  });

  it("updates only draft announcements in the current organization", async () => {
    const updated = await updateDraftAnnouncement(DRAFT_ID, {
      title: "Updated Sunday reminder",
      body: "Please arrive a few minutes early this week.",
    });
    expect(updated.title).toBe("Updated Sunday reminder");
    expect(store.lastFindFirstWhere).toEqual({
      id: DRAFT_ID,
      organizationId: ORG_ID,
    });

    await expect(
      updateDraftAnnouncement(PUBLISHED_ID, {
        title: VALID_TITLE,
        body: VALID_BODY,
      }),
    ).rejects.toThrow("Only draft announcements can be edited.");

    await expect(
      updateDraftAnnouncement(OTHER_ORG_ID, {
        title: VALID_TITLE,
        body: VALID_BODY,
      }),
    ).rejects.toThrow("Announcement was not found.");
    expect(store.lastFindFirstWhere).toEqual({
      id: OTHER_ORG_ID,
      organizationId: ORG_ID,
    });
  });

  it("publishes drafts once and archives draft or published rows without deleting history", async () => {
    const now = new Date("2026-09-18T16:00:00.000Z");
    const published = await publishChurchAnnouncement(DRAFT_ID, now);
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).toEqual(now);
    expect(published.body).toBe(SECRET_BODY);

    await expect(publishChurchAnnouncement(PUBLISHED_ID)).rejects.toThrow(
      "Only draft announcements can be published.",
    );
    await expect(publishChurchAnnouncement(ARCHIVED_ID)).rejects.toThrow(
      "Only draft announcements can be published.",
    );

    const archivedPublished = await archiveChurchAnnouncement(PUBLISHED_ID);
    expect(archivedPublished.status).toBe("ARCHIVED");
    expect(archivedPublished.publishedAt).toEqual(
      new Date("2026-09-10T12:00:00.000Z"),
    );

    const archivedDraft = await archiveChurchAnnouncement(NEW_DRAFT_ID);
    expect(archivedDraft.status).toBe("ARCHIVED");
    expect(store.announcements.find((item) => item.id === NEW_DRAFT_ID)).toBeTruthy();

    await expect(archiveChurchAnnouncement(ARCHIVED_ID)).rejects.toThrow(
      "Only draft or published announcements can be archived.",
    );

    const auditText = JSON.stringify(store.audits);
    expect(auditText).not.toContain(SECRET_BODY);
    expect(auditText).not.toContain("Do not leak this other-tenant announcement");
  });
});
