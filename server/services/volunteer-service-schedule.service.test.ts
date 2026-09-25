import { beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBER_VOLUNTEER_SCHEDULE_ROW_FIELDS } from "@/lib/validation/volunteer-service-schedule";

type EventRow = {
  id: string;
  organizationId: string;
  title: string;
  eventStatus: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
  locationId: string | null;
};

type LocationRow = {
  id: string;
  name: string;
  roomName: string | null;
  isOnline: boolean;
  city: string | null;
  state: string | null;
  onlineMeetingUrl: string | null;
};

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  preferredName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  email: string;
};

type MinistryRow = {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
};

type RosterRow = {
  id: string;
  memberId: string;
  ministryId: string;
  status: string;
  endedDate: Date | null;
};

type AssignmentRow = {
  id: string;
  organizationId: string;
  eventId: string;
  memberId: string;
  ministryId: string | null;
  createdByUserId: string;
  roleLabel: string;
  status: "SCHEDULED" | "CANCELLED";
  staffNote: string | null;
  cancellationNote: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  createdAt: Date;
};

type TimeOffRow = {
  id: string;
  organizationId: string;
  memberId: string;
  startDate: Date;
  endDate: Date;
  status: "OPEN" | "IN_REVIEW" | "APPROVED" | "DECLINED" | "CANCELLED";
  memberReason: string | null;
  staffResolutionNote: string | null;
};

