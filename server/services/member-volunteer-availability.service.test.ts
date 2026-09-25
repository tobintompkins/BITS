import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  emptyVolunteerAvailabilityDays,
  memberVolunteerAvailabilitySchema,
} from "@/lib/validation/member-volunteer-availability";

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  firstName: string;
  lastName: string;
  email: string;
};

type AvailabilityRow = {
  id: string;
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
  rows: [] as AvailabilityRow[],
  lastMemberWhere: null as unknown,
  lastFindWhere: null as unknown,
  lastUpdateWhere: null as unknown,
  lastCreateData: null as unknown,
  createCount: 0,
  updateCount: 0,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => input),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

vi.mock("@/lib/db/prisma", () => {
  const memberApi = {
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
  };

  const availabilityApi = {
    findMany: async ({
      where,
    }: {
      where: { organizationId: string; memberId: string };
    }) => {
      store.lastFindWhere = where;
      return store.rows
        .filter(
          (row) =>
            row.organizationId === where.organizationId &&
            row.memberId === where.memberId,
        )
        .map((row) => ({
          weekday: row.weekday,
          isAvailable: row.isAvailable,
          startTime: row.startTime,
          endTime: row.endTime,
          note: row.note,
        }));
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { organizationId: string; memberId: string; weekday: string };
      data: {
        isAvailable: boolean;
        startTime: string | null;
        endTime: string | null;
        note: string | null;
      };
    }) => {
      store.lastUpdateWhere = where;
      const matches = store.rows.filter(
        (row) =>
          row.organizationId === where.organizationId &&
          row.memberId === where.memberId &&
          row.weekday === where.weekday,
      );
      for (const row of matches) {
        Object.assign(row, data);
        store.updateCount += 1;
      }
      return { count: matches.length };
    },
    create: async ({
      data,
    }: {
      data: Omit<AvailabilityRow, "id">;
    }) => {
      store.lastCreateData = data;
      const duplicate = store.rows.find(
        (row) => row.memberId === data.memberId && row.weekday === data.weekday,
      );
      if (duplicate) {
        throw new Error("Unique constraint failed on memberId_weekday");
      }
      store.createCount += 1;
      const row = {
        id: `row-${store.createCount}`,
        ...data,
      };
      store.rows.push(row);
      return row;
    },
  };

  return {
    prisma: {
      member: memberApi,
      memberVolunteerAvailability: availabilityApi,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          member: memberApi,
          memberVolunteerAvailability: availabilityApi,
        }),
    },
  };
});

import {
  getMemberVolunteerAvailability,
  updateMemberVolunteerAvailability,
} from "./member-volunteer-availability.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
const OWN_EMAIL = "ann@church.test";

function availableWeek(overrides?: Partial<Record<string, Partial<{
  isAvailable: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}>>>) {
  return {
    days: emptyVolunteerAvailabilityDays().map((day) => ({
      ...day,
      ...(overrides?.[day.weekday] ?? {}),
    })),
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
  ];
  store.rows = [
    {
      id: "00000000-0000-4000-8000-00000000v001",
      organizationId: ORG_ID,
      memberId: OTHER_MEMBER,
      weekday: "MONDAY",
      isAvailable: true,
      startTime: "08:00",
      endTime: "10:00",
      note: "other member private note",
    },
    {
      id: "00000000-0000-4000-8000-00000000v002",
      organizationId: OTHER_ORG,
      memberId: "00000000-0000-4000-8000-00000000m003",
      weekday: "TUESDAY",
      isAvailable: true,
      startTime: "13:00",
      endTime: "15:00",
      note: "wrong org note",
    },
  ];
  store.lastMemberWhere = null;
  store.lastFindWhere = null;
  store.lastUpdateWhere = null;
  store.lastCreateData = null;
  store.createCount = 0;
  store.updateCount = 0;
}

