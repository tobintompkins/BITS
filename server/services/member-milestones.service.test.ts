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

type MilestoneRow = {
  id: string;
  organizationId: string;
  memberId: string;
  milestoneType: string;
  title: string;
  milestoneDate: Date;
  location: string | null;
  officiant: string | null;
  certificateNumber: string | null;
  notes: string | null;
  documentUrl: string | null;
  documentKey: string | null;
  createdByUserId: string;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  milestones: [] as MilestoneRow[],
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
    memberMilestone: {
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
        return store.milestones
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.memberId === where.memberId,
          )
          .sort((left, right) => {
            const byDate =
              right.milestoneDate.getTime() - left.milestoneDate.getTime();
            if (byDate !== 0) return byDate;
            return left.title.localeCompare(right.title);
          })
          .map((row) => ({
            milestoneType: row.milestoneType,
            title: row.title,
            milestoneDate: row.milestoneDate,
            location: row.location,
            officiant: row.officiant,
          }));
      },
    },
  },
}));

import { getMemberMilestones } from "./member-milestones.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000m003";
const STAFF_ID = "00000000-0000-4000-8000-00000000c099";
const OWN_EMAIL = "ann@church.test";
const BAPTISM_DATE = new Date("2020-08-15T00:00:00.000Z");
const MEMBERSHIP_DATE = new Date("2021-01-10T00:00:00.000Z");
const SALVATION_DATE = new Date("2018-04-12T00:00:00.000Z");

function milestone(
  overrides: Partial<MilestoneRow> & Pick<MilestoneRow, "id" | "title" | "milestoneDate">,
): MilestoneRow {
  return {
    organizationId: ORG_ID,
    memberId: MEMBER_ID,
    milestoneType: "BAPTISM",
    location: "Main Sanctuary",
    officiant: "Pastor Rivera",
    certificateNumber: "CERT-SECRET-441",
    notes: "staff only milestone memo",
    documentUrl: "https://files.example/secret-certificate.pdf",
    documentKey: "private/milestones/secret-key",
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
  store.milestones = [
    milestone({
      id: "00000000-0000-4000-8000-00000000b001",
      milestoneType: "BAPTISM",
      title: "Baptism Sunday",
      milestoneDate: BAPTISM_DATE,
    }),
    milestone({
      id: "00000000-0000-4000-8000-00000000b002",
      milestoneType: "MEMBERSHIP",
      title: "Joined membership",
      milestoneDate: MEMBERSHIP_DATE,
      location: null,
      officiant: null,
    }),
    milestone({
      id: "00000000-0000-4000-8000-00000000b003",
      milestoneType: "SALVATION",
      title: "Profession of faith",
      milestoneDate: SALVATION_DATE,
      location: "Altar",
      officiant: "Pastor Rivera",
    }),
    milestone({
      id: "00000000-0000-4000-8000-00000000b004",
      memberId: OTHER_MEMBER,
      title: "Other Person Baptism",
      milestoneDate: MEMBERSHIP_DATE,
    }),
    milestone({
      id: "00000000-0000-4000-8000-00000000b005",
      organizationId: OTHER_ORG,
      memberId: OTHER_ORG_MEMBER,
      title: "Other Church Membership",
      milestoneDate: MEMBERSHIP_DATE,
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

describe("member milestones", () => {
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

  it("returns signed out without querying members or milestones", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberMilestones()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();
  });

  it("scopes to the current organization and linked member", async () => {
    await getMemberMilestones();
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

  it("does not match members by name or email when no portal link exists", async () => {
    store.members[0] = { ...store.members[0], userAccountId: null };
    await expect(getMemberMilestones()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastFindWhere).toBeNull();
  });

  it("returns only the signed-in member's milestones, newest first", async () => {
    const result = await getMemberMilestones();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.milestones.map((row) => row.title)).toEqual([
      "Joined membership",
      "Baptism Sunday",
      "Profession of faith",
    ]);
    expect(store.lastFindOrderBy).toEqual([
      { milestoneDate: "desc" },
      { title: "asc" },
    ]);
    const text = payloadText(result);
    expect(text).not.toContain("Other Person Baptism");
    expect(text).not.toContain("Other Church Membership");
    expect(text).not.toContain(OTHER_MEMBER);
  });

  it("returns only the safe field allow-list and omits internal fields", async () => {
    const result = await getMemberMilestones();
    expect(result).toEqual({
      status: "READY",
      milestones: [
        {
          typeLabel: "Membership",
          title: "Joined membership",
          milestoneDate: MEMBERSHIP_DATE,
          location: null,
          officiant: null,
        },
        {
          typeLabel: "Baptism",
          title: "Baptism Sunday",
          milestoneDate: BAPTISM_DATE,
          location: "Main Sanctuary",
          officiant: "Pastor Rivera",
        },
        {
          typeLabel: "Salvation",
          title: "Profession of faith",
          milestoneDate: SALVATION_DATE,
          location: "Altar",
          officiant: "Pastor Rivera",
        },
      ],
    });
    expect(store.lastFindSelect).toEqual({
      milestoneType: true,
      title: true,
      milestoneDate: true,
      location: true,
      officiant: true,
    });
    const text = payloadText(result);
    expect(text).not.toContain("CERT-SECRET-441");
    expect(text).not.toContain("staff only milestone memo");
    expect(text).not.toContain("https://files.example/secret-certificate.pdf");
    expect(text).not.toContain("private/milestones/secret-key");
    expect(text).not.toContain(STAFF_ID);
    expect(text).not.toContain(MEMBER_ID);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toMatch(/certificateNumber/);
    expect(text).not.toMatch(/documentUrl/);
    expect(text).not.toMatch(/documentKey/);
    expect(text).not.toMatch(/createdByUserId/);
    expect(text).not.toMatch(/notes/);
  });

  it("returns an empty ready list when the linked member has no milestones", async () => {
    store.milestones = store.milestones.filter(
      (row) => row.memberId !== MEMBER_ID,
    );
    await expect(getMemberMilestones()).resolves.toEqual({
      status: "READY",
      milestones: [],
    });
    expect(store.lastFindWhere).toEqual({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });
  });
});
