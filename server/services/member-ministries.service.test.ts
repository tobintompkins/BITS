import { beforeEach, describe, expect, it, vi } from "vitest";

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  firstName: string;
  lastName: string;
  email: string;
  notes: string;
};

type MinistryRow = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  meetingSchedule: string | null;
  location: string | null;
  isActive: boolean;
  leaderEmail?: string;
  leaderUserId?: string;
};

type AssignmentRow = {
  id: string;
  memberId: string;
  ministryId: string;
  role: string;
  status: string;
  joinedDate: Date | null;
  endedDate: Date | null;
  notes: string | null;
  isLeader: boolean;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  ministries: [] as MinistryRow[],
  assignments: [] as AssignmentRow[],
  lastMemberWhere: null as unknown,
  lastAssignmentWhere: null as unknown,
  lastAssignmentSelect: null as unknown,
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
    memberMinistry: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          memberId: string;
          status: string;
          endedDate: null;
          ministry: { organizationId: string; isActive: boolean };
        };
        select: unknown;
      }) => {
        store.lastAssignmentWhere = where;
        store.lastAssignmentSelect = select;
        return store.assignments
          .filter((row) => {
            if (row.memberId !== where.memberId) return false;
            if (row.status !== where.status) return false;
            if (where.endedDate === null && row.endedDate !== null) return false;
            const ministry = store.ministries.find(
              (item) => item.id === row.ministryId,
            );
            if (!ministry) return false;
            if (ministry.organizationId !== where.ministry.organizationId) {
              return false;
            }
            if (ministry.isActive !== where.ministry.isActive) return false;
            return true;
          })
          .sort((left, right) => {
            const leftName =
              store.ministries.find((item) => item.id === left.ministryId)
                ?.name ?? "";
            const rightName =
              store.ministries.find((item) => item.id === right.ministryId)
                ?.name ?? "";
            return leftName.localeCompare(rightName);
          })
          .map((row) => {
            const ministry = store.ministries.find(
              (item) => item.id === row.ministryId,
            )!;
            return {
              role: row.role,
              joinedDate: row.joinedDate,
              ministry: {
                name: ministry.name,
                description: ministry.description,
                meetingSchedule: ministry.meetingSchedule,
                location: ministry.location,
              },
            };
          });
      },
    },
  },
}));

import { getMemberMinistries } from "./member-ministries.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000m003";
const WORSHIP_ID = "00000000-0000-4000-8000-00000000e001";
const YOUTH_ID = "00000000-0000-4000-8000-00000000e002";
const PAUSED_MINISTRY_ID = "00000000-0000-4000-8000-00000000e003";
const OTHER_ORG_MINISTRY = "00000000-0000-4000-8000-00000000e004";
const INACTIVE_MINISTRY = "00000000-0000-4000-8000-00000000e005";
const OWN_EMAIL = "ann@church.test";
const JOINED = new Date("2024-03-01T00:00:00.000Z");

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
      notes: "confidential pastoral note",
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      recordStatus: "ACTIVE",
      firstName: "Other",
      lastName: "Person",
      email: "other@church.test",
      notes: "other member file",
    },
    {
      id: OTHER_ORG_MEMBER,
      organizationId: OTHER_ORG,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      firstName: "Ann",
      lastName: "Adams",
      email: OWN_EMAIL,
      notes: "other church file",
    },
  ];
  store.ministries = [
    {
      id: WORSHIP_ID,
      organizationId: ORG_ID,
      name: "Worship Team",
      description: "Sunday morning worship.",
      meetingSchedule: "Sundays at 9:00 AM",
      location: "Main Sanctuary",
      isActive: true,
      leaderEmail: "leader@church.test",
      leaderUserId: OTHER_USER,
    },
    {
      id: YOUTH_ID,
      organizationId: ORG_ID,
      name: "Youth Ministry",
      description: "Midweek youth gathering.",
      meetingSchedule: "Wednesdays at 6:30 PM",
      location: "Youth Room",
      isActive: true,
    },
    {
      id: PAUSED_MINISTRY_ID,
      organizationId: ORG_ID,
      name: "Hospitality",
      description: "Greeting and coffee.",
      meetingSchedule: "Sundays",
      location: "Lobby",
      isActive: true,
    },
    {
      id: OTHER_ORG_MINISTRY,
      organizationId: OTHER_ORG,
      name: "Other Church Choir",
      description: "Not your church.",
      meetingSchedule: "Thursdays",
      location: "Other Chapel",
      isActive: true,
    },
    {
      id: INACTIVE_MINISTRY,
      organizationId: ORG_ID,
      name: "Retired Outreach",
      description: "No longer meeting.",
      meetingSchedule: null,
      location: null,
      isActive: false,
    },
  ];
  store.assignments = [
    {
      id: "00000000-0000-4000-8000-00000000b001",
      memberId: MEMBER_ID,
      ministryId: YOUTH_ID,
      role: "VOLUNTEER",
      status: "ACTIVE",
      joinedDate: JOINED,
      endedDate: null,
      notes: "staff only assignment memo",
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-00000000b002",
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      role: "TEAM_LEAD",
      status: "ACTIVE",
      joinedDate: JOINED,
      endedDate: null,
      notes: "internal worship roster note",
      isLeader: true,
    },
    {
      id: "00000000-0000-4000-8000-00000000b003",
      memberId: MEMBER_ID,
      ministryId: PAUSED_MINISTRY_ID,
      role: "VOLUNTEER",
      status: "PAUSED",
      joinedDate: JOINED,
      endedDate: null,
      notes: "paused on leave",
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-00000000b004",
      memberId: MEMBER_ID,
      ministryId: INACTIVE_MINISTRY,
      role: "VOLUNTEER",
      status: "ACTIVE",
      joinedDate: JOINED,
      endedDate: null,
      notes: null,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-00000000b005",
      memberId: OTHER_MEMBER,
      ministryId: WORSHIP_ID,
      role: "DIRECTOR",
      status: "ACTIVE",
      joinedDate: JOINED,
      endedDate: null,
      notes: "other person's role",
      isLeader: true,
    },
    {
      id: "00000000-0000-4000-8000-00000000b006",
      memberId: OTHER_ORG_MEMBER,
      ministryId: OTHER_ORG_MINISTRY,
      role: "PARTICIPANT",
      status: "ACTIVE",
      joinedDate: JOINED,
      endedDate: null,
      notes: null,
      isLeader: false,
    },
    {
      id: "00000000-0000-4000-8000-00000000b007",
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      role: "VOLUNTEER",
      status: "ACTIVE",
      joinedDate: JOINED,
      endedDate: new Date("2025-01-01T00:00:00.000Z"),
      notes: "ended assignment",
      isLeader: false,
    },
  ];
  store.lastMemberWhere = null;
  store.lastAssignmentWhere = null;
  store.lastAssignmentSelect = null;
}

