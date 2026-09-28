import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatVolunteerConfirmationWhen,
  memberVolunteerConfirmationState,
  staffVolunteerConfirmationLabel,
} from "@/lib/validation/volunteer-service-confirmation";

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

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  preferredName: string | null;
  firstName: string;
  lastName: string;
  email: string;
};

type AssignmentRow = {
  id: string;
  organizationId: string;
  eventId: string;
  memberId: string;
  roleLabel: string;
  status: "SCHEDULED" | "CANCELLED";
  staffNote: string | null;
  cancellationNote: string | null;
  memberConfirmedAt: Date | null;
  memberConfirmedByUserAccountId: string | null;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  events: [] as EventRow[],
  assignments: [] as AssignmentRow[],
  lastMemberWhere: null as unknown,
  lastFindWhere: null as unknown,
  lastFindSelect: null as unknown,
  lastUpdateWhere: null as unknown,
  lastUpdateData: null as unknown,
  updateCount: 0,
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
            middleName: null,
            lastName: member.lastName,
            suffix: null,
          })),
    },
    event: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          eventStatus: { in: string[] };
          endDateTime: { gte: Date };
        };
      }) =>
        store.events
          .filter((event) => matchesUpcoming(event, where))
          .map((event) => ({
            id: event.id,
            title: event.title,
            startDateTime: event.startDateTime,
            endDateTime: event.endDateTime,
            timezone: event.timezone,
            isAllDay: event.isAllDay,
          })),
    },
    ministry: {
      findMany: async () => [],
    },
    volunteerServiceAssignment: {
      findFirst: async ({
        where,
        select,
      }: {
        where: {
          id: string;
          organizationId: string;
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
        store.lastFindWhere = where;
        store.lastFindSelect = select;
        const row = store.assignments.find((item) => {
          if (item.id !== where.id) return false;
          if (item.organizationId !== where.organizationId) return false;
          if (where.memberId && item.memberId !== where.memberId) return false;
          if (where.status && item.status !== where.status) return false;
          return true;
        });
        if (!row) return null;
        if (where.event) {
          const event = store.events.find((item) => item.id === row.eventId);
          if (!event || !matchesUpcoming(event, where.event)) return null;
        }
        return {
          id: row.id,
          status: row.status,
          memberConfirmedAt: row.memberConfirmedAt,
        };
      },
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          memberId?: string;
          status?: string;
          event?: {
            organizationId: string;
            eventStatus: { in: string[] };
            endDateTime: { gte: Date };
          };
        };
      }) =>
        store.assignments
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
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
            return {
              id: row.id,
              roleLabel: row.roleLabel,
              status: row.status,
              memberConfirmedAt: row.memberConfirmedAt,
              event: {
                title: event.title,
                startDateTime: event.startDateTime,
                endDateTime: event.endDateTime,
                timezone: event.timezone,
                isAllDay: event.isAllDay,
                location: null,
              },
              member: {
                preferredName: member.preferredName,
                firstName: member.firstName,
                middleName: null,
                lastName: member.lastName,
                suffix: null,
              },
              ministry: null,
            };
          }),
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          organizationId: string;
          memberId: string;
          status: string;
          memberConfirmedAt: null;
        };
        data: {
          memberConfirmedAt: Date;
          memberConfirmedByUserAccountId: string;
        };
      }) => {
        store.lastUpdateWhere = where;
        store.lastUpdateData = data;
        const matches = store.assignments.filter(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            row.memberId === where.memberId &&
            row.status === where.status &&
            row.memberConfirmedAt === where.memberConfirmedAt,
        );
        for (const row of matches) {
          row.memberConfirmedAt = data.memberConfirmedAt;
          row.memberConfirmedByUserAccountId = data.memberConfirmedByUserAccountId;
        }
        store.updateCount = matches.length;
        return { count: matches.length };
      },
    },
  },
}));

import { confirmMemberVolunteerServiceAssignment } from "./volunteer-service-confirmation.service";
import {
  getMemberVolunteerSchedule,
  getStaffVolunteerSchedule,
} from "./volunteer-service-schedule.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const OTHER_ORG_EVENT = "00000000-0000-4000-8000-00000000e002";
const PAST_EVENT = "00000000-0000-4000-8000-00000000e003";
const OWN_ASSIGNMENT = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER_ASSIGNMENT = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_ASSIGNMENT = "00000000-0000-4000-8000-00000000d003";
const CANCELLED_ASSIGNMENT = "00000000-0000-4000-8000-00000000d004";
const PAST_ASSIGNMENT = "00000000-0000-4000-8000-00000000d005";
const NOW = new Date("2026-09-25T12:45:00.000Z");
const FIRST_CONFIRMED_AT = new Date("2026-09-24T16:00:00.000Z");
const OWN_EMAIL = "ann@church.test";

