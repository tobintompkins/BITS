import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  STAFF_VOLUNTEER_AVAILABILITY_ROW_FIELDS,
  isStaffVolunteerAvailabilityRow,
} from "@/lib/validation/staff-volunteer-availability";

type MemberRow = {
  id: string;
  organizationId: string;
  recordStatus: string;
  preferredName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  email: string;
  phone: string;
  address: string;
  notes: string;
  userAccountId: string;
};

type MinistryRow = {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
};

type AssignmentRow = {
  memberId: string;
  ministryId: string;
  status: string;
  endedDate: Date | null;
};

type AvailabilityRow = {
  organizationId: string;
  memberId: string;
  weekday: string;
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  ministries: [] as MinistryRow[],
  assignments: [] as AssignmentRow[],
  rows: [] as AvailabilityRow[],
  lastMinistryWhere: null as unknown,
  lastAvailabilityWhere: null as unknown,
  lastAvailabilitySelect: null as unknown,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getMemberEngagementAccess: vi.fn(),
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

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    ministry: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; isActive: boolean };
      }) => {
        store.lastMinistryWhere = where;
        return store.ministries
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.isActive === where.isActive,
          )
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((row) => ({ id: row.id, name: row.name }));
      },
    },
    memberVolunteerAvailability: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          weekday?: string;
          member: {
            organizationId: string;
            recordStatus: string;
            ministries?: {
              some: {
                ministryId: string;
                status: string;
                endedDate: null;
                ministry: {
                  id: string;
                  organizationId: string;
                  isActive: boolean;
                };
              };
            };
          };
        };
        select: unknown;
      }) => {
        store.lastAvailabilityWhere = where;
        store.lastAvailabilitySelect = select;
        return store.rows
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.weekday && row.weekday !== where.weekday) return false;
            const member = store.members.find((item) => item.id === row.memberId);
            if (!member) return false;
            if (member.organizationId !== where.member.organizationId) {
              return false;
            }
            if (member.recordStatus !== where.member.recordStatus) return false;
            if (where.member.ministries?.some) {
              const needed = where.member.ministries.some;
              const assignment = store.assignments.find((item) => {
                if (item.memberId !== member.id) return false;
                if (item.ministryId !== needed.ministryId) return false;
                if (item.status !== needed.status) return false;
                if (needed.endedDate === null && item.endedDate !== null) {
                  return false;
                }
                const ministry = store.ministries.find(
                  (entry) => entry.id === item.ministryId,
                );
                if (!ministry) return false;
                if (ministry.id !== needed.ministry.id) return false;
                if (ministry.organizationId !== needed.ministry.organizationId) {
                  return false;
                }
                if (ministry.isActive !== needed.ministry.isActive) return false;
                return true;
              });
              if (!assignment) return false;
            }
            return true;
          })
          .map((row) => {
            const member = store.members.find((item) => item.id === row.memberId)!;
            return {
              weekday: row.weekday,
              isAvailable: row.isAvailable,
              startTime: row.startTime,
              endTime: row.endTime,
              note: row.note,
              member: {
                preferredName: member.preferredName,
                firstName: member.firstName,
                middleName: member.middleName,
                lastName: member.lastName,
                suffix: member.suffix,
                ministries: store.assignments
                  .filter(
                    (item) =>
                      item.memberId === member.id &&
                      item.status === "ACTIVE" &&
                      item.endedDate === null,
                  )
                  .map((item) => {
                    const ministry = store.ministries.find(
                      (entry) => entry.id === item.ministryId,
                    )!;
                    return {
                      ministry: {
                        name: ministry.name,
                        organizationId: ministry.organizationId,
                        isActive: ministry.isActive,
                      },
                    };
                  }),
              },
            };
          });
      },
    },
  },
}));

import { getStaffVolunteerAvailability } from "./staff-volunteer-availability.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000m003";
const WORSHIP_ID = "00000000-0000-4000-8000-00000000e001";
const YOUTH_ID = "00000000-0000-4000-8000-00000000e002";
const OTHER_ORG_MINISTRY = "00000000-0000-4000-8000-00000000e003";
const INACTIVE_MINISTRY = "00000000-0000-4000-8000-00000000e004";

