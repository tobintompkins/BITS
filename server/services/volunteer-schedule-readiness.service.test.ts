import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  VOLUNTEER_SCHEDULE_READINESS_ATTENTION_FIELDS,
  volunteerScheduleReadinessEventWhere,
  staffVolunteerScheduleNavItems,
} from "@/lib/validation/volunteer-schedule-readiness";

type EventRow = {
  id: string;
  organizationId: string;
  title: string;
  eventStatus: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
};

type AssignmentRow = {
  id: string;
  organizationId: string;
  eventId: string;
  memberId: string;
  status: "SCHEDULED" | "CANCELLED";
  staffNote: string | null;
  memberConfirmedAt: Date | null;
};

type SubstituteRow = {
  id: string;
  organizationId: string;
  assignmentId: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DECLINED" | "CANCELLED";
  memberReason: string | null;
  staffResolutionNote: string | null;
};

type TimeOffRow = {
  id: string;
  organizationId: string;
  memberId: string;
  startDate: Date;
  endDate: Date;
  status: "OPEN" | "IN_REVIEW" | "APPROVED" | "DECLINED" | "CANCELLED";
  memberReason: string | null;
};

type MemberRow = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const store = vi.hoisted(() => ({
  events: [] as EventRow[],
  assignments: [] as AssignmentRow[],
  substitutes: [] as SubstituteRow[],
  timeOff: [] as TimeOffRow[],
  members: [] as MemberRow[],
  lastAssignmentWhere: null as unknown,
  lastAssignmentSelect: null as unknown,
  lastSubstituteWhere: null as unknown,
  lastSubstituteSelect: null as unknown,
  lastTimeOffWhere: null as unknown,
  lastTimeOffSelect: null as unknown,
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

function matchesEventWhere(
  event: EventRow,
  where: {
    organizationId?: string;
    eventStatus?: { in: string[] };
    endDateTime?: { gte: Date };
    startDateTime?: { lte: Date };
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
  if (where.startDateTime?.lte && event.startDateTime > where.startDateTime.lte) {
    return false;
  }
  return true;
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    volunteerServiceAssignment: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          status: string;
          event?: {
            organizationId: string;
            eventStatus: { in: string[] };
            endDateTime: { gte: Date };
            startDateTime: { lte: Date };
          };
        };
        select?: unknown;
      }) => {
        store.lastAssignmentWhere = where;
        store.lastAssignmentSelect = select;
        return store.assignments
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.status && row.status !== where.status) return false;
            if (where.event) {
              const event = store.events.find((item) => item.id === row.eventId);
              if (!event || !matchesEventWhere(event, where.event)) return false;
            }
            return true;
          })
          .map((row) => {
            const event = store.events.find((item) => item.id === row.eventId)!;
            return {
              id: row.id,
              memberConfirmedAt: row.memberConfirmedAt,
              event: {
                id: event.id,
                title: event.title,
                startDateTime: event.startDateTime,
                endDateTime: event.endDateTime,
                timezone: event.timezone,
                isAllDay: event.isAllDay,
              },
            };
          });
      },
    },
    volunteerSubstituteRequest: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          status: { in: string[] };
          assignment?: {
            organizationId: string;
            status: string;
            event?: {
              organizationId: string;
              eventStatus: { in: string[] };
              endDateTime: { gte: Date };
              startDateTime: { lte: Date };
            };
          };
        };
        select?: unknown;
      }) => {
        store.lastSubstituteWhere = where;
        store.lastSubstituteSelect = select;
        return store.substitutes
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.status?.in && !where.status.in.includes(row.status)) {
              return false;
            }
            const assignment = store.assignments.find(
              (item) => item.id === row.assignmentId,
            );
            if (!assignment || !where.assignment) return false;
            if (assignment.organizationId !== where.assignment.organizationId) {
              return false;
            }
            if (assignment.status !== where.assignment.status) return false;
            if (where.assignment.event) {
              const event = store.events.find(
                (item) => item.id === assignment.eventId,
              );
              if (!event || !matchesEventWhere(event, where.assignment.event)) {
                return false;
              }
            }
            return true;
          })
          .map((row) => {
            const assignment = store.assignments.find(
              (item) => item.id === row.assignmentId,
            )!;
            return {
              assignmentId: row.assignmentId,
              assignment: { eventId: assignment.eventId },
            };
          });
      },
    },
    volunteerTimeOffRequest: {
      findMany: async ({
        where,
        select,
      }: {
        where: { organizationId: string; status: string };
        select?: unknown;
      }) => {
        store.lastTimeOffWhere = where;
        store.lastTimeOffSelect = select;
        return store.timeOff
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.status === where.status,
          )
          .map((row) => ({
            startDate: row.startDate,
            endDate: row.endDate,
          }));
      },
    },
  },
}));