const store = vi.hoisted(() => ({
  events: [] as EventRow[],
  locations: [] as LocationRow[],
  members: [] as MemberRow[],
  ministries: [] as MinistryRow[],
  rosters: [] as RosterRow[],
  assignments: [] as AssignmentRow[],
  timeOffRequests: [] as TimeOffRow[],
  lastEventWhere: null as unknown,
  lastMemberWhere: null as unknown,
  lastAssignmentWhere: null as unknown,
  lastAssignmentSelect: null as unknown,
  lastTimeOffWhere: null as unknown,
  lastTimeOffSelect: null as unknown,
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

function matchesUpcoming(
  event: EventRow,
  where: {
    organizationId?: string;
    eventStatus?: { in: string[] };
    endDateTime?: { gte: Date };
  },
) {
  if (where.organizationId && event.organizationId !== where.organizationId) {
    return false;
  }
  if (where.eventStatus?.in && !where.eventStatus.in.includes(event.eventStatus)) {
    return false;
  }
  if (where.endDateTime?.gte && event.endDateTime < where.endDateTime.gte) {
    return false;
  }
  return true;
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    event: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          eventStatus: { in: string[] };
          endDateTime: { gte: Date };
        };
      }) => {
        store.lastEventWhere = where;
        return store.events
          .filter((event) => matchesUpcoming(event, where))
          .map((event) => ({
            id: event.id,
            title: event.title,
            startDateTime: event.startDateTime,
            endDateTime: event.endDateTime,
            timezone: event.timezone,
            isAllDay: event.isAllDay,
          }));
      },
      findFirst: async ({
        where,
      }: {
        where: {
          id: string;
          organizationId: string;
          eventStatus: { in: string[] };
          endDateTime: { gte: Date };
        };
      }) => {
        const event = store.events.find(
          (item) => item.id === where.id && matchesUpcoming(item, where),
        );
        return event
          ? {
              id: event.id,
              startDateTime: event.startDateTime,
              endDateTime: event.endDateTime,
              timezone: event.timezone,
              isAllDay: event.isAllDay,
            }
          : null;
      },
    },
    member: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; recordStatus: string };
      }) =>
        store.members
          .filter(
            (member) =>
              member.organizationId === where.organizationId &&
              member.recordStatus === where.recordStatus,
          )
          .map((member) => ({
            id: member.id,
            preferredName: member.preferredName,
            firstName: member.firstName,
            middleName: member.middleName,
            lastName: member.lastName,
            suffix: member.suffix,
          })),
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          organizationId: string;
          userAccountId?: string;
          recordStatus: string;
        };
      }) => {
        store.lastMemberWhere = where;
        const member = store.members.find((item) => {
          if (item.organizationId !== where.organizationId) return false;
          if (item.recordStatus !== where.recordStatus) return false;
          if (where.id && item.id !== where.id) return false;
          if (where.userAccountId && item.userAccountId !== where.userAccountId) {
            return false;
          }
          return true;
        });
        return member ? { id: member.id } : null;
      },
    },
    ministry: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; isActive: boolean };
      }) =>
        store.ministries
          .filter(
            (ministry) =>
              ministry.organizationId === where.organizationId &&
              ministry.isActive === where.isActive,
          )
          .map((ministry) => ({ id: ministry.id, name: ministry.name })),
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string; isActive: boolean };
      }) => {
        const ministry = store.ministries.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.isActive === where.isActive,
        );
        return ministry ? { id: ministry.id } : null;
      },
    },
    memberMinistry: {
      findFirst: async ({
        where,
      }: {
        where: {
          memberId: string;
          ministryId: string;
          status: string;
          endedDate: null;
        };
      }) => {
        const roster = store.rosters.find((item) => {
          if (item.memberId !== where.memberId) return false;
          if (item.ministryId !== where.ministryId) return false;
          if (item.status !== where.status) return false;
          if (where.endedDate === null && item.endedDate !== null) return false;
          return true;
        });
        return roster ? { id: roster.id } : null;
      },
    },
    volunteerServiceAssignment: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          eventId?: string;
          memberId?: string;
          status?: string;
          event?: {
            organizationId: string;
            eventStatus: { in: string[] };
            endDateTime: { gte: Date };
          };
        };
        select?: unknown;
      }) => {
        store.lastAssignmentWhere = where;
        store.lastAssignmentSelect = select;
        return store.assignments
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.eventId && row.eventId !== where.eventId) return false;
            if (where.memberId && row.memberId !== where.memberId) return false;
            if (where.status && row.status !== where.status) return false;
            if (where.event) {
              const event = store.events.find((item) => item.id === row.eventId);
              if (!event || !matchesUpcoming(event, where.event)) return false;
            }
            return true;
          })
          .map((row) => {
            const event = store.events.find((item) => item.id === row.eventId)!;
            const member = store.members.find((item) => item.id === row.memberId)!;
            const ministry = row.ministryId
              ? store.ministries.find((item) => item.id === row.ministryId)
              : null;
            const location = event.locationId
              ? store.locations.find((item) => item.id === event.locationId)
              : null;
            return {
              id: row.id,
              eventId: row.eventId,
              roleLabel: row.roleLabel,
              status: row.status,
              ministryId: row.ministryId,
              event: {
                title: event.title,
                startDateTime: event.startDateTime,
                endDateTime: event.endDateTime,
                timezone: event.timezone,
                isAllDay: event.isAllDay,
                location: location
                  ? {
                      name: location.name,
                      roomName: location.roomName,
                      isOnline: location.isOnline,
                      city: location.city,
                      state: location.state,
                    }
                  : null,
              },
              member: {
                preferredName: member.preferredName,
                firstName: member.firstName,
                middleName: member.middleName,
                lastName: member.lastName,
                suffix: member.suffix,
              },
              ministry: ministry ? { name: ministry.name } : null,
            };
          });
      },
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string; status: string };
      }) => {
        const row = store.assignments.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.status === where.status,
        );
        return row ? { id: row.id } : null;
      },
      create: async ({
        data,
      }: {
        data: Omit<AssignmentRow, "id" | "cancelledAt" | "cancelledByUserId" | "createdAt">;
      }) => {
        store.lastCreateData = data;
        const row: AssignmentRow = {
          ...data,
          id: `asg-${store.assignments.length + 1}`,
          cancelledAt: null,
          cancelledByUserId: null,
          createdAt: new Date("2026-09-24T18:00:00.000Z"),
        };
        store.assignments.push(row);
        return { id: row.id };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; organizationId: string; status: string };
        data: Partial<AssignmentRow>;
      }) => {
        const matches = store.assignments.filter(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            row.status === where.status,
        );
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      },
    },
    volunteerTimeOffRequest: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          memberId: string;
          status: string;
        };
        select?: unknown;
      }) => {
        store.lastTimeOffWhere = where;
        store.lastTimeOffSelect = select;
        return store.timeOffRequests
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (row.memberId !== where.memberId) return false;
            if (where.status && row.status !== where.status) return false;
            return true;
          })
          .map((row) => ({
            startDate: row.startDate,
            endDate: row.endDate,
          }));
      },
    },
  },
}));

