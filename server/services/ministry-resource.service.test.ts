import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MEMBER_MINISTRY_RESOURCE_GROUP_FIELDS,
  MEMBER_MINISTRY_RESOURCE_ROW_FIELDS,
  MINISTRY_RESOURCE_LINK_REL,
  MINISTRY_RESOURCE_LINK_TARGET,
  STAFF_MINISTRY_RESOURCE_ROW_FIELDS,
  ministryResourceLinkProps,
  parseApprovedHttpsUrl,
  staffMinistryResourceNavItems,
} from "@/lib/validation/ministry-resource";

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  email: string;
};

type MinistryRow = {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
};

type RosterRow = {
  memberId: string;
  ministryId: string;
  status: string;
  endedDate: Date | null;
};

type ResourceRow = {
  id: string;
  organizationId: string;
  ministryId: string;
  title: string;
  description: string | null;
  url: string;
  status: "DRAFT" | "PUBLISHED";
  archivedAt: Date | null;
  archivedByUserAccountId: string | null;
  createdByUserAccountId: string;
  updatedByUserAccountId: string;
  updatedAt: Date;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  ministries: [] as MinistryRow[],
  rosters: [] as RosterRow[],
  resources: [] as ResourceRow[],
  lastMemberWhere: null as unknown,
  lastMinistryWhere: null as unknown,
  lastResourceWhere: null as unknown,
  lastResourceSelect: null as unknown,
  lastCreateData: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getMemberEngagementAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => input),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/member-engagement-permissions", () => ({
  getMemberEngagementAccess: mocks.getMemberEngagementAccess,
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

function matchesArchivedAt(
  archivedAt: Date | null,
  where: Date | null | { not: null } | undefined,
) {
  if (where === undefined) return true;
  if (where === null) return archivedAt == null;
  if (typeof where === "object" && where && "not" in where) {
    return archivedAt != null;
  }
  return false;
}

function memberServesMinistry(memberId: string, ministryId: string) {
  return store.rosters.some(
    (row) =>
      row.memberId === memberId &&
      row.ministryId === ministryId &&
      row.status === "ACTIVE" &&
      row.endedDate === null,
  );
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    member: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          userAccountId: string;
          recordStatus: string;
        };
      }) => {
        store.lastMemberWhere = where;
        const row = store.members.find(
          (item) =>
            item.organizationId === where.organizationId &&
            item.userAccountId === where.userAccountId &&
            item.recordStatus === where.recordStatus,
        );
        return row ? { id: row.id } : null;
      },
    },
    ministry: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string; isActive: boolean };
      }) => {
        store.lastMinistryWhere = where;
        const row = store.ministries.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.isActive === where.isActive,
        );
        return row ? { id: row.id } : null;
      },
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; isActive: boolean };
      }) =>
        store.ministries
          .filter(
            (item) =>
              item.organizationId === where.organizationId &&
              item.isActive === where.isActive,
          )
          .map((item) => ({ id: item.id, name: item.name })),
    },
    ministryResource: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          ministryId?: string;
          status?: string;
          archivedAt?: Date | null | { not: null };
          ministry?: {
            organizationId: string;
            isActive: boolean;
            members: {
              some: {
                memberId: string;
                status: string;
                endedDate: null;
              };
            };
          };
        };
        select?: unknown;
      }) => {
        store.lastResourceWhere = where;
        store.lastResourceSelect = select;
        return store.resources
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.ministryId && row.ministryId !== where.ministryId) {
              return false;
            }
            if (where.status && row.status !== where.status) return false;
            if (!matchesArchivedAt(row.archivedAt, where.archivedAt)) {
              return false;
            }
            const ministry = store.ministries.find(
              (item) => item.id === row.ministryId,
            );
            if (!ministry) return false;
            if (where.ministry) {
              if (ministry.organizationId !== where.ministry.organizationId) {
                return false;
              }
              if (ministry.isActive !== where.ministry.isActive) return false;
              if (
                !memberServesMinistry(
                  where.ministry.members.some.memberId,
                  ministry.id,
                )
              ) {
                return false;
              }
            }
            return true;
          })
          .map((row) => {
            const ministry = store.ministries.find(
              (item) => item.id === row.ministryId,
            )!;
            return {
              id: row.id,
              ministryId: row.ministryId,
              title: row.title,
              description: row.description,
              url: row.url,
              status: row.status,
              archivedAt: row.archivedAt,
              updatedAt: row.updatedAt,
              ministry: { name: ministry.name },
            };
          });
      },
      findFirst: async ({
        where,
      }: {
        where: {
          id: string;
          organizationId: string;
          archivedAt?: Date | null | { not: null };
        };
      }) => {
        const row = store.resources.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            matchesArchivedAt(item.archivedAt, where.archivedAt),
        );
        return row
          ? {
              id: row.id,
              title: row.title,
              ministryId: row.ministryId,
              url: row.url,
              status: row.status,
            }
          : null;
      },
      create: async ({
        data,
      }: {
        data: Omit<
          ResourceRow,
          "id" | "archivedAt" | "archivedByUserAccountId" | "updatedAt"
        >;
      }) => {
        store.lastCreateData = data;
        const row: ResourceRow = {
          ...data,
          id: `resource-${store.resources.length + 1}`,
          archivedAt: null,
          archivedByUserAccountId: null,
          updatedAt: new Date("2026-09-25T15:00:00.000Z"),
        };
        store.resources.push(row);
        return { id: row.id };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          organizationId: string;
          archivedAt?: Date | null | { not: null };
        };
        data: Partial<ResourceRow>;
      }) => {
        const matches = store.resources.filter(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            matchesArchivedAt(row.archivedAt, where.archivedAt),
        );
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      },
    },
  },
}));

