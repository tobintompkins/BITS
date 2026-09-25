import { beforeEach, describe, expect, it, vi } from "vitest";

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
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  email: string;
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
};

type RequestRow = {
  id: string;
  organizationId: string;
  assignmentId: string;
  memberId: string;
  memberReason: string | null;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DECLINED" | "CANCELLED";
  staffResolutionNote: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  createdAt: Date;
};

const store = vi.hoisted(() => ({
  events: [] as EventRow[],
  members: [] as MemberRow[],
  ministries: [] as MinistryRow[],
  assignments: [] as AssignmentRow[],
  requests: [] as RequestRow[],
  lastMemberWhere: null as unknown,
  lastAssignmentWhere: null as unknown,
  lastRequestWhere: null as unknown,
  lastRequestSelect: null as unknown,
  lastCreateData: null as unknown,
  lastAssignmentUpdate: null as unknown,
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
          userAccountId?: string;
          recordStatus: string;
        };
      }) => {
        store.lastMemberWhere = where;
        const member = store.members.find((item) => {
          if (item.organizationId !== where.organizationId) return false;
          if (item.recordStatus !== where.recordStatus) return false;
          if (where.userAccountId && item.userAccountId !== where.userAccountId) {
            return false;
          }
          return true;
        });
        return member ? { id: member.id } : null;
      },
    },
    volunteerServiceAssignment: {
      findFirst: async ({
        where,
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
      }) => {
        store.lastAssignmentWhere = where;
        const row = store.assignments.find((item) => {
          if (item.id !== where.id) return false;
          if (item.organizationId !== where.organizationId) return false;
          if (item.memberId !== where.memberId) return false;
          if (item.status !== where.status) return false;
          if (where.event) {
            const event = store.events.find((entry) => entry.id === item.eventId);
            if (!event || !matchesUpcoming(event, where.event)) return false;
          }
          return true;
        });
        return row ? { id: row.id, status: row.status } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: unknown;
        data: unknown;
      }) => {
        store.lastAssignmentUpdate = { where, data };
        return { count: 0 };
      },
    },
    volunteerSubstituteRequest: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          memberId?: string;
          status?: string | { in: string[] };
        };
        select?: unknown;
      }) => {
        store.lastRequestWhere = where;
        store.lastRequestSelect = select;
        return store.requests
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (where.memberId && row.memberId !== where.memberId) return false;
            if (typeof where.status === "string" && row.status !== where.status) {
              return false;
            }
            if (
              where.status &&
              typeof where.status === "object" &&
              "in" in where.status &&
              !where.status.in.includes(row.status)
            ) {
              return false;
            }
            return true;
          })
          .map((row) => {
            const assignment = store.assignments.find(
              (item) => item.id === row.assignmentId,
            )!;
            const event = store.events.find((item) => item.id === assignment.eventId)!;
            const member = store.members.find((item) => item.id === row.memberId)!;
            const ministry = assignment.ministryId
              ? store.ministries.find((item) => item.id === assignment.ministryId)
              : null;
            return {
              id: row.id,
              assignmentId: row.assignmentId,
              status: row.status,
              memberReason: row.memberReason,
              staffResolutionNote: row.staffResolutionNote,
              member: {
                preferredName: member.preferredName,
                firstName: member.firstName,
                middleName: member.middleName,
                lastName: member.lastName,
                suffix: member.suffix,
              },
              assignment: {
                roleLabel: assignment.roleLabel,
                ministry: ministry ? { name: ministry.name } : null,
                event: {
                  title: event.title,
                  startDateTime: event.startDateTime,
                  endDateTime: event.endDateTime,
                  timezone: event.timezone,
                  isAllDay: event.isAllDay,
                },
              },
            };
          });
      },
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          organizationId: string;
          assignmentId?: string;
          memberId?: string;
          status?: string | { in: string[] };
        };
      }) => {
        store.lastRequestWhere = where;
        const row = store.requests.find((item) => {
          if (item.organizationId !== where.organizationId) return false;
          if (where.id && item.id !== where.id) return false;
          if (where.assignmentId && item.assignmentId !== where.assignmentId) {
            return false;
          }
          if (where.memberId && item.memberId !== where.memberId) return false;
          if (typeof where.status === "string" && item.status !== where.status) {
            return false;
          }
          if (
            where.status &&
            typeof where.status === "object" &&
            "in" in where.status &&
            !where.status.in.includes(item.status)
          ) {
            return false;
          }
          return true;
        });
        return row
          ? {
              id: row.id,
              status: row.status,
              assignmentId: row.assignmentId,
            }
          : null;
      },
      create: async ({
        data,
      }: {
        data: Omit<
          RequestRow,
          "id" | "resolvedAt" | "resolvedByUserId" | "createdAt"
        >;
      }) => {
        store.lastCreateData = data;
        const row: RequestRow = {
          ...data,
          id: `sub-${store.requests.length + 1}`,
          resolvedAt: null,
          resolvedByUserId: null,
          createdAt: new Date("2026-09-24T18:00:00.000Z"),
        };
        store.requests.push(row);
        return { id: row.id };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          organizationId: string;
          memberId?: string;
          status: { in: string[] };
        };
        data: Partial<RequestRow>;
      }) => {
        const matches = store.requests.filter((row) => {
          if (row.id !== where.id) return false;
          if (row.organizationId !== where.organizationId) return false;
          if (where.memberId && row.memberId !== where.memberId) return false;
          if (!where.status.in.includes(row.status)) return false;
          return true;
        });
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      },
    },
  },
}));

