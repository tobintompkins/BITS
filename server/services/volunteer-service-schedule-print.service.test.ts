import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  UNASSIGNED_MINISTRY_LABEL,
  VOLUNTEER_SERVICE_SCHEDULE_PRINT_ASSIGNMENT_FIELDS,
  VOLUNTEER_SERVICE_SCHEDULE_PRINT_EVENT_FIELDS,
  VOLUNTEER_SERVICE_SCHEDULE_PRINT_GROUP_FIELDS,
  groupVolunteerServiceSchedulePrintAssignments,
} from "@/lib/validation/volunteer-service-schedule-print";

type LocationRow = {
  name: string;
  roomName: string | null;
  isOnline: boolean;
  city: string | null;
  state: string | null;
  address1?: string;
  onlineMeetingUrl?: string;
};

type EventRow = {
  id: string;
  organizationId: string;
  title: string;
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
  preferredName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  email: string;
  phone: string;
};

type MinistryRow = {
  id: string;
  name: string;
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
  memberConfirmedAt: Date | null;
};

const store = vi.hoisted(() => ({
  events: [] as EventRow[],
  members: [] as MemberRow[],
  ministries: [] as MinistryRow[],
  assignments: [] as AssignmentRow[],
  lastEventWhere: null as unknown,
  lastEventSelect: null as unknown,
  lastAssignmentWhere: null as unknown,
  lastAssignmentSelect: null as unknown,
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
    event: {
      findFirst: async ({
        where,
        select,
      }: {
        where: { id: string; organizationId: string };
        select?: unknown;
      }) => {
        store.lastEventWhere = where;
        store.lastEventSelect = select;
        const event = store.events.find(
          (item) =>
            item.id === where.id && item.organizationId === where.organizationId,
        );
        if (!event) return null;
        return {
          id: event.id,
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
        };
      },
    },
    volunteerServiceAssignment: {
      findMany: async ({
        where,
        select,
      }: {
        where: { organizationId: string; eventId: string };
        select?: unknown;
      }) => {
        store.lastAssignmentWhere = where;
        store.lastAssignmentSelect = select;
        return store.assignments
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.eventId === where.eventId,
          )
          .map((row) => {
            const member = store.members.find((item) => item.id === row.memberId)!;
            const ministry = row.ministryId
              ? store.ministries.find((item) => item.id === row.ministryId)
              : null;
            return {
              roleLabel: row.roleLabel,
              status: row.status,
              memberConfirmedAt: row.memberConfirmedAt,
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
    },
  },
}));

import { getVolunteerServiceSchedulePrint } from "./volunteer-service-schedule-print.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_ORG_EVENT = "00000000-0000-4000-8000-00000000e002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const THIRD_MEMBER = "00000000-0000-4000-8000-00000000m003";
const WORSHIP_ID = "00000000-0000-4000-8000-00000000f001";
const KIDS_ID = "00000000-0000-4000-8000-00000000f002";
const OWN_EMAIL = "ann@church.test";
const CONFIRMED_AT = new Date("2026-09-24T16:00:00.000Z");

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
      preferredName: "Ann",
      firstName: "Annabelle",
      middleName: null,
      lastName: "Adams",
      suffix: null,
      email: OWN_EMAIL,
      phone: "207-555-0100",
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      preferredName: null,
      firstName: "Blake",
      middleName: null,
      lastName: "Baker",
      suffix: null,
      email: "blake@church.test",
      phone: "207-555-0199",
    },
    {
      id: THIRD_MEMBER,
      organizationId: ORG_ID,
      preferredName: null,
      firstName: "Cara",
      middleName: null,
      lastName: "Cole",
      suffix: null,
      email: "cara@church.test",
      phone: "207-555-0142",
    },
  ];
  store.ministries = [
    { id: WORSHIP_ID, name: "Worship Team" },
    { id: KIDS_ID, name: "Children's Ministry" },
  ];
  store.events = [
    {
      id: EVENT_ID,
      organizationId: ORG_ID,
      title: "Sunday Worship",
      startDateTime: new Date("2026-09-27T14:30:00.000Z"),
      endDateTime: new Date("2026-09-27T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
      contactEmail: "staff-only@church.test",
      contactPhone: "207-555-0111",
      location: {
        name: "Main Sanctuary",
        roomName: "Sanctuary",
        isOnline: false,
        city: "Saco",
        state: "ME",
        address1: "100 Secret Staff Street",
        onlineMeetingUrl: "https://zoom.example/secret",
      },
    },
    {
      id: OTHER_ORG_EVENT,
      organizationId: OTHER_ORG,
      title: "Other Church Revival",
      startDateTime: new Date("2026-09-28T18:00:00.000Z"),
      endDateTime: new Date("2026-09-28T20:00:00.000Z"),
      timezone: "America/Chicago",
      isAllDay: false,
      location: null,
    },
  ];
  store.assignments = [
    {
      id: "00000000-0000-4000-8000-00000000d001",
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: OTHER_MEMBER,
      ministryId: WORSHIP_ID,
      roleLabel: "Sound Booth",
      status: "SCHEDULED",
      staffNote: "Ask for the hallway key",
      cancellationNote: null,
      memberConfirmedAt: CONFIRMED_AT,
    },
    {
      id: "00000000-0000-4000-8000-00000000d002",
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      roleLabel: "Greeter",
      status: "SCHEDULED",
      staffNote: "other volunteer staff note",
      cancellationNote: null,
      memberConfirmedAt: null,
    },
    {
      id: "00000000-0000-4000-8000-00000000d003",
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: THIRD_MEMBER,
      ministryId: null,
      roleLabel: "Security",
      status: "CANCELLED",
      staffNote: null,
      cancellationNote: "family schedule conflict",
      memberConfirmedAt: null,
    },
    {
      id: "00000000-0000-4000-8000-00000000d004",
      organizationId: OTHER_ORG,
      eventId: OTHER_ORG_EVENT,
      memberId: MEMBER_ID,
      ministryId: null,
      roleLabel: "Host",
      status: "SCHEDULED",
      staffNote: "other church note",
      cancellationNote: null,
      memberConfirmedAt: null,
    },
  ];
  store.lastEventWhere = null;
  store.lastEventSelect = null;
  store.lastAssignmentWhere = null;
  store.lastAssignmentSelect = null;
}

