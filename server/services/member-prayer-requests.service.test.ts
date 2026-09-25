import { beforeEach, describe, expect, it, vi } from "vitest";

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  firstName: string;
  lastName: string;
  email: string;
};

type PrayerRow = {
  id: string;
  organizationId: string;
  memberId: string | null;
  requesterName: string | null;
  requesterContact: string | null;
  request: string;
  status: string;
  privacyLevel: string;
  isPublic: boolean;
  publicPublishedAt: Date | null;
  publicExpiresAt: Date | null;
  assignedToUserId: string | null;
  answeredAt: Date | null;
  answerNotes: string | null;
  createdByUserId: string | null;
  createdAt: Date;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  prayers: [] as PrayerRow[],
  lastMemberWhere: null as unknown,
  lastFindWhere: null as unknown,
  lastFindSelect: null as unknown,
  lastFindOrderBy: null as unknown,
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
    prayerRequest: {
      findMany: async ({
        where,
        select,
        orderBy,
      }: {
        where: { organizationId: string; memberId: string };
        select: unknown;
        orderBy: unknown;
      }) => {
        store.lastFindWhere = where;
        store.lastFindSelect = select;
        store.lastFindOrderBy = orderBy;
        return store.prayers
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.memberId === where.memberId,
          )
          .sort((left, right) => {
            const byDate = right.createdAt.getTime() - left.createdAt.getTime();
            if (byDate !== 0) return byDate;
            return left.request.localeCompare(right.request);
          })
          .map((row) => ({
            request: row.request,
            createdAt: row.createdAt,
            status: row.status,
            privacyLevel: row.privacyLevel,
            answeredAt: row.answeredAt,
          }));
      },
    },
  },
}));

import { getMemberPrayerRequests } from "./member-prayer-requests.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000m003";
const STAFF_ID = "00000000-0000-4000-8000-00000000c099";
const OWN_EMAIL = "ann@church.test";
const NEWEST = new Date("2026-09-20T14:00:00.000Z");
const MIDDLE = new Date("2026-06-01T10:00:00.000Z");
const OLDEST = new Date("2025-12-15T16:00:00.000Z");
const ANSWERED_AT = new Date("2026-06-08T12:00:00.000Z");

function prayer(
  overrides: Partial<PrayerRow> & Pick<PrayerRow, "id" | "request" | "createdAt">,
): PrayerRow {
  return {
    organizationId: ORG_ID,
    memberId: MEMBER_ID,
    requesterName: "Ann Adams",
    requesterContact: OWN_EMAIL,
    status: "ACTIVE",
    privacyLevel: "PRAYER_TEAM",
    isPublic: false,
    publicPublishedAt: null,
    publicExpiresAt: new Date("2026-12-31T00:00:00.000Z"),
    assignedToUserId: STAFF_ID,
    answeredAt: null,
    answerNotes: "staff only answer memo",
    createdByUserId: STAFF_ID,
    ...overrides,
  };
}

function seed() {
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      firstName: "Ann",
      lastName: "Adams",
      email: OWN_EMAIL,
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      recordStatus: "ACTIVE",
      firstName: "Other",
      lastName: "Person",
      email: "other@church.test",
    },
    {
      id: OTHER_ORG_MEMBER,
      organizationId: OTHER_ORG,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      firstName: "Ann",
      lastName: "Adams",
      email: OWN_EMAIL,
    },
  ];
  store.prayers = [
    prayer({
      id: "00000000-0000-4000-8000-00000000p001",
      request: "Please pray for upcoming surgery.",
      createdAt: NEWEST,
      status: "IN_PRAYER",
      privacyLevel: "PASTORAL_STAFF",
    }),
    prayer({
      id: "00000000-0000-4000-8000-00000000p002",
      request: "Thankful for healing.",
      createdAt: MIDDLE,
      status: "ANSWERED",
      privacyLevel: "PRIVATE",
      answeredAt: ANSWERED_AT,
    }),
    prayer({
      id: "00000000-0000-4000-8000-00000000p003",
      request: "Pray for travel mercies.",
      createdAt: OLDEST,
      status: "ACTIVE",
      privacyLevel: "PRAYER_TEAM",
    }),
    prayer({
      id: "00000000-0000-4000-8000-00000000p004",
      memberId: OTHER_MEMBER,
      requesterName: "Other Person",
      requesterContact: "other@church.test",
      request: "Other member hidden request",
      createdAt: NEWEST,
    }),
    prayer({
      id: "00000000-0000-4000-8000-00000000p005",
      organizationId: OTHER_ORG,
      memberId: OTHER_ORG_MEMBER,
      request: "Other church hidden request",
      createdAt: NEWEST,
    }),
    prayer({
      id: "00000000-0000-4000-8000-00000000p006",
      memberId: null,
      requesterName: "Ann Adams",
      requesterContact: OWN_EMAIL,
      request: "Guest request matching name and email",
      createdAt: NEWEST,
    }),
  ];
  store.lastMemberWhere = null;
  store.lastFindWhere = null;
  store.lastFindSelect = null;
  store.lastFindOrderBy = null;
}

