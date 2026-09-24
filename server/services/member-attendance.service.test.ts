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

type EventRow = {
  id: string;
  organizationId: string;
  title: string;
  visibility: string;
  eventStatus: string;
};

type AttendanceRow = {
  id: string;
  organizationId: string;
  memberId: string;
  attendanceDate: Date;
  serviceName: string;
  attendanceType: string;
  eventId: string | null;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  checkedInByUserId: string | null;
  notes: string | null;
  stationId?: string;
  qrToken?: string;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  events: [] as EventRow[],
  attendances: [] as AttendanceRow[],
  lastMemberWhere: null as unknown,
  lastCountWhere: null as unknown,
  lastFindWhere: null as unknown,
  lastFindSelect: null as unknown,
  lastFindOrderBy: null as unknown,
  lastFindSkip: null as number | null,
  lastFindTake: null as number | null,
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
    memberAttendance: {
      count: async ({
        where,
      }: {
        where: { organizationId: string; memberId: string };
      }) => {
        store.lastCountWhere = where;
        return store.attendances.filter(
          (row) =>
            row.organizationId === where.organizationId &&
            row.memberId === where.memberId,
        ).length;
      },
      findMany: async ({
        where,
        select,
        orderBy,
        skip,
        take,
      }: {
        where: { organizationId: string; memberId: string };
        select: unknown;
        orderBy: unknown;
        skip: number;
        take: number;
      }) => {
        store.lastFindWhere = where;
        store.lastFindSelect = select;
        store.lastFindOrderBy = orderBy;
        store.lastFindSkip = skip;
        store.lastFindTake = take;
        return store.attendances
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.memberId === where.memberId,
          )
          .sort((left, right) => {
            const byDate =
              right.attendanceDate.getTime() - left.attendanceDate.getTime();
            if (byDate !== 0) return byDate;
            return left.serviceName.localeCompare(right.serviceName);
          })
          .slice(skip, skip + take)
          .map((row) => {
            const event = row.eventId
              ? store.events.find((item) => item.id === row.eventId)
              : null;
            return {
              serviceName: row.serviceName,
              attendanceDate: row.attendanceDate,
              attendanceType: row.attendanceType,
              event: event
                ? {
                    title: event.title,
                    visibility: event.visibility,
                    eventStatus: event.eventStatus,
                    organizationId: event.organizationId,
                  }
                : null,
            };
          });
      },
    },
  },
}));

import { getMemberAttendance } from "./member-attendance.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000m003";
const PUBLIC_EVENT = "00000000-0000-4000-8000-00000000e001";
const STAFF_EVENT = "00000000-0000-4000-8000-00000000e002";
const OWN_EMAIL = "ann@church.test";
const STAFF_ID = "00000000-0000-4000-8000-00000000c099";
const NEWER = new Date("2026-09-21T00:00:00.000Z");
const OLDER = new Date("2026-09-07T00:00:00.000Z");
const MID = new Date("2026-09-14T00:00:00.000Z");