import {
  cancelVolunteerServiceAssignment,
  createVolunteerServiceAssignment,
  getMemberVolunteerSchedule,
  getStaffVolunteerSchedule,
} from "./volunteer-service-schedule.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000d003";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_ORG_EVENT = "00000000-0000-4000-8000-00000000e002";
const PAST_EVENT = "00000000-0000-4000-8000-00000000e003";
const EVENING_EVENT = "00000000-0000-4000-8000-00000000e004";
const OVERLAP_EVENT = "00000000-0000-4000-8000-00000000e005";
const ALL_DAY_EVENT = "00000000-0000-4000-8000-00000000e006";
const WORSHIP_ID = "00000000-0000-4000-8000-00000000f001";
const YOUTH_ID = "00000000-0000-4000-8000-00000000f002";
const OTHER_ORG_MINISTRY = "00000000-0000-4000-8000-00000000f003";
const LOCATION_ID = "00000000-0000-4000-8000-00000000aa01";
const ASSIGNMENT_ID = "00000000-0000-4000-8000-00000000b001";
const OTHER_ASSIGNMENT = "00000000-0000-4000-8000-00000000b002";

function staffAccess(overrides?: { canManageMinistryRosters?: boolean }) {
  return {
    canViewMinistries: true,
    canManageMinistries: false,
    canManageMinistryRosters: overrides?.canManageMinistryRosters ?? true,
    roleCode: "DATA_ENTRY",
    isSuperAdmin: false,
    userAccountId: USER_ID,
  };
}