describe("member volunteer availability", () => {
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

  it("returns signed out without querying availability", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberVolunteerAvailability()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastFindWhere).toBeNull();
  });

  it("returns no organization without querying availability", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getMemberVolunteerAvailability()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastMemberWhere).toBeNull();
  });

  it("returns pending when no safe member portal link exists", async () => {
    store.members[0] = { ...store.members[0], userAccountId: null };
    await expect(getMemberVolunteerAvailability()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastFindWhere).toBeNull();
  });

  it("scopes reads to the current organization and linked member without name or email", async () => {
    const result = await getMemberVolunteerAvailability();
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
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.days.every((day) => day.isAvailable === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("other member private note");
    expect(JSON.stringify(result)).not.toContain("wrong org note");
    expect(JSON.stringify(result)).not.toContain(OTHER_MEMBER);
  });

  it("accepts allowed weekdays and time ranges", () => {
    const parsed = memberVolunteerAvailabilitySchema.safeParse(
      availableWeek({
        MONDAY: {
          isAvailable: true,
          startTime: "09:00",
          endTime: "12:00",
          note: "Morning only",
        },
        WEDNESDAY: { isAvailable: true, startTime: null, endTime: null },
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid time range", async () => {
    const result = await updateMemberVolunteerAvailability(
      availableWeek({
        MONDAY: {
          isAvailable: true,
          startTime: "15:00",
          endTime: "09:00",
        },
      }),
    );
    expect(result).toEqual({ status: "INVALID" });
    expect(store.createCount).toBe(0);
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
    expect(
      memberVolunteerAvailabilitySchema.safeParse(
        availableWeek({
          TUESDAY: { isAvailable: true, startTime: "09:00", endTime: null },
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects markup and oversized notes", () => {
    expect(
      memberVolunteerAvailabilitySchema.safeParse(
        availableWeek({
          MONDAY: {
            isAvailable: true,
            note: "<script>alert(1)</script>",
          },
        }),
      ).success,
    ).toBe(false);
    expect(
      memberVolunteerAvailabilitySchema.safeParse(
        availableWeek({
          MONDAY: {
            isAvailable: true,
            note: "x".repeat(141),
          },
        }),
      ).success,
    ).toBe(false);
  });

  it("upserts only the linked member rows and keeps one row per weekday", async () => {
    const first = await updateMemberVolunteerAvailability(
      availableWeek({
        SUNDAY: {
          isAvailable: true,
          startTime: "08:30",
          endTime: "12:00",
          note: "Worship team",
        },
      }),
    );
    expect(first.status).toBe("READY");
    expect(store.createCount).toBe(7);
    expect(store.updateCount).toBe(0);
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
    });

    const second = await updateMemberVolunteerAvailability(
      availableWeek({
        SUNDAY: {
          isAvailable: true,
          startTime: "09:00",
          endTime: "12:30",
          note: "Worship team updated",
        },
      }),
    );
    expect(second.status).toBe("READY");
    expect(store.createCount).toBe(7);
    expect(store.lastUpdateWhere).toEqual({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      weekday: "SUNDAY",
    });
    expect(store.rows.filter((row) => row.memberId === MEMBER_ID)).toHaveLength(
      7,
    );
    expect(
      store.rows.filter(
        (row) => row.memberId === MEMBER_ID && row.weekday === "SUNDAY",
      ),
    ).toHaveLength(1);
  });

  it("does not expose or update another member and omits notes from audit", async () => {
    await updateMemberVolunteerAvailability(
      availableWeek({
        MONDAY: {
          isAvailable: true,
          startTime: "18:00",
          endTime: "20:00",
          note: "member only evening note",
        },
      }),
    );

    const other = store.rows.find((row) => row.memberId === OTHER_MEMBER);
    expect(other).toMatchObject({
      startTime: "08:00",
      endTime: "10:00",
      note: "other member private note",
    });

    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      action: string;
      entityId: string;
      changes: { field: string; oldValue: string | null; newValue: string | null }[];
    };
    expect(audit.action).toBe("UPDATE_MEMBER_VOLUNTEER_AVAILABILITY");
    expect(audit.entityId).toBe(MEMBER_ID);
    expect(JSON.stringify(audit)).not.toContain("member only evening note");
    expect(JSON.stringify(audit)).not.toContain("other member private note");
    expect(audit.changes.some((change) => change.field === "MONDAY.note")).toBe(
      true,
    );
    expect(
      audit.changes.find((change) => change.field === "MONDAY.note"),
    ).toEqual({
      field: "MONDAY.note",
      oldValue: null,
      newValue: "set",
    });
  });

  it("leaves repeated identical saves unchanged without writing audit events", async () => {
    const input = availableWeek({
      FRIDAY: { isAvailable: true, startTime: "17:00", endTime: "19:00" },
    });
    await updateMemberVolunteerAvailability(input);
    mocks.createAuditEvent.mockClear();
    store.createCount = 0;
    store.updateCount = 0;

    const again = await updateMemberVolunteerAvailability(input);
    expect(again).toMatchObject({ status: "READY", unchanged: true });
    expect(store.createCount).toBe(0);
    expect(store.updateCount).toBe(0);
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });
});