import { getVolunteerScheduleReadiness } from "./volunteer-schedule-readiness.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const LATER_EVENT = "00000000-0000-4000-8000-00000000e002";
const FAR_EVENT = "00000000-0000-4000-8000-00000000e003";
const PAST_EVENT = "00000000-0000-4000-8000-00000000e004";
const CANCELLED_EVENT = "00000000-0000-4000-8000-00000000e005";
const OTHER_ORG_EVENT = "00000000-0000-4000-8000-00000000e006";
const OWN_ASSIGNMENT = "00000000-0000-4000-8000-00000000d001";
const CONFIRMED_ASSIGNMENT = "00000000-0000-4000-8000-00000000d002";
const LATER_ASSIGNMENT = "00000000-0000-4000-8000-00000000d003";
const FAR_ASSIGNMENT = "00000000-0000-4000-8000-00000000d004";
const PAST_ASSIGNMENT = "00000000-0000-4000-8000-00000000d005";
const CANCELLED_ASSIGNMENT = "00000000-0000-4000-8000-00000000d006";
const OTHER_ORG_ASSIGNMENT = "00000000-0000-4000-8000-00000000d007";
const NOW = new Date("2026-09-25T12:00:00.000Z");
const OWN_EMAIL = "ann@church.test";

function staffAccess(overrides?: { canManageMinistryRosters?: boolean }) {
  return {
    canManageMinistryRosters: overrides?.canManageMinistryRosters ?? true,
  };
}

