import { beforeEach, describe, expect, it, vi } from "vitest";

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

type RequestRow = {
  id: string;
  organizationId: string;
  memberId: string;
  startDate: Date;
  endDate: Date;
  memberReason: string | null;
  status: string;
  staffResolutionNote: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  createdAt: Date;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  requests: [] as RequestRow[],
  lastMemberWhere: null as unknown,
  lastRequestWhere: null as unknown,
  lastRequestSelect: null as unknown,
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

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    member: {
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
          if (where.userAccountId && item.userAccountId !== where.userAccountId) {
            return false;
          }
          if (where.id && item.id !== where.id) return false;
          return true;
        });
        return member ? { id: member.id } : null;
      },
    },
    volunteerTimeOffRequest: {
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
            if (where.status && typeof where.status === "object" && "in" in where.status) {
              if (!where.status.in.includes(row.status)) return false;
            }
            return true;
          })
          .map((row) => {
            const member = store.members.find((item) => item.id === row.memberId)!;
            return {
              id: row.id,
              startDate: row.startDate,
              endDate: row.endDate,
              status: row.status,
              createdAt: row.createdAt,
              memberReason: row.memberReason,
              staffResolutionNote: row.staffResolutionNote,
              member: {
                preferredName: member.preferredName,
                firstName: member.firstName,
                middleName: member.middleName,
                lastName: member.lastName,
                suffix: member.suffix,
              },
            };
          });
      },
      findFirst: async ({
        where,
      }: {
        where: {
          id: string;
          organizationId: string;
          memberId?: string;
          status?: { in: string[] };
        };
      }) => {
        const row = store.requests.find((item) => {
          if (item.id !== where.id) return false;
          if (item.organizationId !== where.organizationId) return false;
          if (where.memberId && item.memberId !== where.memberId) return false;
          if (where.status?.in && !where.status.in.includes(item.status)) {
            return false;
          }
          return true;
        });
        return row ? { id: row.id, status: row.status } : null;
      },
      create: async ({
        data,
      }: {
        data: Omit<RequestRow, "id" | "createdAt" | "resolvedAt" | "resolvedByUserId">;
      }) => {
        store.lastCreateData = data;
        const row: RequestRow = {
          ...data,
          id: `req-${store.requests.length + 1}`,
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
          status?: { in: string[] };
        };
        data: Partial<RequestRow>;
      }) => {
        const matches = store.requests.filter((row) => {
          if (row.id !== where.id) return false;
          if (row.organizationId !== where.organizationId) return false;
          if (where.memberId && row.memberId !== where.memberId) return false;
          if (where.status?.in && !where.status.in.includes(row.status)) {
            return false;
          }
          return true;
        });
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      },
    },
  },
}));

import {
  cancelVolunteerTimeOffRequest,
  getMemberVolunteerTimeOffRequests,
  getStaffVolunteerTimeOffRequests,
  reviewVolunteerTimeOffRequest,
  submitVolunteerTimeOffRequest,
} from "./volunteer-time-off-request.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000d003";
const REQUEST_ID = "00000000-0000-4000-8000-00000000b001";
const OTHER_REQUEST = "00000000-0000-4000-8000-00000000b002";
const OTHER_ORG_REQUEST = "00000000-0000-4000-8000-00000000b003";

function staffAccess(overrides?: { canManageMinistryRosters?: boolean }) {
  return {
    canManageMinistryRosters: overrides?.canManageMinistryRosters ?? true,
    canViewMinistries: true,
    roleCode: "DATA_ENTRY",
    userAccountId: USER_ID,
  };
}

function seed() {
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
  store.requests = [
    {
      id: REQUEST_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      endDate: new Date("2026-10-05T00:00:00.000Z"),
      memberReason: "Family travel",
      status: "OPEN",
      staffResolutionNote: null,
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: new Date("2026-09-24T12:00:00.000Z"),
    },
    {
      id: OTHER_REQUEST,
      organizationId: ORG_ID,
      memberId: OTHER_MEMBER,
      startDate: new Date("2026-10-02T00:00:00.000Z"),
      endDate: new Date("2026-10-03T00:00:00.000Z"),
      memberReason: "other volunteer reason",
      status: "OPEN",
      staffResolutionNote: "staff note for other volunteer",
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: new Date("2026-09-24T13:00:00.000Z"),
    },
    {
      id: OTHER_ORG_REQUEST,
      organizationId: OTHER_ORG,
      memberId: OTHER_ORG_MEMBER,
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      endDate: new Date("2026-10-02T00:00:00.000Z"),
      memberReason: "other church reason",
      status: "OPEN",
      staffResolutionNote: "other church staff note",
      resolvedAt: null,
      resolvedByUserId: null,
      createdAt: new Date("2026-09-24T14:00:00.000Z"),
    },
  ];
}