function seed() {
  store.locations = [
    {
      id: LOCATION_ID,
      name: "Main Sanctuary",
      roomName: "Sanctuary",
      isOnline: false,
      city: "Saco",
      state: "ME",
      onlineMeetingUrl: "https://internal.example/meet",
    },
  ];
  store.events = [
    {
      id: EVENT_ID,
      organizationId: ORG_ID,
      title: "Sunday Worship",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-27T14:00:00.000Z"),
      endDateTime: new Date("2026-09-27T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      locationId: LOCATION_ID,
    },
    {
      id: OTHER_ORG_EVENT,
      organizationId: OTHER_ORG,
      title: "Other Church Service",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-27T14:00:00.000Z"),
      endDateTime: new Date("2026-09-27T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      locationId: null,
    },
    {
      id: PAST_EVENT,
      organizationId: ORG_ID,
      title: "Last Week",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-01T14:00:00.000Z"),
      endDateTime: new Date("2026-09-01T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      locationId: null,
    },
    {
      id: EVENING_EVENT,
      organizationId: ORG_ID,
      title: "Sunday Evening",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-27T18:00:00.000Z"),
      endDateTime: new Date("2026-09-27T20:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      locationId: null,
    },
    {
      id: OVERLAP_EVENT,
      organizationId: ORG_ID,
      title: "Sunday Overlap",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-27T15:00:00.000Z"),
      endDateTime: new Date("2026-09-27T17:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      locationId: null,
    },
    {
      id: ALL_DAY_EVENT,
      organizationId: ORG_ID,
      title: "All-Day Work Day",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-27T00:00:00.000Z"),
      endDateTime: new Date("2026-09-27T23:59:00.000Z"),
      timezone: "UTC",
      isAllDay: true,
      locationId: null,
    },
  ];
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      preferredName: "Ann",
      firstName: "Annabelle",
      middleName: null,
      lastName: "Adams",
      suffix: null,
      email: "ann@church.test",
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      recordStatus: "ACTIVE",
      preferredName: null,
      firstName: "Blake",
      middleName: null,
      lastName: "Baker",
      suffix: null,
      email: "blake@church.test",
    },
    {
      id: OTHER_ORG_MEMBER,
      organizationId: OTHER_ORG,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      preferredName: null,
      firstName: "Other",
      lastName: "Church",
      middleName: null,
      suffix: null,
      email: "other@elsewhere.test",
    },
  ];
  store.ministries = [
    { id: WORSHIP_ID, organizationId: ORG_ID, name: "Worship Team", isActive: true },
    { id: YOUTH_ID, organizationId: ORG_ID, name: "Youth Ministry", isActive: true },
    {
      id: OTHER_ORG_MINISTRY,
      organizationId: OTHER_ORG,
      name: "Worship Team",
      isActive: true,
    },
  ];
  store.rosters = [
    {
      id: "roster-1",
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      status: "ACTIVE",
      endedDate: null,
    },
  ];
  store.assignments = [
    {
      id: ASSIGNMENT_ID,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      createdByUserId: USER_ID,
      roleLabel: "Sound Booth",
      status: "SCHEDULED",
      staffNote: "Ask for the hallway key",
      cancellationNote: null,
      cancelledAt: null,
      cancelledByUserId: null,
      createdAt: new Date("2026-09-20T12:00:00.000Z"),
    },
    {
      id: OTHER_ASSIGNMENT,
      organizationId: OTHER_ORG,
      eventId: OTHER_ORG_EVENT,
      memberId: OTHER_ORG_MEMBER,
      ministryId: OTHER_ORG_MINISTRY,
      createdByUserId: USER_ID,
      roleLabel: "Greeter",
      status: "SCHEDULED",
      staffNote: "other church note",
      cancellationNote: null,
      cancelledAt: null,
      cancelledByUserId: null,
      createdAt: new Date("2026-09-20T12:00:00.000Z"),
    },
  ];
}

beforeEach(() => {
  store.events = [];
  store.locations = [];
  store.members = [];
  store.ministries = [];
  store.rosters = [];
  store.assignments = [];
  store.timeOffRequests = [];
  store.lastEventWhere = null;
  store.lastMemberWhere = null;
  store.lastAssignmentWhere = null;
  store.lastAssignmentSelect = null;
  store.lastTimeOffWhere = null;
  store.lastTimeOffSelect = null;
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

describe("staff volunteer service schedule", () => {
  it("denies signed-out and unauthorized users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getStaffVolunteerSchedule()).resolves.toEqual({
      status: "SIGNED_OUT",
    });

    mocks.getMemberEngagementAccess.mockResolvedValue(
      staffAccess({ canManageMinistryRosters: false }),
    );
    await expect(getStaffVolunteerSchedule()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      createVolunteerServiceAssignment({
        eventId: EVENT_ID,
        memberId: MEMBER_ID,
        roleLabel: "Greeter",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    mocks.getMemberEngagementAccess.mockResolvedValue(staffAccess());
  });

  it("scopes staff queries to the current organization and ignores client ids", async () => {
    const result = await getStaffVolunteerSchedule();
    expect(result.status).toBe("READY");
    expect(store.lastEventWhere).toMatchObject({ organizationId: ORG_ID });
    expect(store.lastAssignmentWhere).toMatchObject({ organizationId: ORG_ID });
    if (result.status !== "READY") throw new Error("expected READY");
    expect(result.rows.map((row) => row.roleLabel)).toEqual(["Sound Booth"]);
    expect(JSON.stringify(result.rows)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(result.rows)).not.toContain("Other Church Service");
  });

  it("rejects invalid or cross-organization ids", async () => {
    await expect(
      createVolunteerServiceAssignment({
        eventId: "not-a-uuid",
        memberId: MEMBER_ID,
        roleLabel: "Greeter",
      }),
    ).resolves.toEqual({ status: "INVALID" });

    await expect(
      createVolunteerServiceAssignment({
        eventId: OTHER_ORG_EVENT,
        memberId: MEMBER_ID,
        roleLabel: "Greeter",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    await expect(
      createVolunteerServiceAssignment({
        eventId: EVENT_ID,
        memberId: OTHER_ORG_MEMBER,
        roleLabel: "Greeter",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    await expect(
      createVolunteerServiceAssignment({
        eventId: EVENT_ID,
        memberId: MEMBER_ID,
        ministryId: OTHER_ORG_MINISTRY,
        roleLabel: "Greeter",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
  });

  it("requires an active ministry roster match when a ministry is selected", async () => {
    await expect(
      createVolunteerServiceAssignment({
        eventId: EVENT_ID,
        memberId: OTHER_MEMBER,
        ministryId: WORSHIP_ID,
        roleLabel: "Sound Booth",
      }),
    ).resolves.toEqual({ status: "MINISTRY_MISMATCH" });
    expect(store.lastCreateData).toBeNull();
  });

  it("blocks an approved time-off date without exposing the reason or staff note", async () => {
    store.assignments = [];
    store.timeOffRequests = [
      {
        id: "00000000-0000-4000-8000-00000000aa11",
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        startDate: new Date("2026-09-27T00:00:00.000Z"),
        endDate: new Date("2026-09-27T00:00:00.000Z"),
        status: "APPROVED",
        memberReason: "Private family travel details",
        staffResolutionNote: "Covered by Blake privately",
      },
      {
        id: "00000000-0000-4000-8000-00000000aa12",
        organizationId: OTHER_ORG,
        memberId: MEMBER_ID,
        startDate: new Date("2026-09-27T00:00:00.000Z"),
        endDate: new Date("2026-09-27T00:00:00.000Z"),
        status: "APPROVED",
        memberReason: "Other church secret",
        staffResolutionNote: "Other church staff note",
      },
    ];

    const result = await createVolunteerServiceAssignment({
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      roleLabel: "Greeter",
    });
    expect(result).toEqual({ status: "TIME_OFF_CONFLICT" });
    expect(store.lastCreateData).toBeNull();
    expect(store.lastTimeOffWhere).toMatchObject({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      status: "APPROVED",
    });
    expect(JSON.stringify(store.lastTimeOffSelect)).not.toMatch(
      /memberReason|staffResolutionNote/,
    );
    expect(JSON.stringify(result)).not.toContain("Private family travel details");
    expect(JSON.stringify(result)).not.toContain("Covered by Blake privately");
    expect(JSON.stringify(result)).not.toContain("Other church secret");
  });

  it("does not treat declined, open, or cancelled time off as a conflict", async () => {
    store.assignments = [];
    store.timeOffRequests = [
      {
        id: "00000000-0000-4000-8000-00000000aa13",
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        startDate: new Date("2026-09-27T00:00:00.000Z"),
        endDate: new Date("2026-09-27T00:00:00.000Z"),
        status: "OPEN",
        memberReason: "Open reason",
        staffResolutionNote: null,
      },
      {
        id: "00000000-0000-4000-8000-00000000aa14",
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        startDate: new Date("2026-09-27T00:00:00.000Z"),
        endDate: new Date("2026-09-27T00:00:00.000Z"),
        status: "IN_REVIEW",
        memberReason: "Review reason",
        staffResolutionNote: null,
      },
      {
        id: "00000000-0000-4000-8000-00000000aa15",
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        startDate: new Date("2026-09-27T00:00:00.000Z"),
        endDate: new Date("2026-09-27T00:00:00.000Z"),
        status: "DECLINED",
        memberReason: "Declined reason",
        staffResolutionNote: "Declined staff note",
      },
      {
        id: "00000000-0000-4000-8000-00000000aa16",
        organizationId: ORG_ID,
        memberId: MEMBER_ID,
        startDate: new Date("2026-09-27T00:00:00.000Z"),
        endDate: new Date("2026-09-27T00:00:00.000Z"),
        status: "CANCELLED",
        memberReason: "Cancelled reason",
        staffResolutionNote: null,
      },
    ];

    await expect(
      createVolunteerServiceAssignment({
        eventId: EVENT_ID,
        memberId: MEMBER_ID,
        roleLabel: "Greeter",
      }),
    ).resolves.toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      roleLabel: "Greeter",
    });
  });

  it("allows same-day assignments when event times do not overlap", async () => {
    await expect(
      createVolunteerServiceAssignment({
        eventId: EVENING_EVENT,
        memberId: MEMBER_ID,
        roleLabel: "Greeter",
      }),
    ).resolves.toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      eventId: EVENING_EVENT,
      memberId: MEMBER_ID,
      roleLabel: "Greeter",
    });
  });

  it("blocks overlapping scheduled assignments and ignores other organizations", async () => {
    store.assignments.push({
      id: "00000000-0000-4000-8000-00000000b004",
      organizationId: OTHER_ORG,
      eventId: OTHER_ORG_EVENT,
      memberId: MEMBER_ID,
      ministryId: null,
      createdByUserId: USER_ID,
      roleLabel: "Other Church Role",
      status: "SCHEDULED",
      staffNote: "other org overlap note",
      cancellationNote: null,
      cancelledAt: null,
      cancelledByUserId: null,
      createdAt: new Date("2026-09-20T12:00:00.000Z"),
    });

    const result = await createVolunteerServiceAssignment({
      eventId: OVERLAP_EVENT,
      memberId: MEMBER_ID,
      roleLabel: "Greeter",
    });
    expect(result).toEqual({ status: "OVERLAP_CONFLICT" });
    expect(store.lastCreateData).toBeNull();
    expect(store.lastAssignmentWhere).toMatchObject({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
    });
    expect(JSON.stringify(result)).not.toContain("other org overlap note");
    expect(JSON.stringify(result)).not.toContain("Ask for the hallway key");
  });

  it("treats an all-day event as a conflict with any same-day assignment", async () => {
    const result = await createVolunteerServiceAssignment({
      eventId: ALL_DAY_EVENT,
      memberId: MEMBER_ID,
      roleLabel: "Setup",
    });
    expect(result).toEqual({ status: "OVERLAP_CONFLICT" });
    expect(store.lastCreateData).toBeNull();
  });

  it("does not treat a cancelled assignment as a conflict", async () => {
    store.assignments[0]!.status = "CANCELLED";
    await expect(
      createVolunteerServiceAssignment({
        eventId: EVENT_ID,
        memberId: MEMBER_ID,
        ministryId: WORSHIP_ID,
        roleLabel: "Sound Booth",
      }),
    ).resolves.toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      roleLabel: "Sound Booth",
      status: "SCHEDULED",
    });
  });

  it("prevents duplicate active assignments for the same event, member, ministry, and role", async () => {
    await expect(
      createVolunteerServiceAssignment({
        eventId: EVENT_ID,
        memberId: MEMBER_ID,
        ministryId: WORSHIP_ID,
        roleLabel: "sound booth",
        staffNote: "Do not put this secret in audit",
      }),
    ).resolves.toEqual({ status: "DUPLICATE" });
    expect(store.lastCreateData).toBeNull();
  });

  it("creates a scheduled assignment and keeps staff notes out of audit text", async () => {
    store.assignments = [];
    const result = await createVolunteerServiceAssignment({
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      roleLabel: "Sound Booth",
      staffNote: "Ask for the hallway key",
      organizationId: OTHER_ORG,
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      roleLabel: "Sound Booth",
      staffNote: "Ask for the hallway key",
    });
    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      changes: Array<{ field: string; newValue: string | null }>;
    };
    expect(JSON.stringify(audit)).not.toContain("Ask for the hallway key");
    expect(audit.changes).toContainEqual({
      field: "staffNote",
      oldValue: null,
      newValue: "set",
    });
  });

  it("cancels without deleting and omits cancellation note text from audit", async () => {
    const result = await cancelVolunteerServiceAssignment({
      assignmentId: ASSIGNMENT_ID,
      cancellationNote: "Family emergency details",
    });
    expect(result).toEqual({ status: "CANCELLED" });
    expect(store.assignments[0]).toMatchObject({
      id: ASSIGNMENT_ID,
      status: "CANCELLED",
      cancellationNote: "Family emergency details",
    });
    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      action: string;
      changes: Array<{ field: string; newValue: string | null }>;
    };
    expect(audit.action).toBe("CANCEL_VOLUNTEER_SERVICE_ASSIGNMENT");
    expect(JSON.stringify(audit)).not.toContain("Family emergency details");
    expect(audit.changes).toContainEqual({
      field: "cancellationNote",
      oldValue: null,
      newValue: "set",
    });
  });
});

describe("member volunteer service schedule", () => {
  it("returns pending and empty states for linked-member access", async () => {
    store.members[0]!.userAccountId = null;
    await expect(getMemberVolunteerSchedule()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: "ann@church.test",
    });

    store.members[0]!.userAccountId = USER_ID;
    store.assignments = [];
    await expect(getMemberVolunteerSchedule()).resolves.toEqual({
      status: "READY",
      rows: [],
    });
    expect(store.lastMemberWhere).toMatchObject({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
  });

  it("shows only the signed-in member’s upcoming scheduled assignments", async () => {
    store.assignments.push({
      id: "00000000-0000-4000-8000-00000000b003",
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: OTHER_MEMBER,
      ministryId: null,
      createdByUserId: USER_ID,
      roleLabel: "Nursery",
      status: "SCHEDULED",
      staffNote: "other volunteer note",
      cancellationNote: null,
      cancelledAt: null,
      cancelledByUserId: null,
      createdAt: new Date("2026-09-21T12:00:00.000Z"),
    });

    const result = await getMemberVolunteerSchedule();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") throw new Error("expected READY");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      assignmentId: ASSIGNMENT_ID,
      eventTitle: "Sunday Worship",
      ministryName: "Worship Team",
      roleLabel: "Sound Booth",
      location: "Main Sanctuary · Sanctuary · Saco, ME",
    });
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...MEMBER_VOLUNTEER_SCHEDULE_ROW_FIELDS].sort(),
    );
    expect(store.lastAssignmentWhere).toMatchObject({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
    });
  });

  it("hides staff-only notes and other-organization data from members", async () => {
    const result = await getMemberVolunteerSchedule();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Ask for the hallway key");
    expect(serialized).not.toContain("https://internal.example/meet");
    expect(serialized).not.toContain("ann@church.test");
    expect(serialized).not.toContain(MEMBER_ID);
    expect(serialized).not.toContain(OTHER_ASSIGNMENT);
    expect(serialized).not.toContain("Other Church Service");
    expect(serialized).not.toContain("other church note");
    expect(JSON.stringify(store.lastAssignmentSelect)).not.toMatch(
      /staffNote|cancellationNote|email|onlineMeetingUrl/,
    );
  });
});
