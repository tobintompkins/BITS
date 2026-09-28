import { beforeEach, describe, expect, it, vi } from "vitest";

import { escapeIcsText, foldIcsLine } from "@/lib/calendar/ics";
import {
  volunteerAssignmentCalendarUnavailableReason,
  volunteerAssignmentCanAddToCalendar,
} from "@/lib/validation/member-volunteer-service-calendar";

type LocationRow = {
  name: string;
  roomName: string | null;
  isOnline: boolean;
  city: string | null;
  state: string | null;
  address1?: string;
  onlineMeetingUrl?: string;
  capacity?: number;
};

type EventRow = {
  id: string;
  organizationId: string;
  title: string;
  shortDescription: string | null;
  description?: string | null;
  eventStatus: string;
  startDateTime: Date;
  endDateTime: Date;
  timezone: string;
  isAllDay: boolean;
  contactEmail?: string;
  contactPhone?: string;
  location: LocationRow | null;
};

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  email: string;
};

type AssignmentRow = {
  id: string;
  organizationId: string;
  eventId: string;
  memberId: string;
  ministryId: string | null;
  roleLabel: string;
  status: "SCHEDULED" | "CANCELLED";
  staffNote: string | null;
  cancellationNote: string | null;
};

type MinistryRow = {
  id: string;
  name: string;
};

type SubstituteRow = {
  assignmentId: string;
  memberReason: string;
  staffResolutionNote: string;
};

type TimeOffRow = {
  memberId: string;
  memberReason: string;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  events: [] as EventRow[],
  assignments: [] as AssignmentRow[],
  ministries: [] as MinistryRow[],
  substitutes: [] as SubstituteRow[],
  timeOff: [] as TimeOffRow[],
  lastMemberWhere: null as unknown,
  lastFindWhere: null as unknown,
  lastFindSelect: null as unknown,
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
    volunteerServiceAssignment: {
      findFirst: async ({
        where,
        select,
      }: {
        where: {
          id: string;
          organizationId: string;
          memberId: string;
          status: string;
          event?: {
            organizationId: string;
            eventStatus: { in: string[] };
            endDateTime: { gte: Date };
          };
        };
        select: unknown;
      }) => {
        store.lastFindWhere = where;
        store.lastFindSelect = select;
        const row = store.assignments.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.memberId === where.memberId &&
            item.status === where.status,
        );
        if (!row) return null;
        const event = store.events.find((item) => item.id === row.eventId);
        if (!event) return null;
        if (where.event && !matchesUpcoming(event, where.event)) {
          return null;
        }
        const ministry = row.ministryId
          ? store.ministries.find((item) => item.id === row.ministryId)
          : null;
        return {
          roleLabel: row.roleLabel,
          event: {
            title: event.title,
            startDateTime: event.startDateTime,
            endDateTime: event.endDateTime,
            timezone: event.timezone,
            isAllDay: event.isAllDay,
            location: event.location
              ? {
                  name: event.location.name,
                  roomName: event.location.roomName,
                  isOnline: event.location.isOnline,
                  city: event.location.city,
                  state: event.location.state,
                }
              : null,
          },
          ministry: ministry ? { name: ministry.name } : null,
        };
      },
    },
  },
}));

import {
  getMemberVolunteerServiceCalendar,
  volunteerAssignmentCalendarUid,
} from "./member-volunteer-service-calendar.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_ORG_EVENT = "00000000-0000-4000-8000-00000000e002";
const PAST_EVENT = "00000000-0000-4000-8000-00000000e003";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const MINISTRY_ID = "00000000-0000-4000-8000-00000000f001";
const OWN_ASSIGNMENT = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER_ASSIGNMENT = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_ASSIGNMENT = "00000000-0000-4000-8000-00000000d003";
const CANCELLED_ASSIGNMENT = "00000000-0000-4000-8000-00000000d004";
const PAST_ASSIGNMENT = "00000000-0000-4000-8000-00000000d005";
const NOW = new Date("2026-09-24T16:30:00.000Z");
const OWN_EMAIL = "ann@church.test";