function payloadText(value: unknown) {
  return JSON.stringify(value);
}

describe("member ministries", () => {
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

  it("returns signed out without querying members or assignments", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberMinistries()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastAssignmentWhere).toBeNull();
  });

  it("scopes the member lookup to the current organization and signed-in account", async () => {
    await getMemberMinistries();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("email");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OWN_EMAIL);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("Ann");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OTHER_USER);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OTHER_MEMBER);
  });

  it("does not match members by name or email when no portal link exists", async () => {
    store.members[0] = { ...store.members[0], userAccountId: null };
    await expect(getMemberMinistries()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastAssignmentWhere).toBeNull();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
  });

  it("returns only the signed-in member's own active assignments", async () => {
    const result = await getMemberMinistries();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.ministries.map((row) => row.ministryName)).toEqual([
      "Worship Team",
      "Youth Ministry",
    ]);
    expect(store.lastAssignmentWhere).toEqual({
      memberId: MEMBER_ID,
      status: "ACTIVE",
      endedDate: null,
      ministry: {
        organizationId: ORG_ID,
        isActive: true,
      },
    });
    const text = payloadText(result);
    expect(text).not.toContain("Hospitality");
    expect(text).not.toContain("Retired Outreach");
    expect(text).not.toContain("Other Church Choir");
    expect(text).not.toContain("Director");
    expect(text).not.toContain(OTHER_MEMBER);
  });

  it("returns only the safe field allow-list", async () => {
    const result = await getMemberMinistries();
    expect(result).toEqual({
      status: "READY",
      ministries: [
        {
          ministryName: "Worship Team",
          roleLabel: "Team Lead",
          joinedDate: JOINED,
          description: "Sunday morning worship.",
          meetingSchedule: "Sundays at 9:00 AM",
          location: "Main Sanctuary",
        },
        {
          ministryName: "Youth Ministry",
          roleLabel: "Volunteer",
          joinedDate: JOINED,
          description: "Midweek youth gathering.",
          meetingSchedule: "Wednesdays at 6:30 PM",
          location: "Youth Room",
        },
      ],
    });
    expect(store.lastAssignmentSelect).toEqual({
      role: true,
      joinedDate: true,
      ministry: {
        select: {
          name: true,
          description: true,
          meetingSchedule: true,
          location: true,
        },
      },
    });
    const text = payloadText(result);
    expect(text).not.toContain("confidential pastoral note");
    expect(text).not.toContain("staff only assignment memo");
    expect(text).not.toContain("internal worship roster note");
    expect(text).not.toContain("leader@church.test");
    expect(text).not.toContain(OTHER_USER);
    expect(text).not.toContain(MEMBER_ID);
    expect(text).not.toContain(WORSHIP_ID);
    expect(text).not.toContain(ORG_ID);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toMatch(/isLeader/);
    expect(text).not.toMatch(/leaderUserId/);
    expect(text).not.toMatch(/notes/);
    expect(text).not.toMatch(/memberId/);
    expect(text).not.toMatch(/organizationId/);
  });

  it("returns an empty ready list when the linked member has no active assignments", async () => {
    store.assignments = store.assignments.filter(
      (row) => row.memberId !== MEMBER_ID,
    );
    await expect(getMemberMinistries()).resolves.toEqual({
      status: "READY",
      ministries: [],
    });
    expect(store.lastAssignmentWhere).toMatchObject({
      memberId: MEMBER_ID,
      status: "ACTIVE",
    });
  });
});