import {
  archiveMinistryResource,
  createMinistryResource,
  getMemberMinistryResources,
  getStaffMinistryResources,
  publishMinistryResource,
  restoreMinistryResource,
  unpublishMinistryResource,
  updateMinistryResource,
} from "./ministry-resource.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000d003";
const WORSHIP_ID = "00000000-0000-4000-8000-00000000f001";
const YOUTH_ID = "00000000-0000-4000-8000-00000000f002";
const OTHER_ORG_MINISTRY = "00000000-0000-4000-8000-00000000f003";
const PUBLISHED_ID = "00000000-0000-4000-8000-00000000b001";
const DRAFT_ID = "00000000-0000-4000-8000-00000000b002";
const ARCHIVED_ID = "00000000-0000-4000-8000-00000000b003";
const YOUTH_ID_RESOURCE = "00000000-0000-4000-8000-00000000b004";
const OTHER_ORG_RESOURCE = "00000000-0000-4000-8000-00000000b005";

function staffAccess(overrides?: { canManageMinistries?: boolean }) {
  return {
    canManageMinistries: overrides?.canManageMinistries ?? true,
    canManageMinistryRosters: true,
    canViewMinistries: true,
    roleCode: "ORG_ADMIN",
    userAccountId: USER_ID,
  };
}

function seed() {
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      email: "ann@church.test",
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: "00000000-0000-4000-8000-00000000c002",
      recordStatus: "ACTIVE",
      email: "blake@church.test",
    },
    {
      id: OTHER_ORG_MEMBER,
      organizationId: OTHER_ORG,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      email: "other@elsewhere.test",
    },
  ];
  store.ministries = [
    { id: WORSHIP_ID, organizationId: ORG_ID, name: "Worship Team", isActive: true },
    { id: YOUTH_ID, organizationId: ORG_ID, name: "Youth Ministry", isActive: true },
    {
      id: OTHER_ORG_MINISTRY,
      organizationId: OTHER_ORG,
      name: "Other Church Choir",
      isActive: true,
    },
  ];
  store.rosters = [
    {
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      status: "ACTIVE",
      endedDate: null,
    },
    {
      memberId: OTHER_MEMBER,
      ministryId: YOUTH_ID,
      status: "ACTIVE",
      endedDate: null,
    },
  ];
  store.resources = [
    {
      id: PUBLISHED_ID,
      organizationId: ORG_ID,
      ministryId: WORSHIP_ID,
      title: "Sound-booth guide",
      description: "How to run Sunday audio.",
      url: "https://guides.church.test/sound-booth",
      status: "PUBLISHED",
      archivedAt: null,
      archivedByUserAccountId: null,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
      updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    },
    {
      id: DRAFT_ID,
      organizationId: ORG_ID,
      ministryId: WORSHIP_ID,
      title: "Draft mix notes",
      description: "Not ready",
      url: "https://guides.church.test/draft-mix",
      status: "DRAFT",
      archivedAt: null,
      archivedByUserAccountId: null,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
      updatedAt: new Date("2026-09-21T00:00:00.000Z"),
    },
    {
      id: ARCHIVED_ID,
      organizationId: ORG_ID,
      ministryId: WORSHIP_ID,
      title: "Old booth policy",
      description: "Retired",
      url: "https://guides.church.test/old-policy",
      status: "PUBLISHED",
      archivedAt: new Date("2026-09-22T00:00:00.000Z"),
      archivedByUserAccountId: USER_ID,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
      updatedAt: new Date("2026-09-22T00:00:00.000Z"),
    },
    {
      id: YOUTH_ID_RESOURCE,
      organizationId: ORG_ID,
      ministryId: YOUTH_ID,
      title: "Youth lesson links",
      description: "For youth volunteers only",
      url: "https://guides.church.test/youth",
      status: "PUBLISHED",
      archivedAt: null,
      archivedByUserAccountId: null,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
      updatedAt: new Date("2026-09-19T00:00:00.000Z"),
    },
    {
      id: OTHER_ORG_RESOURCE,
      organizationId: OTHER_ORG,
      ministryId: OTHER_ORG_MINISTRY,
      title: "Other church secret guide",
      description: "Private other church URL",
      url: "https://other.church.test/secret",
      status: "PUBLISHED",
      archivedAt: null,
      archivedByUserAccountId: null,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
      updatedAt: new Date("2026-09-18T00:00:00.000Z"),
    },
  ];
}