function staffAccess(overrides?: { canViewMinistries?: boolean }) {
  return {
    canViewMinistries: overrides?.canViewMinistries ?? true,
    canManageMinistries: false,
    canManageMinistryRosters: false,
    canViewMilestones: false,
    canManageMilestones: false,
    canViewSpiritualGifts: false,
    canAssignSpiritualGifts: false,
    canManageSpiritualGiftCatalog: false,
    canViewSkillsInterests: false,
    canManageSkillsInterests: false,
    canViewDocuments: false,
    canManageDocuments: false,
    canViewConfidentialDocuments: false,
    canManageConfidentialDocuments: false,
    canViewContactInSkillSearch: false,
    canExport: false,
    canDeleteCatalog: false,
    roleCode: "REPORT_VIEWER",
    isSuperAdmin: false,
    userAccountId: USER_ID,
  };
}

function seed() {
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
      preferredName: "Ann",
      firstName: "Annabelle",
      middleName: null,
      lastName: "Adams",
      suffix: null,
      email: "ann@church.test",
      phone: "555-0100",
      address: "12 Private Lane",
      notes: "confidential pastoral note",
      userAccountId: USER_ID,
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
      preferredName: null,
      firstName: "Blake",
      middleName: null,
      lastName: "Baker",
      suffix: null,
      email: "blake@church.test",
      phone: "555-0199",
      address: "99 Other Street",
      notes: "youth file",
      userAccountId: "00000000-0000-4000-8000-00000000c002",
    },
    {
      id: OTHER_ORG_MEMBER,
      organizationId: OTHER_ORG,
      recordStatus: "ACTIVE",
      preferredName: null,
      firstName: "Other",
      lastName: "Church",
      middleName: null,
      suffix: null,
      email: "other@elsewhere.test",
      phone: "555-0111",
      address: "Away",
      notes: "other church file",
      userAccountId: USER_ID,
    },
  ];
  store.ministries = [
    {
      id: WORSHIP_ID,
      organizationId: ORG_ID,
      name: "Worship Team",
      isActive: true,
    },
    {
      id: YOUTH_ID,
      organizationId: ORG_ID,
      name: "Youth Ministry",
      isActive: true,
    },
    {
      id: OTHER_ORG_MINISTRY,
      organizationId: OTHER_ORG,
      name: "Worship Team",
      isActive: true,
    },
    {
      id: INACTIVE_MINISTRY,
      organizationId: ORG_ID,
      name: "Paused Choir",
      isActive: false,
    },
  ];
  store.assignments = [
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
    {
      memberId: OTHER_ORG_MEMBER,
      ministryId: OTHER_ORG_MINISTRY,
      status: "ACTIVE",
      endedDate: null,
    },
  ];
  store.rows = [
    {
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      weekday: "SUNDAY",
      isAvailable: true,
      startTime: "08:30",
      endTime: "12:00",
      note: "Worship team",
    },
    {
      organizationId: ORG_ID,
      memberId: OTHER_MEMBER,
      weekday: "WEDNESDAY",
      isAvailable: true,
      startTime: null,
      endTime: null,
      note: null,
    },
    {
      organizationId: ORG_ID,
      memberId: OTHER_MEMBER,
      weekday: "SUNDAY",
      isAvailable: true,
      startTime: "09:00",
      endTime: "10:00",
      note: "available but not on worship",
    },
    {
      organizationId: OTHER_ORG,
      memberId: OTHER_ORG_MEMBER,
      weekday: "SUNDAY",
      isAvailable: true,
      startTime: "09:00",
      endTime: "11:00",
      note: "other church only",
    },
  ];
}

beforeEach(() => {
  store.members = [];
  store.ministries = [];
  store.assignments = [];
  store.rows = [];
  store.lastMinistryWhere = null;
  store.lastAvailabilityWhere = null;
  store.lastAvailabilitySelect = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getMemberEngagementAccess.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "staff@church.test",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getMemberEngagementAccess.mockResolvedValue(staffAccess());
  seed();
});