function seed() {
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      preferredName: "Ann",
      firstName: "Annabelle",
      lastName: "Adams",
      email: OWN_EMAIL,
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      recordStatus: "ACTIVE",
      preferredName: "Blake",
      firstName: "Blake",
      lastName: "Baker",
      email: "blake@church.test",
    },
  ];
  store.events = [
    {
      id: EVENT_ID,
      organizationId: ORG_ID,
      title: "Sunday Worship",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-04T14:30:00.000Z"),
      endDateTime: new Date("2026-10-04T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
    },
    {
      id: OTHER_ORG_EVENT,
      organizationId: OTHER_ORG,
      title: "Other Church Revival",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-10-10T18:00:00.000Z"),
      endDateTime: new Date("2026-10-10T20:00:00.000Z"),
      timezone: "America/Chicago",
      isAllDay: false,
    },
    {
      id: PAST_EVENT,
      organizationId: ORG_ID,
      title: "Past Sunday Service",
      eventStatus: "PUBLISHED",
      startDateTime: new Date("2026-09-20T14:30:00.000Z"),
      endDateTime: new Date("2026-09-20T16:00:00.000Z"),
      timezone: "America/New_York",
      isAllDay: false,
    },
  ];
  store.assignments = [
    {
      id: OWN_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      roleLabel: "Greeter",
      status: "SCHEDULED",
      staffNote: "staff only assignment memo",
      cancellationNote: null,
      memberConfirmedAt: null,
      memberConfirmedByUserAccountId: null,
    },
    {
      id: OTHER_MEMBER_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: OTHER_MEMBER,
      roleLabel: "Usher",
      status: "SCHEDULED",
      staffNote: "other volunteer staff note",
      cancellationNote: null,
      memberConfirmedAt: FIRST_CONFIRMED_AT,
      memberConfirmedByUserAccountId: OTHER_USER,
    },
    {
      id: OTHER_ORG_ASSIGNMENT,
      organizationId: OTHER_ORG,
      eventId: OTHER_ORG_EVENT,
      memberId: MEMBER_ID,
      roleLabel: "Host",
      status: "SCHEDULED",
      staffNote: null,
      cancellationNote: null,
      memberConfirmedAt: null,
      memberConfirmedByUserAccountId: null,
    },
    {
      id: CANCELLED_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      roleLabel: "Greeter",
      status: "CANCELLED",
      staffNote: null,
      cancellationNote: "family schedule conflict",
      memberConfirmedAt: null,
      memberConfirmedByUserAccountId: null,
    },
    {
      id: PAST_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: PAST_EVENT,
      memberId: MEMBER_ID,
      roleLabel: "Greeter",
      status: "SCHEDULED",
      staffNote: null,
      cancellationNote: null,
      memberConfirmedAt: null,
      memberConfirmedByUserAccountId: null,
    },
  ];
  store.lastMemberWhere = null;
  store.lastFindWhere = null;
  store.lastFindSelect = null;
  store.lastUpdateWhere = null;
  store.lastUpdateData = null;
  store.updateCount = 0;
}

