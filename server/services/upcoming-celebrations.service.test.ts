import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  collectUpcomingCelebrations,
  nextCelebrationOccurrence,
  upcomingCelebrationsNavItems,
  UPCOMING_CELEBRATIONS_WINDOW_DAYS,
} from "@/lib/validation/upcoming-celebrations";
import * as celebrationsService from "./upcoming-celebrations.service";

type MemberRow = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: Date | null;
  recordStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type MilestoneRow = {
  id: string;
  organizationId: string;
  memberId: string;
  milestoneType: string;
  title: string;
  milestoneDate: Date;
  notes: string | null;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  milestones: [] as MilestoneRow[],
  lastMemberWhere: null as unknown,
  lastMemberSelect: null as unknown,
  lastMilestoneWhere: null as unknown,
  lastMilestoneSelect: null as unknown,
  writeCalls: 0,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getMemberAccess: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/member-permissions", () => ({
  getMemberAccess: mocks.getMemberAccess,
}));

vi.mock("@/lib/db/prisma", () => {
  function bumpWrite() {
    store.writeCalls += 1;
    throw new Error("preview must not write");
  }

  return {
    prisma: {
      member: {
        findMany: async ({
          where,
          select,
        }: {
          where: { organizationId: string; recordStatus?: string };
          select?: Record<string, boolean>;
        }) => {
          store.lastMemberWhere = where;
          store.lastMemberSelect = select;
          return store.members
            .filter((row) => {
              if (row.organizationId !== where.organizationId) return false;
              if (where.recordStatus && row.recordStatus !== where.recordStatus) {
                return false;
              }
              return true;
            })
            .map((row) => {
              if (!select) return row;
              return Object.fromEntries(
                Object.entries(select)
                  .filter(([, included]) => included)
                  .map(([key]) => [key, row[key as keyof MemberRow]]),
              );
            });
        },
        create: bumpWrite,
        update: bumpWrite,
        delete: bumpWrite,
      },
      memberMilestone: {
        findMany: async ({
          where,
          select,
        }: {
          where: {
            organizationId: string;
            milestoneType?: string;
            member?: { organizationId: string; recordStatus?: string };
          };
          select?: {
            milestoneDate?: boolean;
            member?: { select: Record<string, boolean> };
          };
        }) => {
          store.lastMilestoneWhere = where;
          store.lastMilestoneSelect = select;
          return store.milestones
            .filter((row) => {
              if (row.organizationId !== where.organizationId) return false;
              if (where.milestoneType && row.milestoneType !== where.milestoneType) {
                return false;
              }
              const member = store.members.find((item) => item.id === row.memberId);
              if (!member) return false;
              if (
                where.member?.organizationId &&
                member.organizationId !== where.member.organizationId
              ) {
                return false;
              }
              if (
                where.member?.recordStatus &&
                member.recordStatus !== where.member.recordStatus
              ) {
                return false;
              }
              return true;
            })
            .map((row) => {
              const member = store.members.find((item) => item.id === row.memberId)!;
              const memberSelect = select?.member?.select;
              const memberPayload = memberSelect
                ? Object.fromEntries(
                    Object.entries(memberSelect)
                      .filter(([, included]) => included)
                      .map(([key]) => [key, member[key as keyof MemberRow]]),
                  )
                : member;
              if (!select) return { ...row, member };
              return {
                ...(select.milestoneDate ? { milestoneDate: row.milestoneDate } : {}),
                member: memberPayload,
              };
            });
        },
        create: bumpWrite,
        update: bumpWrite,
        delete: bumpWrite,
      },
    },
  };
});

import { getUpcomingCelebrations } from "./upcoming-celebrations.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const ADA_ID = "00000000-0000-4000-8000-00000000m001";
const PAT_ID = "00000000-0000-4000-8000-00000000m002";
const NOW = new Date("2026-09-30T00:00:00.000Z");

function memberAccess(overrides?: { canView?: boolean; roleCode?: RoleCode | null }) {
  return {
    canView: overrides?.canView ?? true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canImportExport: false,
    roleCode: overrides?.roleCode ?? RoleCode.ORG_ADMIN,
    isSuperAdmin: false,
  };
}

function member(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: ADA_ID,
    organizationId: ORG_ID,
    firstName: "Ada",
    lastName: "Lovelace",
    preferredName: "Ada",
    dateOfBirth: new Date("1975-10-12T00:00:00.000Z"),
    recordStatus: "ACTIVE",
    email: "ada@example.com",
    phone: "555-0100",
    notes: "Private pastoral note",
    ...overrides,
  };
}

function marriage(overrides: Partial<MilestoneRow> = {}): MilestoneRow {
  return {
    id: "00000000-0000-4000-8000-00000000e001",
    organizationId: ORG_ID,
    memberId: PAT_ID,
    milestoneType: "MARRIAGE",
    title: "Wedding at Grace Chapel",
    milestoneDate: new Date("2010-10-20T00:00:00.000Z"),
    notes: "Staff anniversary note",
    ...overrides,
  };
}