describe("volunteer service schedule print", () => {
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
      displayName: "First UPC of Saco",
    });
    mocks.getMemberEngagementAccess.mockResolvedValue(staffAccess());
  });

  it("denies signed-out and unauthorized users without looking up an event", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getVolunteerServiceSchedulePrint(EVENT_ID)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastEventWhere).toBeNull();

    mocks.getMemberEngagementAccess.mockResolvedValue(
      staffAccess({ canManageMinistryRosters: false }),
    );
    await expect(getVolunteerServiceSchedulePrint(EVENT_ID)).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    expect(store.lastEventWhere).toBeNull();
  });

  it("scopes the event lookup to the current organization and ignores client ids", async () => {
    await getVolunteerServiceSchedulePrint({
      eventId: EVENT_ID,
      organizationId: OTHER_ORG,
      memberId: MEMBER_ID,
    });
    expect(store.lastEventWhere).toEqual({
      id: EVENT_ID,
      organizationId: ORG_ID,
    });
    expect(store.lastAssignmentWhere).toEqual({
      organizationId: ORG_ID,
      eventId: EVENT_ID,
    });
    expect(JSON.stringify(store.lastEventWhere)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(store.lastAssignmentWhere)).not.toContain(OTHER_ORG);
  });

  it("does not reveal another organization's event", async () => {
    await expect(
      getVolunteerServiceSchedulePrint(OTHER_ORG_EVENT),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(getVolunteerServiceSchedulePrint("not-a-uuid")).resolves.toEqual({
      status: "NOT_FOUND",
    });
    expect(store.lastAssignmentWhere).toBeNull();
  });

  it("returns grouped printable rows with confirmation state", async () => {
    const result = await getVolunteerServiceSchedulePrint(EVENT_ID);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.churchName).toBe("First UPC of Saco");
    expect(result.eventTitle).toBe("Sunday Worship");
    expect(result.startsAtLabel).toBe("Sun, Sep 27, 2026, 10:30 AM – 12:00 PM");
    expect(result.location).toBe("Main Sanctuary · Sanctuary · Saco, ME");
    expect(result.groups.map((group) => group.ministryName)).toEqual([
      "Worship Team",
      UNASSIGNED_MINISTRY_LABEL,
    ]);
    expect(result.groups[0]!.assignments.map((row) => row.memberName)).toEqual([
      "Ann Adams",
      "Blake Baker",
    ]);
    expect(result.groups[0]!.assignments[0]).toMatchObject({
      roleLabel: "Greeter",
      statusLabel: "Scheduled",
      confirmationLabel: "Awaiting confirmation",
    });
    expect(result.groups[0]!.assignments[1]!.confirmationLabel).toContain(
      "Confirmed",
    );
    expect(result.groups[1]!.assignments[0]).toMatchObject({
      roleLabel: "Security",
      memberName: "Cara Cole",
      statusLabel: "Cancelled",
      confirmationLabel: "—",
    });
  });

  it("keeps printable fields on a safe allow-list", async () => {
    const result = await getVolunteerServiceSchedulePrint(EVENT_ID);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(
      Object.keys(result)
        .filter((key) => key !== "status" && key !== "groups")
        .sort(),
    ).toEqual([...VOLUNTEER_SERVICE_SCHEDULE_PRINT_EVENT_FIELDS].sort());
    expect(Object.keys(result.groups[0]!).sort()).toEqual(
      [...VOLUNTEER_SERVICE_SCHEDULE_PRINT_GROUP_FIELDS].sort(),
    );
    expect(Object.keys(result.groups[0]!.assignments[0]!).sort()).toEqual(
      [...VOLUNTEER_SERVICE_SCHEDULE_PRINT_ASSIGNMENT_FIELDS].sort(),
    );
  });

  it("sorts ministries and people consistently, with unassigned last", () => {
    const groups = groupVolunteerServiceSchedulePrintAssignments([
      {
        ministryName: null,
        roleLabel: "Security",
        memberName: "Cara Cole",
        statusLabel: "Scheduled",
        confirmationLabel: "Awaiting confirmation",
      },
      {
        ministryName: "Worship Team",
        roleLabel: "Sound Booth",
        memberName: "Blake Baker",
        statusLabel: "Scheduled",
        confirmationLabel: "Confirmed",
      },
      {
        ministryName: "Children's Ministry",
        roleLabel: "Nursery",
        memberName: "Ann Adams",
        statusLabel: "Scheduled",
        confirmationLabel: "Awaiting confirmation",
      },
      {
        ministryName: "Worship Team",
        roleLabel: "Greeter",
        memberName: "Zed Young",
        statusLabel: "Scheduled",
        confirmationLabel: "Awaiting confirmation",
      },
    ]);
    expect(groups.map((group) => group.ministryName)).toEqual([
      "Children's Ministry",
      "Worship Team",
      UNASSIGNED_MINISTRY_LABEL,
    ]);
    expect(groups[1]!.assignments.map((row) => row.roleLabel)).toEqual([
      "Greeter",
      "Sound Booth",
    ]);
  });

  it("returns an empty grouped list when the event has no volunteers", async () => {
    store.assignments = [];
    const result = await getVolunteerServiceSchedulePrint(EVENT_ID);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.groups).toEqual([]);
  });

  it("excludes private contact, staff notes, and internal ids from the payload", async () => {
    const result = await getVolunteerServiceSchedulePrint(EVENT_ID);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(OWN_EMAIL);
    expect(serialized).not.toContain("blake@church.test");
    expect(serialized).not.toContain("207-555-0100");
    expect(serialized).not.toContain("staff-only@church.test");
    expect(serialized).not.toContain("Ask for the hallway key");
    expect(serialized).not.toContain("family schedule conflict");
    expect(serialized).not.toContain("100 Secret Staff Street");
    expect(serialized).not.toContain("https://zoom.example/secret");
    expect(serialized).not.toContain(MEMBER_ID);
    expect(serialized).not.toContain(EVENT_ID);
    expect(serialized).not.toContain("Other Church Revival");
    expect(JSON.stringify(store.lastEventSelect)).not.toMatch(
      /contactEmail|contactPhone|address1|onlineMeetingUrl/,
    );
    expect(JSON.stringify(store.lastAssignmentSelect)).not.toMatch(
      /staffNote|cancellationNote|email|phone/,
    );
  });
});