describe("volunteer service confirmation", () => {
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
    mocks.getMemberEngagementAccess.mockResolvedValue({
      canManageMinistryRosters: true,
    });
  });

  it("denies signed-out, missing-organization, and pending members", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(
      confirmMemberVolunteerServiceAssignment(OWN_ASSIGNMENT, NOW),
    ).resolves.toEqual({ status: "SIGNED_OUT" });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(
      confirmMemberVolunteerServiceAssignment(OWN_ASSIGNMENT, NOW),
    ).resolves.toEqual({ status: "NO_ORGANIZATION" });
    expect(store.lastFindWhere).toBeNull();

    store.members = [];
    await expect(
      confirmMemberVolunteerServiceAssignment(OWN_ASSIGNMENT, NOW),
    ).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastFindWhere).toBeNull();
  });

  it("scopes confirmation to the current organization and linked member", async () => {
    await confirmMemberVolunteerServiceAssignment(
      {
        assignmentId: OWN_ASSIGNMENT,
        userId: OTHER_USER,
        userAccountId: OTHER_USER,
        organizationId: OTHER_ORG,
        memberId: OTHER_MEMBER,
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
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OTHER_USER);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(store.lastFindWhere)).not.toContain(OTHER_MEMBER);
  });

  it("rejects cancelled, past, other-member, and other-organization assignments", async () => {
    await expect(
      confirmMemberVolunteerServiceAssignment(CANCELLED_ASSIGNMENT, NOW),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(
      confirmMemberVolunteerServiceAssignment(PAST_ASSIGNMENT, NOW),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(
      confirmMemberVolunteerServiceAssignment(OTHER_MEMBER_ASSIGNMENT, NOW),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(
      confirmMemberVolunteerServiceAssignment(OTHER_ORG_ASSIGNMENT, NOW),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.lastUpdateWhere).toBeNull();
  });

  it("confirms an upcoming scheduled assignment without changing status", async () => {
    const result = await confirmMemberVolunteerServiceAssignment(
      OWN_ASSIGNMENT,
      NOW,
    );
    expect(result).toEqual({
      status: "CONFIRMED",
      alreadyConfirmed: false,
      confirmedAt: NOW,
    });
    expect(store.lastUpdateWhere).toEqual({
      id: OWN_ASSIGNMENT,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
      memberConfirmedAt: null,
    });
    expect(store.lastUpdateData).toEqual({
      memberConfirmedAt: NOW,
      memberConfirmedByUserAccountId: USER_ID,
    });
    expect(store.assignments[0]).toMatchObject({
      id: OWN_ASSIGNMENT,
      status: "SCHEDULED",
      staffNote: "staff only assignment memo",
      memberConfirmedAt: NOW,
    });
  });

  it("is idempotent and preserves the original confirmation timestamp", async () => {
    store.assignments[0]!.memberConfirmedAt = FIRST_CONFIRMED_AT;
    store.assignments[0]!.memberConfirmedByUserAccountId = USER_ID;

    const result = await confirmMemberVolunteerServiceAssignment(
      OWN_ASSIGNMENT,
      NOW,
    );
    expect(result).toEqual({
      status: "CONFIRMED",
      alreadyConfirmed: true,
      confirmedAt: FIRST_CONFIRMED_AT,
    });
    expect(store.lastUpdateWhere).toBeNull();
    expect(store.assignments[0]!.memberConfirmedAt).toEqual(FIRST_CONFIRMED_AT);
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("writes a minimal audit event without private assignment details", async () => {
    await confirmMemberVolunteerServiceAssignment(OWN_ASSIGNMENT, NOW);
    expect(mocks.createAuditEvent).toHaveBeenCalledTimes(1);
    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      action: string;
      entityType: string;
      entityId: string;
      changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>;
    };
    expect(audit).toMatchObject({
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
      action: "CONFIRM_VOLUNTEER_SERVICE_ASSIGNMENT",
      entityType: "VolunteerServiceAssignment",
      entityId: OWN_ASSIGNMENT,
    });
    expect(audit.changes).toEqual([
      { field: "memberConfirmedAt", oldValue: null, newValue: "set" },
    ]);
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("staff only assignment memo");
    expect(serialized).not.toContain("family schedule conflict");
    expect(serialized).not.toContain(OWN_EMAIL);
    expect(serialized).not.toContain("Usher");
  });

  it("shows staff confirmation state and keeps other volunteers off the member view", async () => {
    store.assignments[0]!.memberConfirmedAt = FIRST_CONFIRMED_AT;
    const staff = await getStaffVolunteerSchedule();
    expect(staff.status).toBe("READY");
    if (staff.status !== "READY") return;
    const ownRow = staff.rows.find((row) => row.assignmentId === OWN_ASSIGNMENT);
    const otherRow = staff.rows.find(
      (row) => row.assignmentId === OTHER_MEMBER_ASSIGNMENT,
    );
    expect(ownRow?.confirmationLabel).toBe(
      `Confirmed · ${formatVolunteerConfirmationWhen(FIRST_CONFIRMED_AT, "America/New_York")}`,
    );
    expect(otherRow?.confirmationLabel).toContain("Confirmed");
    expect(staff.rows.some((row) => row.assignmentId === OTHER_ORG_ASSIGNMENT)).toBe(
      false,
    );

    const member = await getMemberVolunteerSchedule();
    expect(member.status).toBe("READY");
    if (member.status !== "READY") return;
    expect(member.rows).toHaveLength(1);
    expect(member.rows[0]).toMatchObject({
      assignmentId: OWN_ASSIGNMENT,
      canConfirm: false,
    });
    expect(member.rows[0]!.confirmedAtLabel).toMatch(/^Confirmed · /);
    const serialized = JSON.stringify(member.rows);
    expect(serialized).not.toContain("Usher");
    expect(serialized).not.toContain(OTHER_MEMBER);
    expect(serialized).not.toContain("other volunteer staff note");
    expect(serialized).not.toContain(OTHER_MEMBER_ASSIGNMENT);
  });

  it("formats awaiting and confirmed labels without exposing private fields", () => {
    expect(
      staffVolunteerConfirmationLabel({
        status: "SCHEDULED",
        memberConfirmedAt: null,
      }),
    ).toBe("Awaiting confirmation");
    expect(
      staffVolunteerConfirmationLabel({
        status: "CANCELLED",
        memberConfirmedAt: null,
      }),
    ).toBe("—");
    expect(
      memberVolunteerConfirmationState(null),
    ).toEqual({ canConfirm: true, confirmedAtLabel: null });
    const confirmed = memberVolunteerConfirmationState(
      FIRST_CONFIRMED_AT,
      "America/New_York",
    );
    expect(confirmed.canConfirm).toBe(false);
    expect(confirmed.confirmedAtLabel).toContain("Confirmed");
    expect(JSON.stringify(confirmed)).not.toContain(MEMBER_ID);
    expect(JSON.stringify(confirmed)).not.toContain(USER_ID);
  });
});