function payloadText(value: unknown) {
  return JSON.stringify(value);
}

describe("member prayer requests", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: OWN_EMAIL,
      displayName: "Ann Adams",
    });
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
  });

  it("returns signed out without querying members or prayer requests", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberPrayerRequests()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();
  });

  it("scopes to the current organization and linked member", async () => {
    await getMemberPrayerRequests();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(store.lastFindWhere).toEqual({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });
    const memberWhere = JSON.stringify(store.lastMemberWhere);
    expect(memberWhere).not.toContain("email");
    expect(memberWhere).not.toContain(OWN_EMAIL);
    expect(memberWhere).not.toContain("Ann");
    expect(memberWhere).not.toContain(OTHER_USER);
    expect(memberWhere).not.toContain(OTHER_ORG);
  });

  it("does not match members or requests by name or email when no portal link exists", async () => {
    store.members[0] = { ...store.members[0], userAccountId: null };
    await expect(getMemberPrayerRequests()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastFindWhere).toBeNull();
  });

  it("returns only the signed-in member's requests, newest first", async () => {
    const result = await getMemberPrayerRequests();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.requests.map((row) => row.request)).toEqual([
      "Please pray for upcoming surgery.",
      "Thankful for healing.",
      "Pray for travel mercies.",
    ]);
    expect(store.lastFindOrderBy).toEqual([
      { createdAt: "desc" },
      { request: "asc" },
    ]);
    const text = payloadText(result);
    expect(text).not.toContain("Other member hidden request");
    expect(text).not.toContain("Other church hidden request");
    expect(text).not.toContain("Guest request matching name and email");
    expect(text).not.toContain(OTHER_MEMBER);
  });

  it("returns only the safe field allow-list and omits internal fields", async () => {
    const result = await getMemberPrayerRequests();
    expect(result).toEqual({
      status: "READY",
      requests: [
        {
          request: "Please pray for upcoming surgery.",
          submittedAt: NEWEST,
          statusLabel: "In Prayer",
          privacyLabel: "Pastoral Staff",
          answeredAt: null,
        },
        {
          request: "Thankful for healing.",
          submittedAt: MIDDLE,
          statusLabel: "Answered",
          privacyLabel: "Private",
          answeredAt: ANSWERED_AT,
        },
        {
          request: "Pray for travel mercies.",
          submittedAt: OLDEST,
          statusLabel: "Active",
          privacyLabel: "Prayer Team",
          answeredAt: null,
        },
      ],
    });
    expect(store.lastFindSelect).toEqual({
      request: true,
      createdAt: true,
      status: true,
      privacyLevel: true,
      answeredAt: true,
    });
    const text = payloadText(result);
    expect(text).not.toContain(OWN_EMAIL);
    expect(text).not.toContain("Ann Adams");
    expect(text).not.toContain("staff only answer memo");
    expect(text).not.toContain(STAFF_ID);
    expect(text).not.toContain(MEMBER_ID);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toMatch(/requesterName/);
    expect(text).not.toMatch(/requesterContact/);
    expect(text).not.toMatch(/assignedToUserId/);
    expect(text).not.toMatch(/answerNotes/);
    expect(text).not.toMatch(/createdByUserId/);
    expect(text).not.toMatch(/isPublic/);
    expect(text).not.toMatch(/publicPublishedAt/);
    expect(text).not.toMatch(/publicExpiresAt/);
  });

  it("returns an empty ready list when the linked member has no requests", async () => {
    store.prayers = store.prayers.filter((row) => row.memberId !== MEMBER_ID);
    await expect(getMemberPrayerRequests()).resolves.toEqual({
      status: "READY",
      requests: [],
    });
    expect(store.lastFindWhere).toEqual({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });
  });
});