function seed() {
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      email: OWN_EMAIL,
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      recordStatus: "ACTIVE",
      email: "other@church.test",
    },
  ];
  store.ministries = [{ id: MINISTRY_ID, name: "Children's Ministry" }];
  store.events = [
    {
      id: EVENT_ID,
      organizationId: ORG_ID,
      title: "Sunday Worship; Fellowship, and Prayer",
      shortDescription: "Join us this Sunday.\nBring a friend.",
      description: "Internal long description with donor notes.",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-04T14:30:00.000Z"),
      endDateTime: new Date("2026-10-04T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      contactEmail: "staff-only@church.test",
      contactPhone: "207-555-0199",
      location: {
        name: "Main Sanctuary",
        roomName: "Sanctuary",
        isOnline: false,
        city: "Saco",
        state: "ME",
        address1: "100 Secret Staff Street",
        onlineMeetingUrl: "https://zoom.example/secret",
        capacity: 400,
      },
    },
    {
      id: OTHER_ORG_EVENT,
      organizationId: OTHER_ORG,
      title: "Other Church Revival",
      shortDescription: "Not your church.",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-10T18:00:00.000Z"),
      endDateTime: new Date("2026-10-10T20:00:00.000Z"),
      timezone: "America/Chicago",
      isAllDay: false,
      location: null,
    },
    {
      id: PAST_EVENT,
      organizationId: ORG_ID,
      title: "Past Sunday Service",
      shortDescription: null,
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-20T14:30:00.000Z"),
      endDateTime: new Date("2026-09-20T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      location: null,
    },
  ];
  store.assignments = [
    {
      id: OWN_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      ministryId: MINISTRY_ID,
      roleLabel: "Greeter",
      status: "SCHEDULED",
      staffNote: "staff only assignment memo",
      cancellationNote: null,
    },
    {
      id: OTHER_MEMBER_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: OTHER_MEMBER,
      ministryId: MINISTRY_ID,
      roleLabel: "Usher",
      status: "SCHEDULED",
      staffNote: "other volunteer staff note",
      cancellationNote: null,
    },
    {
      id: OTHER_ORG_ASSIGNMENT,
      organizationId: OTHER_ORG,
      eventId: OTHER_ORG_EVENT,
      memberId: MEMBER_ID,
      ministryId: null,
      roleLabel: "Host",
      status: "SCHEDULED",
      staffNote: null,
      cancellationNote: null,
    },
    {
      id: CANCELLED_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      ministryId: MINISTRY_ID,
      roleLabel: "Greeter",
      status: "CANCELLED",
      staffNote: null,
      cancellationNote: "family schedule conflict",
    },
    {
      id: PAST_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: PAST_EVENT,
      memberId: MEMBER_ID,
      ministryId: MINISTRY_ID,
      roleLabel: "Greeter",
      status: "SCHEDULED",
      staffNote: null,
      cancellationNote: null,
    },
  ];
  store.substitutes = [
    {
      assignmentId: OWN_ASSIGNMENT,
      memberReason: "need a substitute this week",
      staffResolutionNote: "calling another usher privately",
    },
  ];
  store.timeOff = [
    {
      memberId: MEMBER_ID,
      memberReason: "vacation in October",
    },
  ];
  store.lastMemberWhere = null;
  store.lastFindWhere = null;
  store.lastFindSelect = null;
}

describe("member volunteer service calendar", () => {
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
  });

  it("denies signed-out members without looking up a member or assignment", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(
      getMemberVolunteerServiceCalendar(OWN_ASSIGNMENT, NOW),
    ).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();
  });

  it("denies a pending member connection without looking up an assignment", async () => {
    store.members = [];
    await expect(
      getMemberVolunteerServiceCalendar(OWN_ASSIGNMENT, NOW),
    ).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(store.lastFindWhere).toBeNull();
  });

  it("scopes the lookup to the current organization and linked member", async () => {
    await getMemberVolunteerServiceCalendar(
      {
        assignmentId: OWN_ASSIGNMENT,
        userId: OTHER_USER,
        userAccountId: OTHER_USER,
        organizationId: OTHER_ORG,
        memberId: OTHER_MEMBER,
        eventId: OTHER_ORG_EVENT,
      },
      NOW,
    );
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(store.lastFindWhere).toEqual({
      id: OWN_ASSIGNMENT,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
      event: {
        organizationId: ORG_ID,
        eventStatus: { in: ["DRAFT", "PUBLISHED"] },
        endDateTime: { gte: NOW },
      },
    });
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OTHER_USER);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OTHER_USER);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OTHER_MEMBER);
  });

  it("does not return another member's or another organization's assignment", async () => {
    await expect(
      getMemberVolunteerServiceCalendar(OTHER_MEMBER_ASSIGNMENT, NOW),
    ).resolves.toEqual({
      status: "NOT_FOUND",
    });
    await expect(
      getMemberVolunteerServiceCalendar(OTHER_ORG_ASSIGNMENT, NOW),
    ).resolves.toEqual({
      status: "NOT_FOUND",
    });
  });

  it("denies cancelled and past assignments", async () => {
    await expect(
      getMemberVolunteerServiceCalendar(CANCELLED_ASSIGNMENT, NOW),
    ).resolves.toEqual({
      status: "NOT_FOUND",
    });
    await expect(
      getMemberVolunteerServiceCalendar(PAST_ASSIGNMENT, NOW),
    ).resolves.toEqual({
      status: "NOT_FOUND",
    });
    expect(volunteerAssignmentCanAddToCalendar("SCHEDULED")).toBe(true);
    expect(volunteerAssignmentCanAddToCalendar("CANCELLED")).toBe(false);
    expect(volunteerAssignmentCalendarUnavailableReason("CANCELLED")).toBe(
      "This cancelled assignment cannot be added to a calendar.",
    );
  });

  it("treats an invalid assignment id as not found without looking it up", async () => {
    await expect(
      getMemberVolunteerServiceCalendar("not-a-uuid", NOW),
    ).resolves.toEqual({
      status: "NOT_FOUND",
    });
    expect(store.lastFindWhere).toBeNull();
  });

  it("returns a safe ICS file and download headers for an eligible assignment", async () => {
    const result = await getMemberVolunteerServiceCalendar(OWN_ASSIGNMENT, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;

    expect(result.fileName).toBe("sunday-worship-fellowship-and-prayer.ics");
    expect(result.headers).toEqual({
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="sunday-worship-fellowship-and-prayer.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    expect(result.ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(result.ics).toContain("BEGIN:VEVENT");
    expect(result.ics).toContain("END:VEVENT");
    expect(result.ics).toContain("END:VCALENDAR");
    expect(result.ics).toContain(
      `UID:${volunteerAssignmentCalendarUid(OWN_ASSIGNMENT)}`,
    );
    expect(result.ics).toContain("DTSTAMP:20260924T163000Z");
    expect(result.ics).toContain("DTSTART;TZID=America/New_York:20261004T103000");
    expect(result.ics).toContain("DTEND;TZID=America/New_York:20261004T120000");
    expect(result.ics).toContain(
      "SUMMARY:Sunday Worship\\; Fellowship\\, and Prayer",
    );
    expect(result.ics).toContain("DESCRIPTION:Children's Ministry · Greeter");
    expect(result.ics).toContain(
      "LOCATION:Main Sanctuary · Sanctuary · Saco\\, ME",
    );
    expect(store.lastFindSelect).toEqual({
      roleLabel: true,
      event: {
        select: {
          title: true,
          startDateTime: true,
          endDateTime: true,
          timezone: true,
          isAllDay: true,
          location: {
            select: {
              name: true,
              roomName: true,
              isOnline: true,
              city: true,
              state: true,
            },
          },
        },
      },
      ministry: {
        select: { name: true },
      },
    });
  });

  it("escapes and folds iCalendar text fields", () => {
    expect(escapeIcsText("A;B,C\nD\\E")).toBe("A\\;B\\,C\\nD\\\\E");
    const long = `DESCRIPTION:${"Church gathering. ".repeat(20)}`;
    const folded = foldIcsLine(long);
    expect(folded).toContain("\r\n ");
    expect(
      folded.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75),
    ).toBe(true);
  });

  it("excludes private, staff, substitute, and other-volunteer fields from the ICS payload", async () => {
    const result = await getMemberVolunteerServiceCalendar(OWN_ASSIGNMENT, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const text = result.ics;
    expect(text).not.toContain(OWN_EMAIL);
    expect(text).not.toContain("staff-only@church.test");
    expect(text).not.toContain("207-555-0199");
    expect(text).not.toContain("staff only assignment memo");
    expect(text).not.toContain("family schedule conflict");
    expect(text).not.toContain("need a substitute this week");
    expect(text).not.toContain("calling another usher privately");
    expect(text).not.toContain("vacation in October");
    expect(text).not.toContain("Usher");
    expect(text).not.toContain("Internal long description");
    expect(text).not.toContain("100 Secret Staff Street");
    expect(text).not.toContain("https://zoom.example/secret");
    expect(text).not.toContain(USER_ID);
    expect(text).not.toContain(MEMBER_ID);
    expect(text).not.toContain(OWN_ASSIGNMENT);
    expect(text).not.toContain(EVENT_ID);
    expect(text).not.toContain(OTHER_MEMBER);
    expect(text).not.toMatch(/ATTENDEE/);
    expect(text).not.toMatch(/ORGANIZER/);
    expect(text).not.toMatch(/staffNote/);
    expect(text).not.toMatch(/memberId/);
    expect(text).not.toMatch(/assignmentId/);
  });

  it("builds an all-day event with exclusive DATE values", async () => {
    store.events[0] = {
      ...store.events[0],
      isAllDay: true,
      startDateTime: new Date("2026-10-04T00:00:00.000Z"),
      endDateTime: new Date("2026-10-04T23:59:00.000Z"),
      timezone: "UTC",
    };
    const result = await getMemberVolunteerServiceCalendar(OWN_ASSIGNMENT, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.ics).toContain("DTSTART;VALUE=DATE:20261004");
    expect(result.ics).toContain("DTEND;VALUE=DATE:20261005");
  });
});