function attendance(
  overrides: Partial<AttendanceRow> &
    Pick<AttendanceRow, "id" | "serviceName" | "attendanceDate">,
): AttendanceRow {
  return {
    organizationId: ORG_ID,
    memberId: MEMBER_ID,
    attendanceType: "PRESENT",
    eventId: null,
    checkInTime: new Date("2026-09-21T14:05:00.000Z"),
    checkOutTime: new Date("2026-09-21T16:00:00.000Z"),
    checkedInByUserId: STAFF_ID,
    notes: "staff only attendance memo",
    stationId: "station-secret",
    qrToken: "qr-pass-secret",
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
  store.events = [
    {
      id: PUBLIC_EVENT,
      organizationId: ORG_ID,
      title: "Sunday Worship",
      visibility: "PUBLIC",
      eventStatus: "PUBLISHED",
    },
    {
      id: STAFF_EVENT,
      organizationId: ORG_ID,
      title: "Elder Board Retreat",
      visibility: "STAFF_ONLY",
      eventStatus: "PUBLISHED",
    },
  ];
  store.attendances = [
    attendance({
      id: "00000000-0000-4000-8000-00000000b001",
      serviceName: "Sunday Morning",
      attendanceDate: NEWER,
      eventId: PUBLIC_EVENT,
    }),
    attendance({
      id: "00000000-0000-4000-8000-00000000b002",
      serviceName: "Wednesday Night",
      attendanceDate: OLDER,
      attendanceType: "ONLINE",
    }),
    attendance({
      id: "00000000-0000-4000-8000-00000000b003",
      serviceName: "Staff Planning",
      attendanceDate: MID,
      eventId: STAFF_EVENT,
    }),
    attendance({
      id: "00000000-0000-4000-8000-00000000b004",
      memberId: OTHER_MEMBER,
      serviceName: "Other Person Service",
      attendanceDate: NEWER,
    }),
    attendance({
      id: "00000000-0000-4000-8000-00000000b005",
      organizationId: OTHER_ORG,
      memberId: OTHER_ORG_MEMBER,
      serviceName: "Other Church Service",
      attendanceDate: NEWER,
    }),
  ];
  store.lastMemberWhere = null;
  store.lastCountWhere = null;
  store.lastFindWhere = null;
  store.lastFindSelect = null;
  store.lastFindOrderBy = null;
  store.lastFindSkip = null;
  store.lastFindTake = null;
}

function payloadText(value: unknown) {
  return JSON.stringify(value);
}

describe("member attendance", () => {
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

  it("returns signed out without querying members or attendance", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberAttendance()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastCountWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();
  });

  it("scopes to the current organization and linked member, ignoring client identity fields", async () => {
    await getMemberAttendance({
      memberId: OTHER_MEMBER,
      userId: OTHER_USER,
      userAccountId: OTHER_USER,
      organizationId: OTHER_ORG,
      eventId: PUBLIC_EVENT,
      email: OWN_EMAIL,
      name: "Ann Adams",
    });
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
    await expect(getMemberAttendance()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastFindWhere).toBeNull();
    expect(store.lastCountWhere).toBeNull();
  });

  it("returns only the signed-in member's records, newest first", async () => {
    const result = await getMemberAttendance();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.records.map((row) => row.serviceName)).toEqual([
      "Sunday Morning",
      "Staff Planning",
      "Wednesday Night",
    ]);
    expect(store.lastFindOrderBy).toEqual([
      { attendanceDate: "desc" },
      { serviceName: "asc" },
    ]);
    expect(store.lastFindTake).toBe(50);
    const text = payloadText(result);
    expect(text).not.toContain("Other Person Service");
    expect(text).not.toContain("Other Church Service");
    expect(text).not.toContain(OTHER_MEMBER);
  });

  it("returns only the safe field allow-list and omits internal attendance fields", async () => {
    const result = await getMemberAttendance();
    expect(result).toEqual({
      status: "READY",
      page: 1,
      pageSize: 50,
      pageCount: 1,
      totalCount: 3,
      records: [
        {
          serviceName: "Sunday Morning",
          attendanceDate: NEWER,
          statusLabel: "Present",
          eventTitle: "Sunday Worship",
        },
        {
          serviceName: "Staff Planning",
          attendanceDate: MID,
          statusLabel: "Present",
          eventTitle: null,
        },
        {
          serviceName: "Wednesday Night",
          attendanceDate: OLDER,
          statusLabel: "Online",
          eventTitle: null,
        },
      ],
    });
    expect(store.lastFindSelect).toEqual({
      serviceName: true,
      attendanceDate: true,
      attendanceType: true,
      event: {
        select: {
          title: true,
          visibility: true,
          eventStatus: true,
          organizationId: true,
        },
      },
    });
    const text = payloadText(result);
    expect(text).not.toContain("staff only attendance memo");
    expect(text).not.toContain("Elder Board Retreat");
    expect(text).not.toContain("station-secret");
    expect(text).not.toContain("qr-pass-secret");
    expect(text).not.toContain(STAFF_ID);
    expect(text).not.toContain(MEMBER_ID);
    expect(text).not.toContain(PUBLIC_EVENT);
    expect(text).not.toContain(USER_ID);
    expect(text).not.toMatch(/checkInTime/);
    expect(text).not.toMatch(/checkOutTime/);
    expect(text).not.toMatch(/checkedInBy/);
    expect(text).not.toMatch(/stationId/);
    expect(text).not.toMatch(/qrToken/);
    expect(text).not.toMatch(/notes/);
  });

  it("returns an empty ready list when the linked member has no records", async () => {
    store.attendances = store.attendances.filter(
      (row) => row.memberId !== MEMBER_ID,
    );
    await expect(getMemberAttendance()).resolves.toEqual({
      status: "READY",
      page: 1,
      pageSize: 50,
      pageCount: 1,
      totalCount: 0,
      records: [],
    });
    expect(store.lastFindWhere).toBeNull();
    expect(store.lastCountWhere).toEqual({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });
  });
});