import {
  cancelVolunteerSubstituteRequest,
  getMemberSubstituteRequests,
  getStaffVolunteerSubstituteRequests,
  reviewVolunteerSubstituteRequest,
  submitVolunteerSubstituteRequest,
} from "./volunteer-substitute-request.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000d003";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";
const PAST_EVENT = "00000000-0000-4000-8000-00000000e003";
const OTHER_ORG_EVENT = "00000000-0000-4000-8000-00000000e002";
const WORSHIP_ID = "00000000-0000-4000-8000-00000000f001";
const ASSIGNMENT_ID = "00000000-0000-4000-8000-00000000b001";
const OTHER_ASSIGNMENT = "00000000-0000-4000-8000-00000000b002";
const PAST_ASSIGNMENT = "00000000-0000-4000-8000-00000000b003";
const REQUEST_ID = "00000000-0000-4000-8000-00000000aa21";
const OTHER_REQUEST = "00000000-0000-4000-8000-00000000aa22";

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
  store.ministries = [{ id: WORSHIP_ID, name: "Worship Team" }];
  store.assignments = [
    {
      id: ASSIGNMENT_ID,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      roleLabel: "Sound Booth",
      status: "SCHEDULED",
      staffNote: "Ask for the hallway key",
    },
    {
      id: OTHER_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: EVENT_ID,
      memberId: OTHER_MEMBER,
      ministryId: null,
      roleLabel: "Greeter",
      status: "SCHEDULED",
      staffNote: "other volunteer note",
    },
    {
      id: PAST_ASSIGNMENT,
      organizationId: ORG_ID,
      eventId: PAST_EVENT,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      roleLabel: "Setup",
      status: "SCHEDULED",
      staffNote: null,
    },
  ];
  store.requests = [];
}