beforeEach(() => {
  store.members = [];
  store.requests = [];
  store.lastMemberWhere = null;
  store.lastRequestWhere = null;
  store.lastRequestSelect = null;
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

describe("member volunteer time-off requests", () => {
  it("returns signed-out, no-organization, and pending states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getMemberVolunteerTimeOffRequests()).resolves.toEqual({
      status: "SIGNED_OUT",
    });

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getMemberVolunteerTimeOffRequests()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    store.members[0]!.userAccountId = null;
    await expect(getMemberVolunteerTimeOffRequests()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: "ann@church.test",
    });
    expect(store.lastMemberWhere).toMatchObject({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
  });

  it("resolves the linked member server-side and never uses email or name", async () => {
    await getMemberVolunteerTimeOffRequests();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("ann@church.test");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("Adams");
  });

  it("rejects invalid dates and markup in the member reason", async () => {
    await expect(
      submitVolunteerTimeOffRequest({
        startDate: "2026-10-10",
        endDate: "2026-10-01",
        memberReason: "Backwards",
      }),
    ).resolves.toMatchObject({
      status: "INVALID",
      message: "End date must be on or after the start date.",
    });

    await expect(
      submitVolunteerTimeOffRequest({
        startDate: "2026-10-10",
        endDate: "2026-10-12",
        memberReason: "<script>alert(1)</script>",
      }),
    ).resolves.toMatchObject({ status: "INVALID" });
    expect(store.lastCreateData).toBeNull();
  });

  it("lists and cancels only the signed-in member’s own open requests", async () => {
    const list = await getMemberVolunteerTimeOffRequests();
    expect(list.status).toBe("READY");
    if (list.status !== "READY") throw new Error("expected READY");
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({
      requestId: REQUEST_ID,
      startDateLabel: "Oct 1, 2026",
      endDateLabel: "Oct 5, 2026",
      status: "OPEN",
      memberReason: "Family travel",
      canCancel: true,
    });
    expect(store.lastRequestWhere).toMatchObject({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });
    expect(JSON.stringify(list)).not.toContain("other volunteer reason");
    expect(JSON.stringify(list)).not.toContain("Blake");

    await expect(
      cancelVolunteerTimeOffRequest({ requestId: OTHER_REQUEST }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(
      cancelVolunteerTimeOffRequest({ requestId: REQUEST_ID }),
    ).resolves.toEqual({ status: "CANCELLED" });
    expect(store.requests[0]?.status).toBe("CANCELLED");
  });

  it("blocks overlapping open requests", async () => {
    await expect(
      submitVolunteerTimeOffRequest({
        startDate: "2026-10-04",
        endDate: "2026-10-08",
        memberReason: "Overlap",
      }),
    ).resolves.toEqual({ status: "OVERLAP" });
    expect(store.lastCreateData).toBeNull();
  });

  it("creates a request and keeps the reason out of audit text", async () => {
    store.requests = [];
    const result = await submitVolunteerTimeOffRequest({
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      memberReason: "Family travel details",
      memberId: OTHER_MEMBER,
      organizationId: OTHER_ORG,
      email: "ann@church.test",
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      memberReason: "Family travel details",
      status: "OPEN",
    });
    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      changes: Array<{ field: string; newValue: string | null }>;
    };
    expect(JSON.stringify(audit)).not.toContain("Family travel details");
    expect(audit.changes).toContainEqual({
      field: "memberReason",
      oldValue: null,
      newValue: "set",
    });
  });
});

describe("staff volunteer time-off review", () => {
  it("denies unauthorized staff and members", async () => {
    mocks.getMemberEngagementAccess.mockResolvedValue(
      staffAccess({ canManageMinistryRosters: false }),
    );
    await expect(getStaffVolunteerTimeOffRequests()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      reviewVolunteerTimeOffRequest({
        requestId: REQUEST_ID,
        status: "APPROVED",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
  });

  it("updates an open request and isolates staff notes from audit and member views", async () => {
    const review = await reviewVolunteerTimeOffRequest({
      requestId: REQUEST_ID,
      status: "APPROVED",
      staffResolutionNote: "Cover nursery with a substitute",
      organizationId: OTHER_ORG,
    });
    expect(review).toEqual({ status: "UPDATED" });
    expect(store.requests[0]).toMatchObject({
      status: "APPROVED",
      staffResolutionNote: "Cover nursery with a substitute",
    });
    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      action: string;
      changes: Array<{ field: string; newValue: string | null }>;
    };
    expect(audit.action).toBe("REVIEW_VOLUNTEER_TIME_OFF_REQUEST");
    expect(JSON.stringify(audit)).not.toContain("Cover nursery with a substitute");
    expect(JSON.stringify(audit)).not.toContain("Family travel");

    const memberView = await getMemberVolunteerTimeOffRequests();
    expect(memberView.status).toBe("READY");
    if (memberView.status !== "READY") throw new Error("expected READY");
    expect(memberView.rows[0]?.resultMessage).toContain("approved");
    expect(JSON.stringify(memberView)).not.toContain(
      "Cover nursery with a substitute",
    );
    expect(JSON.stringify(store.lastRequestSelect)).not.toMatch(
      /staffResolutionNote|resolvedByUserId|email/,
    );
  });

  it("scopes staff lists to the current organization", async () => {
    const result = await getStaffVolunteerTimeOffRequests({ status: "OPEN" });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") throw new Error("expected READY");
    expect(store.lastRequestWhere).toMatchObject({
      organizationId: ORG_ID,
      status: "OPEN",
    });
    expect(result.rows.map((row) => row.requestId)).toEqual([
      REQUEST_ID,
      OTHER_REQUEST,
    ]);
    expect(JSON.stringify(result)).not.toContain("other church reason");
    expect(JSON.stringify(result)).not.toContain(OTHER_ORG);
  });
});