describe("getStaffVolunteerAvailability", () => {
  it("denies signed-out and unauthorized staff", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getStaffVolunteerAvailability()).resolves.toEqual({
      status: "SIGNED_OUT",
    });

    mocks.getMemberEngagementAccess.mockResolvedValueOnce(
      staffAccess({ canViewMinistries: false }),
    );
    await expect(getStaffVolunteerAvailability()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
  });

  it("blocks member-only users without ministry roster view", async () => {
    mocks.getMemberEngagementAccess.mockResolvedValue({
      ...staffAccess({ canViewMinistries: false }),
      roleCode: null,
      userAccountId: USER_ID,
    });

    await expect(getStaffVolunteerAvailability()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    expect(store.lastAvailabilityWhere).toBeNull();
  });

  it("resolves organization and permission server-side and ignores client ids", async () => {
    const result = await getStaffVolunteerAvailability({
      organizationId: OTHER_ORG,
      memberId: OTHER_ORG_MEMBER,
      userAccountId: "client-user",
    });

    expect(result.status).toBe("READY");
    expect(mocks.getMemberEngagementAccess).toHaveBeenCalledWith(ORG_ID);
    expect(store.lastMinistryWhere).toEqual({
      organizationId: ORG_ID,
      isActive: true,
    });
    expect(store.lastAvailabilityWhere).toMatchObject({
      organizationId: ORG_ID,
      member: { organizationId: ORG_ID, recordStatus: "ACTIVE" },
    });
    if (result.status !== "READY") throw new Error("expected READY");
    expect(result.rows.map((row) => row.memberName)).toEqual([
      "Ann Adams",
      "Blake Baker",
      "Blake Baker",
    ]);
    expect(result.rows.map((row) => row.weekday)).toEqual([
      "SUNDAY",
      "WEDNESDAY",
      "SUNDAY",
    ]);
    expect(JSON.stringify(result)).not.toContain(OTHER_ORG);
  });

  it("allows roster-view permission without manage or financial access", async () => {
    mocks.getMemberEngagementAccess.mockResolvedValue(staffAccess());
    const result = await getStaffVolunteerAvailability();
    expect(result.status).toBe("READY");
    expect(mocks.getMemberEngagementAccess).toHaveBeenCalledWith(ORG_ID);
  });

  it("rejects invalid weekday and ministry filters", async () => {
    await expect(
      getStaffVolunteerAvailability({ weekday: "FUNDAY" }),
    ).resolves.toMatchObject({ status: "INVALID_FILTER" });
    expect(store.lastAvailabilityWhere).toBeNull();

    await expect(
      getStaffVolunteerAvailability({ ministryId: "not-a-uuid" }),
    ).resolves.toMatchObject({ status: "INVALID_FILTER" });

    await expect(
      getStaffVolunteerAvailability({ ministryId: OTHER_ORG_MINISTRY }),
    ).resolves.toMatchObject({ status: "INVALID_FILTER" });
    expect(store.lastAvailabilityWhere).toBeNull();
  });

  it("scopes ministry filters to assigned members only", async () => {
    const result = await getStaffVolunteerAvailability({
      weekday: "SUNDAY",
      ministryId: WORSHIP_ID,
    });

    expect(store.lastAvailabilityWhere).toMatchObject({
      organizationId: ORG_ID,
      weekday: "SUNDAY",
      member: {
        organizationId: ORG_ID,
        recordStatus: "ACTIVE",
        ministries: {
          some: {
            ministryId: WORSHIP_ID,
            status: "ACTIVE",
            endedDate: null,
            ministry: {
              id: WORSHIP_ID,
              organizationId: ORG_ID,
              isActive: true,
            },
          },
        },
      },
    });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") throw new Error("expected READY");
    expect(result.rows).toEqual([
      {
        memberName: "Ann Adams",
        ministryNames: ["Worship Team"],
        weekday: "SUNDAY",
        weekdayLabel: "Sunday",
        isAvailable: true,
        startTime: "08:30",
        endTime: "12:00",
        note: "Worship team",
      },
    ]);
  });

  it("returns only the safe-field allow-list", async () => {
    const result = await getStaffVolunteerAvailability();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") throw new Error("expected READY");
    expect(result.rows.every(isStaffVolunteerAvailabilityRow)).toBe(true);
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...STAFF_VOLUNTEER_AVAILABILITY_ROW_FIELDS].sort(),
    );
    expect(JSON.stringify(store.lastAvailabilitySelect)).not.toMatch(
      /email|phone|address|userAccountId|notes/,
    );
  });

  it("excludes contact and private fields from the review payload", async () => {
    const result = await getStaffVolunteerAvailability();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("ann@church.test");
    expect(serialized).not.toContain("blake@church.test");
    expect(serialized).not.toContain("555-0100");
    expect(serialized).not.toContain("12 Private Lane");
    expect(serialized).not.toContain("confidential pastoral note");
    expect(serialized).not.toContain(MEMBER_ID);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain("staff@church.test");
  });

  it("returns an empty ready state when no availability exists", async () => {
    store.rows = [];
    const result = await getStaffVolunteerAvailability();
    expect(result).toEqual({
      status: "READY",
      filters: { weekday: null, ministryId: null },
      ministries: [
        { id: WORSHIP_ID, name: "Worship Team" },
        { id: YOUTH_ID, name: "Youth Ministry" },
      ],
      rows: [],
    });
  });
});
