import { beforeEach, describe, expect, it, vi } from "vitest";

type AnnouncementRow = {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt: Date | null;
  createdAt: Date;
  createdByUserAccountId: string;
  createdByName: string;
  createdByEmail: string;
};

type ReceiptRow = {
  announcementId: string;
  organizationId: string;
  userAccountId: string;
  readAt: Date;
};

const store = vi.hoisted(() => ({
  announcements: [] as AnnouncementRow[],
  receipts: [] as ReceiptRow[],
  lastCountWhere: null as unknown,
  lastFindWhere: null as unknown,
  lastFindSelect: null as unknown,
  lastFindSkip: null as number | null,
  lastFindTake: null as number | null,
  lastFindOrderBy: null as unknown,
  donorQueried: false,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/db/prisma", () => {
  function matchesWhere(
    row: AnnouncementRow,
    where: {
      organizationId?: string;
      status?: string;
      publishedAt?: { not: null };
    },
  ) {
    if (where.organizationId && row.organizationId !== where.organizationId) {
      return false;
    }
    if (where.status && row.status !== where.status) return false;
    if (where.publishedAt?.not === null && row.publishedAt == null) return false;
    return true;
  }

  return {
    prisma: {
      donor: {
        findFirst: async () => {
          store.donorQueried = true;
          return null;
        },
      },
      churchAnnouncement: {
        count: async ({
          where,
        }: {
          where: {
            organizationId: string;
            status: string;
            publishedAt: { not: null };
          };
        }) => {
          store.lastCountWhere = where;
          return store.announcements.filter((row) => matchesWhere(row, where))
            .length;
        },
        findMany: async ({
          where,
          skip,
          take,
          select,
          orderBy,
        }: {
          where: {
            organizationId: string;
            status: string;
            publishedAt: { not: null };
          };
          skip: number;
          take: number;
          select: unknown;
          orderBy: unknown;
        }) => {
          store.lastFindWhere = where;
          store.lastFindSelect = select;
          store.lastFindSkip = skip;
          store.lastFindTake = take;
          store.lastFindOrderBy = orderBy;
          return store.announcements
            .filter((row) => matchesWhere(row, where))
            .sort((left, right) => {
              const byPublished =
                (right.publishedAt?.getTime() ?? 0) -
                (left.publishedAt?.getTime() ?? 0);
              if (byPublished !== 0) return byPublished;
              return right.createdAt.getTime() - left.createdAt.getTime();
            })
            .slice(skip, skip + take)
            .map((row) => ({
              id: row.id,
              title: row.title,
              body: row.body,
              status: row.status,
              publishedAt: row.publishedAt,
              createdAt: row.createdAt,
              createdByUserAccountId: row.createdByUserAccountId,
              createdByName: row.createdByName,
              createdByEmail: row.createdByEmail,
              readReceipts: store.receipts
                .filter((receipt) => {
                  const where = (
                    select as {
                      readReceipts?: {
                        where?: {
                          organizationId?: string;
                          userAccountId?: string;
                        };
                      };
                    }
                  ).readReceipts?.where;
                  if (receipt.announcementId !== row.id) return false;
                  if (
                    where?.organizationId &&
                    receipt.organizationId !== where.organizationId
                  ) {
                    return false;
                  }
                  if (
                    where?.userAccountId &&
                    receipt.userAccountId !== where.userAccountId
                  ) {
                    return false;
                  }
                  return true;
                })
                .map((receipt) => ({ readAt: receipt.readAt })),
            }));
        },
      },
    },
  };
});

import { getMemberAnnouncements } from "./member-announcements.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const STAFF_ID = "00000000-0000-4000-8000-00000000c099";
const NEW_ID = "00000000-0000-4000-8000-00000000e001";
const OLD_ID = "00000000-0000-4000-8000-00000000e002";
const DRAFT_ID = "00000000-0000-4000-8000-00000000e003";
const ARCHIVED_ID = "00000000-0000-4000-8000-00000000e004";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000e005";
const NULL_PUBLISHED_ID = "00000000-0000-4000-8000-00000000e006";

const STAFF_NAME = "Pastor Admin";
const STAFF_EMAIL = "pastor@church.test";
const OTHER_TITLE = "Other church secret announcement";
const DRAFT_TITLE = "Unpublished draft title";
const ARCHIVED_TITLE = "Archived announcement title";

function announcement(
  overrides: Partial<AnnouncementRow> & Pick<AnnouncementRow, "id">,
): AnnouncementRow {
  return {
    organizationId: ORG_ID,
    title: "Sunday Morning Reminder",
    body: "Join us this Sunday at 10:30 AM.",
    status: "PUBLISHED",
    publishedAt: new Date("2026-09-24T12:00:00.000Z"),
    createdAt: new Date("2026-09-20T12:00:00.000Z"),
    createdByUserAccountId: STAFF_ID,
    createdByName: STAFF_NAME,
    createdByEmail: STAFF_EMAIL,
    ...overrides,
  };
}

function seed() {
  store.announcements = [
    announcement({
      id: NEW_ID,
      title: "Newer published note",
      body: "Line one\nLine two",
      publishedAt: new Date("2026-09-24T16:00:00.000Z"),
      createdAt: new Date("2026-09-24T15:00:00.000Z"),
    }),
    announcement({
      id: OLD_ID,
      title: "Older published note",
      publishedAt: new Date("2026-08-01T12:00:00.000Z"),
      createdAt: new Date("2026-07-15T12:00:00.000Z"),
    }),
    announcement({
      id: DRAFT_ID,
      title: DRAFT_TITLE,
      status: "DRAFT",
      publishedAt: null,
    }),
    announcement({
      id: ARCHIVED_ID,
      title: ARCHIVED_TITLE,
      status: "ARCHIVED",
      publishedAt: new Date("2026-07-01T12:00:00.000Z"),
    }),
    announcement({
      id: NULL_PUBLISHED_ID,
      title: "Published without date",
      status: "PUBLISHED",
      publishedAt: null,
    }),
    announcement({
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      title: OTHER_TITLE,
      publishedAt: new Date("2026-09-25T12:00:00.000Z"),
    }),
  ];
  store.receipts = [];
  store.lastCountWhere = null;
  store.lastFindWhere = null;
  store.lastFindSelect = null;
  store.lastFindSkip = null;
  store.lastFindTake = null;
  store.lastFindOrderBy = null;
  store.donorQueried = false;
}

function payloadText(value: unknown) {
  return JSON.stringify(value);
}

describe("member announcements", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
      ein: "12-3456789",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: "ann@church.test",
    });
  });

  it("returns signed out without querying announcements", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberAnnouncements()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastCountWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();
    expect(store.donorQueried).toBe(false);
  });

  it("returns a safe no-organization state without querying announcements", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getMemberAnnouncements()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastCountWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();
  });

  it("does not require a linked donor and ignores client user ids", async () => {
    const result = await getMemberAnnouncements({
      userId: STAFF_ID,
      email: STAFF_EMAIL,
    });
    expect(result.status).toBe("READY");
    expect(store.donorQueried).toBe(false);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(USER_ID);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(STAFF_ID);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain("email");
  });

  it("lists only current-organization published announcements with a date, newest first", async () => {
    const result = await getMemberAnnouncements();
    expect(result).toEqual({
      status: "READY",
      page: 1,
      pageSize: 20,
      pageCount: 1,
      totalCount: 2,
      announcements: [
        {
          id: NEW_ID,
          title: "Newer published note",
          body: "Line one\nLine two",
          publishedAt: new Date("2026-09-24T16:00:00.000Z"),
          isRead: false,
          readAt: null,
        },
        {
          id: OLD_ID,
          title: "Older published note",
          body: "Join us this Sunday at 10:30 AM.",
          publishedAt: new Date("2026-08-01T12:00:00.000Z"),
          isRead: false,
          readAt: null,
        },
      ],
    });
    expect(store.lastFindWhere).toEqual({
      organizationId: ORG_ID,
      status: "PUBLISHED",
      publishedAt: { not: null },
    });
    expect(store.lastFindOrderBy).toEqual([
      { publishedAt: "desc" },
      { createdAt: "desc" },
    ]);
    const text = payloadText(result);
    expect(text).not.toContain(DRAFT_TITLE);
    expect(text).not.toContain(ARCHIVED_TITLE);
    expect(text).not.toContain(OTHER_TITLE);
    expect(text).not.toContain("Published without date");
  });

  it("returns only the safe display allow-list and keeps body as plain text", async () => {
    const result = await getMemberAnnouncements();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const text = payloadText(result);
    expect(text).toContain("Line one\\nLine two");
    expect(text).not.toContain(STAFF_ID);
    expect(text).not.toContain(STAFF_NAME);
    expect(text).not.toContain(STAFF_EMAIL);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toContain("12-3456789");
    expect(text).not.toMatch(/"status":"PUBLISHED"/);
    expect(text).not.toMatch(/createdBy/);
    expect(store.lastFindSelect).toEqual({
      id: true,
      title: true,
      body: true,
      publishedAt: true,
      readReceipts: {
        where: {
          organizationId: ORG_ID,
          userAccountId: USER_ID,
        },
        select: { readAt: true },
        take: 1,
      },
    });
  });

  it("returns only the signed-in member's own read status", async () => {
    const ownReadAt = new Date("2026-09-22T12:00:00.000Z");
    store.receipts = [
      {
        announcementId: NEW_ID,
        organizationId: ORG_ID,
        userAccountId: USER_ID,
        readAt: ownReadAt,
      },
      {
        announcementId: NEW_ID,
        organizationId: ORG_ID,
        userAccountId: STAFF_ID,
        readAt: new Date("2026-09-21T12:00:00.000Z"),
      },
      {
        announcementId: OLD_ID,
        organizationId: ORG_ID,
        userAccountId: STAFF_ID,
        readAt: new Date("2026-09-21T12:00:00.000Z"),
      },
    ];
    const result = await getMemberAnnouncements();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.announcements[0]).toMatchObject({
      id: NEW_ID,
      isRead: true,
      readAt: ownReadAt,
    });
    expect(result.announcements[1]).toMatchObject({
      id: OLD_ID,
      isRead: false,
      readAt: null,
    });
    expect(JSON.stringify(result)).not.toContain(STAFF_ID);
  });

  it("paginates 20 at a time and caps the member list at 100", async () => {
    store.announcements = Array.from({ length: 105 }, (_, index) => {
      const n = String(index + 1).padStart(3, "0");
      return announcement({
        id: `00000000-0000-4000-8000-00000000f${n}`,
        title: `Published ${n}`,
        publishedAt: new Date(`2026-09-01T00:00:00.000Z`),
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)),
      });
    }).map((row, index) => ({
      ...row,
      publishedAt: new Date(Date.UTC(2026, 8, 1, 12, 0, 105 - index)),
    }));

    const page1 = await getMemberAnnouncements({ page: "1" });
    const page2 = await getMemberAnnouncements({ page: "2" });
    expect(store.lastFindSkip).toBe(20);
    expect(store.lastFindTake).toBe(20);
    const last = await getMemberAnnouncements({ page: "5" });
    const overflow = await getMemberAnnouncements({ page: "99" });

    expect(page1.status).toBe("READY");
    expect(page2.status).toBe("READY");
    expect(last.status).toBe("READY");
    expect(overflow.status).toBe("READY");
    if (
      page1.status !== "READY" ||
      page2.status !== "READY" ||
      last.status !== "READY" ||
      overflow.status !== "READY"
    ) {
      return;
    }

    expect(page1.totalCount).toBe(100);
    expect(page1.pageCount).toBe(5);
    expect(page1.announcements).toHaveLength(20);
    expect(page1.announcements[0]?.title).toBe("Published 001");
    expect(page2.page).toBe(2);
    expect(page2.announcements).toHaveLength(20);
    expect(store.lastFindSkip).toBe(80);
    expect(store.lastFindTake).toBe(20);
    expect(last.page).toBe(5);
    expect(last.announcements).toHaveLength(20);
    expect(overflow.page).toBe(5);
    expect(overflow.announcements).toHaveLength(20);
  });
});