function seed() {
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      firstName: "Ann",
      lastName: "Adams",
      email: OWN_EMAIL,
      phone: "207-555-0100",
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      firstName: "Blake",
      lastName: "Baker",
      email: "blake@church.test",
      phone: "207-555-0199",
    },
  ];
  store.events = [
    {
      id: EVENT_ID,
      organizationId: ORG_ID,
      title: "Sunday Worship",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-27T14:30:00.000Z"),
      endDateTime: new Date("2026-09-27T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
    },
    {
      id: LATER_EVENT,
      organizationId: ORG_ID,
      title: "Wednesday Prayer",
      eventStatus: "DRAFT",
      startDateTime: new Date("2026-10-07T23:00:00.000Z"),
      endDateTime: new Date("2026-10-08T00:30:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
    },
    {
      id: FAR_EVENT,
      organizationId: ORG_ID,
      title: "Fall Festival",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-11-01T18:00:00.000Z"),
      endDateTime: new Date("2026-11-01T21:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
    },
    {
      id: PAST_EVENT,
      organizationId: ORG_ID,
      title: "Last Week Service",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-20T14:30:00.000Z"),
      endDateTime: new Date("2026-09-20T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
    },
    {
      id: CANCELLED_EVENT,
      organizationId: ORG_ID,
      title: "Cancelled Revival",
      eventStatus: "CANCELLED",
      startDateTime: new Date("2026-09-28T18:00:00.000Z"),
      endDateTime: new Date("2026-09-28T20:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
    },
    {
      id: OTHER_ORG_EVENT,
      organizationId: OTHER_ORG,
      title: "Other Church Revival",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-28T18:00:00.000Z"),
      endDateTime: new Date("2026-09-28T20:00:00.000Z"),
      timezone: "America/Chicago",
      isAllDay: false,
    },
  ];
  store.assignments = [
    {
      id: OWN_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
      staffNote: "Ask for the hallway key",
      memberConfirmedAt: null,
    },
    {
      id: CONFIRMED_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: OTHER_MEMBER,
      status: "SCHEDULED",
      staffNote: "other volunteer staff note",
      memberConfirmedAt: new Date("2026-09-24T16:00:00.000Z"),
    },
    {
      id: LATER_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: LATER_EVENT,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
      staffNote: null,
      memberConfirmedAt: null,
    },
    {
      id: FAR_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: FAR_EVENT,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
      staffNote: "festival setup memo",
      memberConfirmedAt: null,
    },
    {
      id: PAST_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: PAST_EVENT,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
      staffNote: null,
      memberConfirmedAt: null,
    },
    {
      id: CANCELLED_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      status: "CANCELLED",
      staffNote: "cancelled quietly",
      memberConfirmedAt: null,
    },
    {
      id: OTHER_ORG_ASSIGNMENT,
      organizationId: OTHER_ORG,
      eventId: OTHER_ORG_EVENT,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
      staffNote: "other church note",
      memberConfirmedAt: null,
    },
  ];
  store.substitutes = [
    {
      id: "00000000-0000-4000-8000-00000000s001",
      organizationId: ORG_ID,
      assignmentId: OWN_ASSIGNMENT,
      status: "OPEN",
      memberReason: "need a substitute this week",
      staffResolutionNote: null,
    },
    {
      id: "00000000-0000-4000-8000-00000000s002",
      organizationId: ORG_ID,
      assignmentId: CONFIRMED_ASSIGNMENT,
      status: "IN_REVIEW",
      memberReason: "family schedule conflict",
      staffResolutionNote: "calling another usher privately",
    },
    {
      id: "00000000-0000-4000-8000-00000000s003",
      organizationId: ORG_ID,
      assignmentId: OWN_ASSIGNMENT,
      status: "RESOLVED",
      memberReason: "old resolved reason",
      staffResolutionNote: null,
    },
    {
      id: "00000000-0000-4000-8000-00000000s004",
      organizationId: OTHER_ORG,
      assignmentId: OTHER_ORG_ASSIGNMENT,
      status: "OPEN",
      memberReason: "other church substitute",
      staffResolutionNote: null,
    },
  ];
  store.timeOff = [
    {
      id: "00000000-0000-4000-8000-00000000t001",
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      startDate: new Date("2026-09-27T00:00:00.000Z"),
      endDate: new Date("2026-09-27T00:00:00.000Z"),
      status: "APPROVED",
      memberReason: "vacation in September",
    },
    {
      id: "00000000-0000-4000-8000-00000000t002",
      organizationId: ORG_ID,
      memberId: OTHER_MEMBER,
      startDate: new Date("2026-12-01T00:00:00.000Z"),
      endDate: new Date("2026-12-05T00:00:00.000Z"),
      status: "APPROVED",
      memberReason: "December travel",
    },
    {
      id: "00000000-0000-4000-8000-00000000t003",
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      startDate: new Date("2026-09-27T00:00:00.000Z"),
      endDate: new Date("2026-09-28T00:00:00.000Z"),
      status: "OPEN",
      memberReason: "not yet approved",
    },
    {
      id: "00000000-0000-4000-8000-00000000t004",
      organizationId: OTHER_ORG,
      memberId: MEMBER_ID,
      startDate: new Date("2026-09-27T00:00:00.000Z"),
      endDate: new Date("2026-09-28T00:00:00.000Z"),
      status: "APPROVED",
      memberReason: "other church time off",
    },
  ];
  store.lastAssignmentWhere = null;
  store.lastAssignmentSelect = null;
  store.lastSubstituteWhere = null;
  store.lastSubstituteSelect = null;
  store.lastTimeOffWhere = null;
  store.lastTimeOffSelect = null;
}

describe("volunteer schedule readiness", () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: OWN_EMAIL,
    });
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church of Saco",
    });
    mocks.getMemberEngagementAccess.mockResolvedValue(staffAccess());
  });

  it("denies signed-out and unauthorized users without querying assignments", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getVolunteerScheduleReadiness(NOW)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastAssignmentWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getVolunteerScheduleReadiness(NOW)).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getMemberEngagementAccess.mockResolvedValue(
      staffAccess({ canManageMinistryRosters: false }),
    );
    await expect(getVolunteerScheduleReadiness(NOW)).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    expect(store.lastAssignmentWhere).toBeNull();
  });

  it("scopes queries to the current organization and planning window", async () => {
    await getVolunteerScheduleReadiness(NOW);
    expect(store.lastAssignmentWhere).toEqual({
      organizationId: ORG_ID,
      status: "SCHEDULED",
      event: volunteerScheduleReadinessEventWhere(ORG_ID, NOW),
    });
    expect(store.lastSubstituteWhere).toEqual({
      organizationId: ORG_ID,
      status: { in: ["OPEN", "IN_REVIEW"] },
      assignment: {
        organizationId: ORG_ID,
        status: "SCHEDULED",
        event: volunteerScheduleReadinessEventWhere(ORG_ID, NOW),
      },
    });
    expect(store.lastTimeOffWhere).toEqual({
      organizationId: ORG_ID,
      status: "APPROVED",
    });
    expect(JSON.stringify(store.lastAssignmentWhere)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(store.lastSubstituteWhere)).not.toContain(OTHER_ORG);
  });

  it("counts only upcoming scheduled services and excludes cancelled, past, and far-future rows", async () => {
    const result = await getVolunteerScheduleReadiness(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.windowDays).toBe(14);
    expect(result.counts).toEqual({
      scheduledAssignments: 3,
      confirmedAssignments: 1,
      awaitingConfirmation: 2,
      openSubstituteRequests: 2,
      overlappingApprovedTimeOff: 1,
    });
    expect(result.attention.map((row) => row.eventTitle)).toEqual([
      "Sunday Worship",
      "Wednesday Prayer",
    ]);
    expect(result.attention[0]).toEqual({
      eventTitle: "Sunday Worship",
      startsAtLabel: "Sun, Sep 27, 2026, 10:30 AM – 12:00 PM",
      awaitingConfirmationCount: 1,
      openSubstituteRequestCount: 2,
    });
    expect(result.attention[1]).toEqual({
      eventTitle: "Wednesday Prayer",
      startsAtLabel: "Wed, Oct 7, 2026, 7:00 PM – 8:30 PM",
      awaitingConfirmationCount: 1,
      openSubstituteRequestCount: 0,
    });
  });

  it("keeps the attention list on a safe field allow-list", async () => {
    const result = await getVolunteerScheduleReadiness(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.keys(result.attention[0]!).sort()).toEqual(
      [...VOLUNTEER_SCHEDULE_READINESS_ATTENTION_FIELDS].sort(),
    );
  });

  it("does not leak member, contact, reason, or staff-only details", async () => {
    const result = await getVolunteerScheduleReadiness(NOW);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(OWN_EMAIL);
    expect(serialized).not.toContain("blake@church.test");
    expect(serialized).not.toContain("207-555-0100");
    expect(serialized).not.toContain("Ann");
    expect(serialized).not.toContain("Blake");
    expect(serialized).not.toContain("Ask for the hallway key");
    expect(serialized).not.toContain("need a substitute this week");
    expect(serialized).not.toContain("vacation in September");
    expect(serialized).not.toContain("calling another usher privately");
    expect(serialized).not.toContain(MEMBER_ID);
    expect(serialized).not.toContain(OWN_ASSIGNMENT);
    expect(serialized).not.toContain(EVENT_ID);
    expect(serialized).not.toContain("Other Church Revival");
    expect(JSON.stringify(store.lastAssignmentSelect)).not.toMatch(
      /staffNote|memberId|email|phone/,
    );
    expect(JSON.stringify(store.lastSubstituteSelect)).not.toMatch(
      /memberReason|staffResolutionNote|email/,
    );
    expect(store.lastTimeOffSelect).toEqual({
      startDate: true,
      endDate: true,
    });
  });

  it("returns a healthy empty attention list when nothing needs review", async () => {
    store.assignments = [
      {
        id: CONFIRMED_ASSIGNMENT,
        organizationId: ORG_ID,
        eventId: EVENT_ID,
        memberId: OTHER_MEMBER,
        status: "SCHEDULED",
        staffNote: null,
        memberConfirmedAt: new Date("2026-09-24T16:00:00.000Z"),
      },
    ];
    store.substitutes = [];
    store.timeOff = [];
    const result = await getVolunteerScheduleReadiness(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.counts).toEqual({
      scheduledAssignments: 1,
      confirmedAssignments: 1,
      awaitingConfirmation: 0,
      openSubstituteRequests: 0,
      overlappingApprovedTimeOff: 0,
    });
    expect(result.attention).toEqual([]);
  });

  it("hides schedule-readiness navigation from unauthorized staff", () => {
    expect(staffVolunteerScheduleNavItems(false)).toEqual([]);
    const items = staffVolunteerScheduleNavItems(true);
    expect(items.map((item) => item.label)).toEqual([
      "Volunteer Schedules",
      "Schedule Readiness",
      "Volunteer Time Off",
      "Substitute Requests",
    ]);
    expect(items.map((item) => item.href)).toContain(
      "/volunteer-schedules/readiness",
    );
    expect(items.every((item) => !item.href.startsWith("/portal"))).toBe(true);
  });
});