beforeEach(() => {
  store.members = [];
  store.milestones = [];
  store.lastMemberWhere = null;
  store.lastMemberSelect = null;
  store.lastMilestoneWhere = null;
  store.lastMilestoneSelect = null;
  store.writeCalls = 0;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getMemberAccess.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    displayName: "Pat Admin",
    primaryEmail: "pat@example.com",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({
    id: ORG_ID,
    name: "Grace Church",
  });
  mocks.getMemberAccess.mockResolvedValue(memberAccess());
});

describe("upcoming celebrations navigation", () => {
  it("is available only to staff who can view members", () => {
    expect(upcomingCelebrationsNavItems(false)).toEqual([]);
    expect(upcomingCelebrationsNavItems(true)).toEqual([
      { href: "/celebrations", label: "Upcoming Celebrations" },
    ]);
  });
});

describe("celebration date helpers", () => {
  it("uses a 60-day look-ahead window", () => {
    expect(UPCOMING_CELEBRATIONS_WINDOW_DAYS).toBe(60);
  });

  it("observes February 29 on February 28 in non-leap years", () => {
    const nonLeap = nextCelebrationOccurrence(
      2,
      29,
      new Date("2027-02-20T00:00:00.000Z"),
    );
    expect(nonLeap.toISOString().slice(0, 10)).toBe("2027-02-28");

    const leap = nextCelebrationOccurrence(
      2,
      29,
      new Date("2028-02-20T00:00:00.000Z"),
    );
    expect(leap.toISOString().slice(0, 10)).toBe("2028-02-29");
  });

  it("crosses into the next calendar year", () => {
    const next = nextCelebrationOccurrence(
      1,
      5,
      new Date("2026-12-20T00:00:00.000Z"),
    );
    expect(next.toISOString().slice(0, 10)).toBe("2027-01-05");
  });
});

describe("collectUpcomingCelebrations", () => {
  it("includes dates through 60 days and excludes day 61", () => {
    const collected = collectUpcomingCelebrations(
      [
        {
          id: "1",
          firstName: "Near",
          lastName: "Window",
          preferredName: null,
          dateOfBirth: new Date("1990-11-29T00:00:00.000Z"),
        },
        {
          id: "2",
          firstName: "Past",
          lastName: "Window",
          preferredName: null,
          dateOfBirth: new Date("1990-11-30T00:00:00.000Z"),
        },
      ],
      [],
      NOW,
    );
    expect(collected.rows.map((row) => row.displayName)).toEqual(["Near Window"]);
    expect(collected.rows[0]?.daysAway).toBe(60);
    expect(collected.counts.birthdays).toBe(1);
  });
});