beforeEach(() => {
  store.members = [];
  store.ministries = [];
  store.rosters = [];
  store.resources = [];
  store.lastMemberWhere = null;
  store.lastMinistryWhere = null;
  store.lastResourceWhere = null;
  store.lastResourceSelect = null;
  store.lastCreateData = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getMemberEngagementAccess.mockReset();
  mocks.createAuditEvent.mockClear();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "ann@church.test",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getMemberEngagementAccess.mockResolvedValue(staffAccess());
  seed();
});

describe("ministry resource validation and navigation", () => {
  it("accepts only approved https URLs and builds safe link attributes", () => {
    expect(parseApprovedHttpsUrl("https://guides.church.test/sound")).toBe(
      "https://guides.church.test/sound",
    );
    expect(parseApprovedHttpsUrl("http://guides.church.test/sound")).toBeNull();
    expect(parseApprovedHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(
      parseApprovedHttpsUrl("https://user:secret@guides.church.test/sound"),
    ).toBeNull();
    expect(
      ministryResourceLinkProps("https://guides.church.test/sound"),
    ).toEqual({
      href: "https://guides.church.test/sound",
      target: MINISTRY_RESOURCE_LINK_TARGET,
      rel: MINISTRY_RESOURCE_LINK_REL,
    });
    expect(staffMinistryResourceNavItems(false)).toEqual([]);
    expect(staffMinistryResourceNavItems(true)).toEqual([
      { href: "/ministry-resources", label: "Ministry Resources" },
    ]);
  });
});

describe("staff ministry resources", () => {
  it("denies signed-out and unauthorized users without looking up resources", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getStaffMinistryResources()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastResourceWhere).toBeNull();

    mocks.getMemberEngagementAccess.mockResolvedValue(
      staffAccess({ canManageMinistries: false }),
    );
    await expect(getStaffMinistryResources()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      createMinistryResource({
        ministryId: WORSHIP_ID,
        title: "Sound-booth guide",
        url: "https://guides.church.test/sound",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(store.lastCreateData).toBeNull();
  });

  it("scopes staff lists to the current organization and ignores client org ids", async () => {
    const result = await getStaffMinistryResources({
      organizationId: OTHER_ORG,
      ministryId: OTHER_ORG_MINISTRY,
    });
    expect(result.status).toBe("INVALID_FILTER");

    const list = await getStaffMinistryResources({
      organizationId: OTHER_ORG,
    });
    expect(list.status).toBe("READY");
    if (list.status !== "READY") return;
    expect(store.lastResourceWhere).toMatchObject({
      organizationId: ORG_ID,
      archivedAt: null,
    });
    expect(JSON.stringify(list)).not.toContain("Other church secret guide");
    expect(JSON.stringify(list)).not.toContain("other.church.test");
  });

  it("returns the staff allow-list and hostname instead of leaking secrets", async () => {
    const result = await getStaffMinistryResources();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...STAFF_MINISTRY_RESOURCE_ROW_FIELDS].sort(),
    );
    expect(result.rows.some((row) => row.hostname === "guides.church.test")).toBe(
      true,
    );
    expect(JSON.stringify(result.rows)).not.toContain("user:secret");
    expect(JSON.stringify(result.rows)).not.toContain("ann@church.test");
  });

  it("rejects non-https URLs, markup, and other-organization ministries", async () => {
    await expect(
      createMinistryResource({
        ministryId: WORSHIP_ID,
        title: "Unsafe",
        url: "http://guides.church.test/sound",
      }),
    ).resolves.toEqual({ status: "INVALID" });
    await expect(
      createMinistryResource({
        ministryId: WORSHIP_ID,
        title: "<b>Guide</b>",
        url: "https://guides.church.test/sound",
      }),
    ).resolves.toEqual({ status: "INVALID" });
    await expect(
      createMinistryResource({
        ministryId: OTHER_ORG_MINISTRY,
        organizationId: OTHER_ORG,
        title: "Other church guide",
        url: "https://other.church.test/guide",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.lastCreateData).toBeNull();
  });

  it("creates, publishes, archives, and restores without putting URLs in audit text", async () => {
    await expect(
      createMinistryResource({
        ministryId: WORSHIP_ID,
        title: "  Nursery orientation  ",
        description: "Check-in steps",
        url: "https://guides.church.test/nursery",
        organizationId: OTHER_ORG,
      }),
    ).resolves.toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      ministryId: WORSHIP_ID,
      title: "Nursery orientation",
      status: "DRAFT",
    });

    await expect(
      publishMinistryResource({ resourceId: DRAFT_ID }),
    ).resolves.toEqual({ status: "PUBLISHED" });
    expect(store.resources.find((row) => row.id === DRAFT_ID)?.status).toBe(
      "PUBLISHED",
    );

    await expect(
      archiveMinistryResource({ resourceId: PUBLISHED_ID }),
    ).resolves.toEqual({ status: "ARCHIVED" });
    await expect(
      restoreMinistryResource({ resourceId: PUBLISHED_ID }),
    ).resolves.toEqual({ status: "RESTORED" });

    const auditText = JSON.stringify(mocks.createAuditEvent.mock.calls);
    expect(auditText).not.toContain("https://guides.church.test");
    expect(auditText).not.toContain("Check-in steps");
    expect(auditText).toContain("CREATE_MINISTRY_RESOURCE");
    expect(auditText).toContain("PUBLISH_MINISTRY_RESOURCE");
    expect(auditText).toContain("ARCHIVE_MINISTRY_RESOURCE");
  });

  it("updates title and ministry without exposing other-organization records", async () => {
    await expect(
      updateMinistryResource({
        resourceId: OTHER_ORG_RESOURCE,
        ministryId: WORSHIP_ID,
        title: "Moved secretly",
        url: "https://guides.church.test/moved",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    await expect(
      updateMinistryResource({
        resourceId: PUBLISHED_ID,
        ministryId: WORSHIP_ID,
        title: "Sound-booth guide updated",
        url: "https://guides.church.test/sound-booth-v2",
      }),
    ).resolves.toEqual({ status: "UPDATED" });
    expect(store.resources.find((row) => row.id === PUBLISHED_ID)?.title).toBe(
      "Sound-booth guide updated",
    );
    await expect(
      unpublishMinistryResource({ resourceId: PUBLISHED_ID }),
    ).resolves.toEqual({ status: "UNPUBLISHED" });
  });
});

describe("member ministry resources", () => {
  it("returns signed-out, no-organization, and pending states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getMemberMinistryResources()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getMemberMinistryResources()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    store.members[0]!.userAccountId = null;
    await expect(getMemberMinistryResources()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: "ann@church.test",
    });
    expect(store.lastResourceWhere).toBeNull();
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("ann@church.test");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("email");
  });

  it("shows only published resources for the member’s active ministries", async () => {
    const result = await getMemberMinistryResources();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastResourceWhere).toMatchObject({
      organizationId: ORG_ID,
      status: "PUBLISHED",
      archivedAt: null,
      ministry: {
        organizationId: ORG_ID,
        isActive: true,
        members: {
          some: {
            memberId: MEMBER_ID,
            status: "ACTIVE",
            endedDate: null,
          },
        },
      },
    });
    expect(result.groups).toEqual([
      {
        ministryName: "Worship Team",
        resources: [
          {
            title: "Sound-booth guide",
            description: "How to run Sunday audio.",
            url: "https://guides.church.test/sound-booth",
          },
        ],
      },
    ]);
    expect(Object.keys(result.groups[0]!).sort()).toEqual(
      [...MEMBER_MINISTRY_RESOURCE_GROUP_FIELDS].sort(),
    );
    expect(Object.keys(result.groups[0]!.resources[0]!).sort()).toEqual(
      [...MEMBER_MINISTRY_RESOURCE_ROW_FIELDS].sort(),
    );
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("Draft mix notes");
    expect(payload).not.toContain("Old booth policy");
    expect(payload).not.toContain("Youth lesson links");
    expect(payload).not.toContain("Other church secret guide");
    expect(payload).not.toContain("ann@church.test");
    expect(payload).not.toContain(MEMBER_ID);
  });

  it("returns an empty grouped list when the member has no published resources", async () => {
    store.resources = store.resources.filter((row) => row.id !== PUBLISHED_ID);
    await expect(getMemberMinistryResources()).resolves.toEqual({
      status: "READY",
      groups: [],
    });
  });
});