beforeEach(() => {
  store.events = [];
  store.members = [];
  store.ministries = [];
  store.assignments = [];
  store.requests = [];
  store.lastMemberWhere = null;
  store.lastAssignmentWhere = null;
  store.lastRequestWhere = null;
  store.lastRequestSelect = null;
  store.lastCreateData = null;
  store.lastAssignmentUpdate = null;
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

describe("member volunteer substitute requests", () => {
  it("returns signed-out, no-organization, and pending states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getMemberSubstituteRequests()).resolves.toEqual({
      status: "SIGNED_OUT",
    });

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getMemberSubstituteRequests()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    store.members[0]!.userAccountId = null;
    await expect(getMemberSubstituteRequests()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: "ann@church.test",
    });
  });

  it("resolves the linked member server-side and never uses email or name", async () => {
    await getMemberSubstituteRequests();
    expect(store.lastMemberWhere).toMatchObject({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(JSON.stringify(store.lastMemberWhere)).not.toMatch(/email|firstName|lastName/);
  });

  it("rejects markup in the member reason", async () => {
    await expect(
      submitVolunteerSubstituteRequest({
        assignmentId: ASSIGNMENT_ID,
        memberReason: "<b>Need coverage</b>",
      }),
    ).resolves.toEqual({
      status: "INVALID",
      message: "Use plain text only. HTML and markup are not allowed.",
    });
    expect(store.lastCreateData).toBeNull();
  });

  it("allows a request only for the member’s own upcoming scheduled assignment", async () => {
    await expect(
      submitVolunteerSubstituteRequest({
        assignmentId: OTHER_ASSIGNMENT,
        memberId: OTHER_MEMBER,
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    await expect(
      submitVolunteerSubstituteRequest({ assignmentId: PAST_ASSIGNMENT }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    store.assignments[0]!.status = "CANCELLED";
    await expect(
      submitVolunteerSubstituteRequest({ assignmentId: ASSIGNMENT_ID }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.lastCreateData).toBeNull();
    expect(store.lastAssignmentWhere).toMatchObject({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      status: "SCHEDULED",
    });
  });

  it("creates one open request and keeps the reason out of audit text", async () => {
    const result = await submitVolunteerSubstituteRequest({
      assignmentId: ASSIGNMENT_ID,
      memberReason: "Family is traveling that weekend",
      memberId: OTHER_MEMBER,
      organizationId: OTHER_ORG,
      email: "ann@church.test",
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      assignmentId: ASSIGNMENT_ID,
      memberId: MEMBER_ID,
      memberReason: "Family is traveling that weekend",
      status: "OPEN",
    });
    expect(store.assignments[0]!.status).toBe("SCHEDULED");
    expect(store.lastAssignmentUpdate).toBeNull();
    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      changes: Array<{ field: string; newValue: string | null }>;
    };
    expect(JSON.stringify(audit)).not.toContain("Family is traveling that weekend");
    expect(audit.changes).toContainEqual({
      field: "memberReason",
      oldValue: null,
      newValue: "set",
    });
  });

  it("prevents a second open request for the same assignment", async () => {
    store.requests = [
      {
        id: REQUEST_ID,
        organizationId: ORG_ID,
        assignmentId: ASSIGNMENT_ID,
        memberId: MEMBER_ID,
        memberReason: "Need a substitute",
        status: "OPEN",
        staffResolutionNote: null,
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date("2026-09-24T12:00:00.000Z"),
      },
    ];
    await expect(
      submitVolunteerSubstituteRequest({ assignmentId: ASSIGNMENT_ID }),
    ).resolves.toEqual({ status: "DUPLICATE" });
    expect(store.lastCreateData).toBeNull();
  });

  it("lists and cancels only the signed-in member’s own open requests", async () => {
    store.requests = [
      {
        id: REQUEST_ID,
        organizationId: ORG_ID,
        assignmentId: ASSIGNMENT_ID,
        memberId: MEMBER_ID,
        memberReason: "Need a substitute",
        status: "OPEN",
        staffResolutionNote: "Ask Blake privately",
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date("2026-09-24T12:00:00.000Z"),
      },
      {
        id: OTHER_REQUEST,
        organizationId: ORG_ID,
        assignmentId: OTHER_ASSIGNMENT,
        memberId: OTHER_MEMBER,
        memberReason: "Blake private reason",
        status: "OPEN",
        staffResolutionNote: null,
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date("2026-09-24T12:00:00.000Z"),
      },
    ];

    const listed = await getMemberSubstituteRequests();
    expect(listed.status).toBe("READY");
    if (listed.status !== "READY") throw new Error("expected READY");
    expect(listed.rows).toHaveLength(1);
    expect(listed.rows[0]).toMatchObject({
      requestId: REQUEST_ID,
      assignmentId: ASSIGNMENT_ID,
      status: "OPEN",
      canCancel: true,
    });
    expect(JSON.stringify(listed)).not.toContain("Ask Blake privately");
    expect(JSON.stringify(listed)).not.toContain("Blake private reason");
    expect(JSON.stringify(store.lastRequestSelect)).not.toMatch(
      /staffResolutionNote|resolvedByUserId/,
    );

    await expect(
      cancelVolunteerSubstituteRequest({ requestId: OTHER_REQUEST }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.requests[1]!.status).toBe("OPEN");

    await expect(
      cancelVolunteerSubstituteRequest({ requestId: REQUEST_ID }),
    ).resolves.toEqual({ status: "CANCELLED" });
    expect(store.requests[0]!.status).toBe("CANCELLED");
    expect(store.assignments[0]!.status).toBe("SCHEDULED");
  });
});

describe("staff volunteer substitute requests", () => {
  it("denies unauthorized staff and members", async () => {
    mocks.getMemberEngagementAccess.mockResolvedValue(
      staffAccess({ canManageMinistryRosters: false }),
    );
    await expect(getStaffVolunteerSubstituteRequests()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      reviewVolunteerSubstituteRequest({
        requestId: REQUEST_ID,
        status: "RESOLVED",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    mocks.getMemberEngagementAccess.mockResolvedValue(staffAccess());
  });

  it("scopes staff lists to the current organization", async () => {
    store.requests = [
      {
        id: REQUEST_ID,
        organizationId: ORG_ID,
        assignmentId: ASSIGNMENT_ID,
        memberId: MEMBER_ID,
        memberReason: "Need a substitute",
        status: "OPEN",
        staffResolutionNote: null,
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date("2026-09-24T12:00:00.000Z"),
      },
      {
        id: OTHER_REQUEST,
        organizationId: OTHER_ORG,
        assignmentId: OTHER_ASSIGNMENT,
        memberId: OTHER_ORG_MEMBER,
        memberReason: "Other church reason",
        status: "OPEN",
        staffResolutionNote: "other church note",
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date("2026-09-24T12:00:00.000Z"),
      },
    ];

    const result = await getStaffVolunteerSubstituteRequests({ status: "OPEN" });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") throw new Error("expected READY");
    expect(store.lastRequestWhere).toMatchObject({
      organizationId: ORG_ID,
      status: "OPEN",
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      requestId: REQUEST_ID,
      memberName: "Ann Adams",
      eventTitle: "Sunday Worship",
      roleLabel: "Sound Booth",
      ministryName: "Worship Team",
    });
    expect(JSON.stringify(result.rows)).not.toContain("Other Church Service");
    expect(JSON.stringify(result.rows)).not.toContain("other church note");
  });

  it("updates an open request and isolates staff notes from audit and assignment changes", async () => {
    store.requests = [
      {
        id: REQUEST_ID,
        organizationId: ORG_ID,
        assignmentId: ASSIGNMENT_ID,
        memberId: MEMBER_ID,
        memberReason: "Need a substitute",
        status: "OPEN",
        staffResolutionNote: null,
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: new Date("2026-09-24T12:00:00.000Z"),
      },
    ];

    const result = await reviewVolunteerSubstituteRequest({
      requestId: REQUEST_ID,
      status: "RESOLVED",
      staffResolutionNote: "Covered by Blake after service",
    });
    expect(result).toEqual({ status: "UPDATED" });
    expect(store.requests[0]).toMatchObject({
      status: "RESOLVED",
      staffResolutionNote: "Covered by Blake after service",
      resolvedByUserId: USER_ID,
    });
    expect(store.assignments[0]!.status).toBe("SCHEDULED");
    expect(store.lastAssignmentUpdate).toBeNull();
    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      action: string;
      changes: Array<{ field: string; newValue: string | null }>;
    };
    expect(audit.action).toBe("REVIEW_VOLUNTEER_SUBSTITUTE_REQUEST");
    expect(JSON.stringify(audit)).not.toContain("Covered by Blake after service");
    expect(JSON.stringify(audit)).not.toContain("Need a substitute");
    expect(audit.changes).toContainEqual({
      field: "staffResolutionNote",
      oldValue: null,
      newValue: "set",
    });

    const memberView = await getMemberSubstituteRequests();
    expect(JSON.stringify(memberView)).not.toContain(
      "Covered by Blake after service",
    );
  });
});