describe("getUpcomingCelebrations", () => {
  it("requires a signed-in staff member-view permission", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    expect(await getUpcomingCelebrations(NOW)).toEqual({ status: "SIGNED_OUT" });

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    expect(await getUpcomingCelebrations(NOW)).toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getMemberAccess.mockResolvedValueOnce(
      memberAccess({ canView: false, roleCode: RoleCode.DONOR }),
    );
    expect(await getUpcomingCelebrations(NOW)).toEqual({
      status: "UNAUTHORIZED",
    });
  });

  it("scopes active members to the current organization", async () => {
    store.members = [
      member(),
      member({
        id: "00000000-0000-4000-8000-00000000m099",
        organizationId: OTHER_ORG,
        firstName: "Other",
        lastName: "Parish",
        dateOfBirth: new Date("1975-10-12T00:00:00.000Z"),
      }),
      member({
        id: "00000000-0000-4000-8000-00000000m098",
        recordStatus: "ARCHIVED",
        firstName: "Archived",
        lastName: "Member",
        dateOfBirth: new Date("1975-10-12T00:00:00.000Z"),
      }),
      member({
        id: "00000000-0000-4000-8000-00000000m097",
        recordStatus: "INACTIVE",
        firstName: "Inactive",
        lastName: "Member",
        dateOfBirth: new Date("1975-10-12T00:00:00.000Z"),
      }),
    ];

    const view = await getUpcomingCelebrations(NOW);
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
    });
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.displayName).toBe("Ada Lovelace");
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("Other Parish");
    expect(payload).not.toContain("Archived");
    expect(payload).not.toContain("Inactive");
  });

  it("returns safe birthday fields without year, age, or private contact data", async () => {
    store.members = [member({ preferredName: "Addie" })];
    const view = await getUpcomingCelebrations(NOW);
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.rows[0]).toEqual({
      kind: "Birthday",
      displayName: "Addie Lovelace",
      occurrenceLabel: "Monday, October 12",
      monthDayLabel: "Oct 12",
      daysAway: 12,
    });
    expect(view.counts).toEqual({ birthdays: 1, anniversaries: 0 });
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("1975");
    expect(payload).not.toContain("dateOfBirth");
    expect(payload).not.toContain("ada@example.com");
    expect(payload).not.toContain("555-0100");
    expect(payload).not.toContain("Private pastoral note");
    expect(payload).not.toContain(ADA_ID);
    expect(payload).not.toMatch(/"age"/i);
  });

  it("returns safe anniversary fields, skips other milestone types, and dedupes", async () => {
    store.members = [
      member({
        id: PAT_ID,
        firstName: "Pat",
        lastName: "Parker",
        preferredName: null,
        dateOfBirth: null,
      }),
    ];
    store.milestones = [
      marriage(),
      marriage({
        id: "00000000-0000-4000-8000-00000000e002",
        title: "Duplicate chapel record",
        notes: "Do not show this note",
      }),
      marriage({
        id: "00000000-0000-4000-8000-00000000e003",
        milestoneType: "BAPTISM",
        milestoneDate: new Date("2010-10-15T00:00:00.000Z"),
        title: "Baptism day",
      }),
    ];

    const view = await getUpcomingCelebrations(NOW);
    expect(store.lastMilestoneWhere).toMatchObject({
      organizationId: ORG_ID,
      milestoneType: "MARRIAGE",
      member: { organizationId: ORG_ID, recordStatus: "ACTIVE" },
    });
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.rows).toEqual([
      {
        kind: "Anniversary",
        displayName: "Pat Parker",
        occurrenceLabel: "Tuesday, October 20",
        monthDayLabel: "Oct 20",
        daysAway: 20,
      },
    ]);
    expect(view.counts).toEqual({ birthdays: 0, anniversaries: 1 });
    const payload = JSON.stringify(view);
    expect(payload).not.toContain("Wedding at Grace Chapel");
    expect(payload).not.toContain("Staff anniversary note");
    expect(payload).not.toContain("Duplicate chapel record");
    expect(payload).not.toContain("Do not show this note");
    expect(payload).not.toContain("Baptism day");
    expect(payload).not.toContain("2010");
  });

  it("sorts by next occurrence then display name and reports counts", async () => {
    store.members = [
      member({
        id: "00000000-0000-4000-8000-00000000m010",
        firstName: "Zoe",
        lastName: "Young",
        preferredName: null,
        dateOfBirth: new Date("1991-10-12T00:00:00.000Z"),
      }),
      member({ preferredName: null }),
      member({
        id: PAT_ID,
        firstName: "Pat",
        lastName: "Parker",
        preferredName: null,
        dateOfBirth: null,
      }),
    ];
    store.milestones = [marriage()];

    const view = await getUpcomingCelebrations(NOW);
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.rows.map((row) => `${row.kind}:${row.displayName}`)).toEqual([
      "Birthday:Ada Lovelace",
      "Birthday:Zoe Young",
      "Anniversary:Pat Parker",
    ]);
    expect(view.counts).toEqual({ birthdays: 2, anniversaries: 1 });
  });

  it("includes a leap-day birthday observed on February 28 in a non-leap year", async () => {
    store.members = [
      member({
        dateOfBirth: new Date("2000-02-29T00:00:00.000Z"),
        preferredName: null,
      }),
    ];
    const view = await getUpcomingCelebrations(
      new Date("2027-02-20T00:00:00.000Z"),
    );
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.rows[0]).toMatchObject({
      kind: "Birthday",
      displayName: "Ada Lovelace",
      monthDayLabel: "Feb 28",
      daysAway: 8,
    });
    expect(JSON.stringify(view)).not.toContain("2000");
  });

  it("includes a January birthday from December across the year boundary", async () => {
    store.members = [
      member({
        dateOfBirth: new Date("1988-01-05T00:00:00.000Z"),
        preferredName: null,
      }),
    ];
    const view = await getUpcomingCelebrations(
      new Date("2026-12-20T00:00:00.000Z"),
    );
    expect(view.status).toBe("READY");
    if (view.status !== "READY") return;
    expect(view.rows[0]).toMatchObject({
      kind: "Birthday",
      occurrenceLabel: "Tuesday, January 5",
      monthDayLabel: "Jan 5",
      daysAway: 16,
    });
    expect(JSON.stringify(view)).not.toContain("1988");
  });

  it("does not mutate member or milestone records", async () => {
    store.members = [member()];
    const view = await getUpcomingCelebrations(NOW);
    expect(view.status).toBe("READY");
    expect(store.writeCalls).toBe(0);
    expect(celebrationsService).not.toHaveProperty("createCelebration");
    expect(celebrationsService).not.toHaveProperty("sendCelebrationMessage");
    expect(celebrationsService).not.toHaveProperty("updateMember");
  });
});
