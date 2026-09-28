import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  VOLUNTEER_TRAINING_ROW_FIELDS,
  staffVolunteerTrainingNavItems,
  volunteerTrainingStatus,
} from "@/lib/validation/volunteer-training";

type MemberRow = {
  id: string;
  organizationId: string;
  recordStatus: string;
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

type TrainingRow = {
  id: string;
  organizationId: string;
  memberId: string;
  ministryId: string | null;
  title: string;
  completedOn: Date;
  expiresOn: Date | null;
  archivedAt: Date | null;
  archivedByUserAccountId: string | null;
  createdByUserAccountId: string;
  updatedByUserAccountId: string;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  ministries: [] as MinistryRow[],
  rosters: [] as RosterRow[],
  records: [] as TrainingRow[],
  lastMemberWhere: null as unknown,
  lastMinistryWhere: null as unknown,
  lastRosterWhere: null as unknown,
  lastRecordWhere: null as unknown,
  lastRecordSelect: null as unknown,
  lastCreateData: null as unknown,
  lastUpdateData: null as unknown,
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

function matchesArchivedAt(
  archivedAt: Date | null,
  where: Date | null | { not: null } | undefined,
) {
  if (where === undefined) return true;
  if (where === null) return archivedAt == null;
  if (typeof where === "object" && where && "not" in where) {
    return archivedAt != null;
  }
  return false;
}

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    member: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string; recordStatus: string };
      }) => {
        store.lastMemberWhere = where;
        const member = store.members.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.recordStatus === where.recordStatus,
        );
        return member ? { id: member.id } : null;
      },
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; recordStatus: string };
      }) => {
        store.lastMemberWhere = where;
        return store.members
          .filter(
            (item) =>
              item.organizationId === where.organizationId &&
              item.recordStatus === where.recordStatus,
          )
          .map((item) => ({
            id: item.id,
            preferredName: item.preferredName,
            firstName: item.firstName,
            middleName: item.middleName,
            lastName: item.lastName,
            suffix: item.suffix,
          }));
      },
    },
    ministry: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string; isActive: boolean };
      }) => {
        store.lastMinistryWhere = where;
        const ministry = store.ministries.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.isActive === where.isActive,
        );
        return ministry ? { id: ministry.id } : null;
      },
      findMany: async ({
        where,
      }: {
        where: { organizationId: string; isActive: boolean };
      }) =>
        store.ministries
          .filter(
            (item) =>
              item.organizationId === where.organizationId &&
              item.isActive === where.isActive,
          )
          .map((item) => ({ id: item.id, name: item.name })),
    },
    memberMinistry: {
      findFirst: async ({
        where,
      }: {
        where: {
          memberId: string;
          ministryId: string;
          status: string;
          endedDate: Date | null;
        };
      }) => {
        store.lastRosterWhere = where;
        const roster = store.rosters.find(
          (item) =>
            item.memberId === where.memberId &&
            item.ministryId === where.ministryId &&
            item.status === where.status &&
            item.endedDate === where.endedDate,
        );
        return roster ? { id: roster.id } : null;
      },
    },
    volunteerTrainingRecord: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          archivedAt?: Date | null | { not: null };
        };
        select?: unknown;
      }) => {
        store.lastRecordWhere = where;
        store.lastRecordSelect = select;
        return store.records
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              matchesArchivedAt(row.archivedAt, where.archivedAt),
          )
          .map((row) => {
            const member = store.members.find((item) => item.id === row.memberId)!;
            const ministry = store.ministries.find(
              (item) => item.id === row.ministryId,
            );
            return {
              id: row.id,
              title: row.title,
              completedOn: row.completedOn,
              expiresOn: row.expiresOn,
              archivedAt: row.archivedAt,
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
        where: {
          id: string;
          organizationId: string;
          archivedAt?: Date | null | { not: null };
        };
      }) => {
        store.lastRecordWhere = where;
        const row = store.records.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            matchesArchivedAt(item.archivedAt, where.archivedAt),
        );
        return row
          ? {
              id: row.id,
              title: row.title,
              completedOn: row.completedOn,
              expiresOn: row.expiresOn,
            }
          : null;
      },
      create: async ({
        data,
      }: {
        data: Omit<TrainingRow, "id" | "archivedAt" | "archivedByUserAccountId">;
      }) => {
        store.lastCreateData = data;
        const row: TrainingRow = {
          ...data,
          id: `training-${store.records.length + 1}`,
          archivedAt: null,
          archivedByUserAccountId: null,
        };
        store.records.push(row);
        return { id: row.id };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          organizationId: string;
          archivedAt?: Date | null | { not: null };
        };
        data: Partial<TrainingRow>;
      }) => {
        store.lastUpdateData = data;
        const matches = store.records.filter(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            matchesArchivedAt(row.archivedAt, where.archivedAt),
        );
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      },
    },
  },
}));

import {
  archiveVolunteerTrainingRecord,
  createVolunteerTrainingRecord,
  getStaffVolunteerTraining,
  restoreVolunteerTrainingRecord,
  updateVolunteerTrainingRecord,
} from "./volunteer-training.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000d003";
const WORSHIP_ID = "00000000-0000-4000-8000-00000000f001";
const YOUTH_ID = "00000000-0000-4000-8000-00000000f002";
const OTHER_ORG_MINISTRY = "00000000-0000-4000-8000-00000000f003";
const CURRENT_ID = "00000000-0000-4000-8000-00000000b001";
const EXPIRING_ID = "00000000-0000-4000-8000-00000000b002";
const EXPIRED_ID = "00000000-0000-4000-8000-00000000b003";
const OPEN_ID = "00000000-0000-4000-8000-00000000b004";
const ARCHIVED_ID = "00000000-0000-4000-8000-00000000b005";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000b006";
const NOW = new Date("2026-09-25T15:00:00.000Z");

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
      recordStatus: "ACTIVE",
      preferredName: "Ann",
      firstName: "Annabelle",
      middleName: null,
      lastName: "Adams",
      suffix: null,
      email: "ann@church.test",
      phone: "207-555-0100",
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
      preferredName: null,
      firstName: "Blake",
      middleName: null,
      lastName: "Baker",
      suffix: null,
      email: "blake@church.test",
      phone: "207-555-0101",
    },
    {
      id: OTHER_ORG_MEMBER,
      organizationId: OTHER_ORG,
      recordStatus: "ACTIVE",
      preferredName: null,
      firstName: "Other",
      middleName: null,
      lastName: "Church",
      suffix: null,
      email: "other@elsewhere.test",
      phone: "555-0000",
    },
  ];
  store.ministries = [
    { id: WORSHIP_ID, organizationId: ORG_ID, name: "Worship Team", isActive: true },
    { id: YOUTH_ID, organizationId: ORG_ID, name: "Youth Ministry", isActive: true },
    {
      id: OTHER_ORG_MINISTRY,
      organizationId: OTHER_ORG,
      name: "Other Church Nursery",
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
    {
      id: "roster-2",
      memberId: OTHER_MEMBER,
      ministryId: YOUTH_ID,
      status: "PAUSED",
      endedDate: null,
    },
  ];
  store.records = [
    {
      id: CURRENT_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      title: "Sound-booth training",
      completedOn: new Date("2026-01-15T00:00:00.000Z"),
      expiresOn: new Date("2026-12-01T00:00:00.000Z"),
      archivedAt: null,
      archivedByUserAccountId: null,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
    },
    {
      id: EXPIRING_ID,
      organizationId: ORG_ID,
      memberId: OTHER_MEMBER,
      ministryId: null,
      title: "Safety orientation",
      completedOn: new Date("2026-08-01T00:00:00.000Z"),
      expiresOn: new Date("2026-10-15T00:00:00.000Z"),
      archivedAt: null,
      archivedByUserAccountId: null,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
    },
    {
      id: EXPIRED_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      title: "Nursery orientation",
      completedOn: new Date("2025-01-01T00:00:00.000Z"),
      expiresOn: new Date("2026-09-01T00:00:00.000Z"),
      archivedAt: null,
      archivedByUserAccountId: null,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
    },
    {
      id: OPEN_ID,
      organizationId: ORG_ID,
      memberId: OTHER_MEMBER,
      ministryId: null,
      title: "Church policy training",
      completedOn: new Date("2026-09-01T00:00:00.000Z"),
      expiresOn: null,
      archivedAt: null,
      archivedByUserAccountId: null,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
    },
    {
      id: ARCHIVED_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      title: "Archived booth training",
      completedOn: new Date("2025-06-01T00:00:00.000Z"),
      expiresOn: new Date("2026-12-01T00:00:00.000Z"),
      archivedAt: new Date("2026-09-20T12:00:00.000Z"),
      archivedByUserAccountId: USER_ID,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
    },
    {
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      memberId: OTHER_ORG_MEMBER,
      ministryId: OTHER_ORG_MINISTRY,
      title: "Other church secret training",
      completedOn: new Date("2026-01-01T00:00:00.000Z"),
      expiresOn: new Date("2026-09-01T00:00:00.000Z"),
      archivedAt: null,
      archivedByUserAccountId: null,
      createdByUserAccountId: USER_ID,
      updatedByUserAccountId: USER_ID,
    },
  ];
}

beforeEach(() => {
  store.members = [];
  store.ministries = [];
  store.rosters = [];
  store.records = [];
  store.lastMemberWhere = null;
  store.lastMinistryWhere = null;
  store.lastRosterWhere = null;
  store.lastRecordWhere = null;
  store.lastRecordSelect = null;
  store.lastCreateData = null;
  store.lastUpdateData = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getMemberEngagementAccess.mockReset();
  mocks.createAuditEvent.mockClear();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "staff@church.test",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getMemberEngagementAccess.mockResolvedValue(staffAccess());
  seed();
});

describe("volunteer training status and navigation", () => {
  it("calculates current, expiring, expired, and no-expiration states", () => {
    expect(volunteerTrainingStatus(new Date("2026-12-01T00:00:00.000Z"), NOW)).toBe(
      "CURRENT",
    );
    expect(volunteerTrainingStatus(new Date("2026-10-15T00:00:00.000Z"), NOW)).toBe(
      "EXPIRING_SOON",
    );
    expect(volunteerTrainingStatus(new Date("2026-09-25T00:00:00.000Z"), NOW)).toBe(
      "EXPIRING_SOON",
    );
    expect(volunteerTrainingStatus(new Date("2026-09-24T00:00:00.000Z"), NOW)).toBe(
      "EXPIRED",
    );
    expect(volunteerTrainingStatus(null, NOW)).toBe("NO_EXPIRATION");
  });

  it("hides Volunteer Training navigation from unauthorized staff", () => {
    expect(staffVolunteerTrainingNavItems(false)).toEqual([]);
    expect(staffVolunteerTrainingNavItems(true)).toEqual([
      { href: "/volunteer-training", label: "Volunteer Training" },
    ]);
  });
});

describe("staff volunteer training access", () => {
  it("denies signed-out and unauthorized users without looking up records", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getStaffVolunteerTraining({}, NOW)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastRecordWhere).toBeNull();

    mocks.getMemberEngagementAccess.mockResolvedValue(
      staffAccess({ canManageMinistryRosters: false }),
    );
    await expect(getStaffVolunteerTraining({}, NOW)).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      createVolunteerTrainingRecord({
        memberId: MEMBER_ID,
        title: "Nursery orientation",
        completedOn: "2026-09-01",
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(store.lastCreateData).toBeNull();
  });
});

describe("staff volunteer training list", () => {
  it("scopes records to the current organization and ignores client org ids", async () => {
    const result = await getStaffVolunteerTraining(
      { organizationId: OTHER_ORG, memberId: OTHER_ORG_MEMBER },
      NOW,
    );
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastRecordWhere).toEqual({
      organizationId: ORG_ID,
      archivedAt: null,
    });
    expect(result.rows).toHaveLength(4);
    expect(result.rows.map((row) => row.title)).toEqual(
      expect.arrayContaining([
        "Church policy training",
        "Nursery orientation",
        "Safety orientation",
        "Sound-booth training",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("Other church secret training");
    expect(JSON.stringify(result)).not.toContain(OTHER_ORG);
  });

  it("returns only the safe field allow-list and excludes private contact data", async () => {
    const result = await getStaffVolunteerTraining({}, NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...VOLUNTEER_TRAINING_ROW_FIELDS].sort(),
    );
    expect(store.lastRecordSelect).toEqual({
      id: true,
      title: true,
      completedOn: true,
      expiresOn: true,
      archivedAt: true,
      member: {
        select: {
          preferredName: true,
          firstName: true,
          middleName: true,
          lastName: true,
          suffix: true,
        },
      },
      ministry: { select: { name: true } },
    });
    const payload = JSON.stringify(result.rows);
    expect(payload).not.toContain("ann@church.test");
    expect(payload).not.toContain("207-555-0100");
    expect(payload).not.toContain("background");
    expect(payload).not.toContain("certificate");
    expect(payload).not.toContain("staff note");
  });

  it("filters current, expiring soon, expired, and no-expiration records", async () => {
    const current = await getStaffVolunteerTraining({ status: "CURRENT" }, NOW);
    expect(current.status).toBe("READY");
    if (current.status !== "READY") return;
    expect(current.rows).toEqual([
      expect.objectContaining({
        title: "Sound-booth training",
        memberName: "Ann Adams",
        ministryName: "Worship Team",
        status: "CURRENT",
        statusLabel: "Current",
        expiresOnLabel: "Dec 1, 2026",
      }),
    ]);

    const expiring = await getStaffVolunteerTraining(
      { status: "EXPIRING_SOON" },
      NOW,
    );
    expect(expiring.status).toBe("READY");
    if (expiring.status !== "READY") return;
    expect(expiring.rows.map((row) => row.title)).toEqual(["Safety orientation"]);

    const expired = await getStaffVolunteerTraining({ status: "EXPIRED" }, NOW);
    expect(expired.status).toBe("READY");
    if (expired.status !== "READY") return;
    expect(expired.rows.map((row) => row.title)).toEqual(["Nursery orientation"]);

    const open = await getStaffVolunteerTraining(
      { status: "NO_EXPIRATION" },
      NOW,
    );
    expect(open.status).toBe("READY");
    if (open.status !== "READY") return;
    expect(open.rows).toEqual([
      expect.objectContaining({
        title: "Church policy training",
        expiresOnLabel: null,
        status: "NO_EXPIRATION",
        statusLabel: "No expiration date",
      }),
    ]);
  });

  it("lists archived records only through the archived filter", async () => {
    const archived = await getStaffVolunteerTraining({ status: "ARCHIVED" }, NOW);
    expect(archived.status).toBe("READY");
    if (archived.status !== "READY") return;
    expect(store.lastRecordWhere).toEqual({
      organizationId: ORG_ID,
      archivedAt: { not: null },
    });
    expect(archived.rows).toEqual([
      expect.objectContaining({
        title: "Archived booth training",
        archived: true,
      }),
    ]);
    expect(JSON.stringify(archived.rows)).not.toContain("Other church secret training");
  });
});

describe("staff volunteer training mutations", () => {
  it("rejects invalid dates, markup, and other-organization members", async () => {
    await expect(
      createVolunteerTrainingRecord({
        memberId: MEMBER_ID,
        title: "Nursery orientation",
        completedOn: "2026-09-10",
        expiresOn: "2026-09-01",
      }),
    ).resolves.toEqual({ status: "INVALID" });
    await expect(
      createVolunteerTrainingRecord({
        memberId: MEMBER_ID,
        title: "<b>Unsafe</b>",
        completedOn: "2026-09-01",
      }),
    ).resolves.toEqual({ status: "INVALID" });
    await expect(
      createVolunteerTrainingRecord({
        memberId: OTHER_ORG_MEMBER,
        organizationId: OTHER_ORG,
        title: "Nursery orientation",
        completedOn: "2026-09-01",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.lastCreateData).toBeNull();
    expect(store.lastMemberWhere).toMatchObject({
      id: OTHER_ORG_MEMBER,
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
    });
  });

  it("requires an active ministry assignment when a ministry is selected", async () => {
    await expect(
      createVolunteerTrainingRecord({
        memberId: MEMBER_ID,
        ministryId: YOUTH_ID,
        title: "Youth safety training",
        completedOn: "2026-09-01",
      }),
    ).resolves.toEqual({ status: "MINISTRY_MISMATCH" });
    await expect(
      createVolunteerTrainingRecord({
        memberId: MEMBER_ID,
        ministryId: OTHER_ORG_MINISTRY,
        title: "Youth safety training",
        completedOn: "2026-09-01",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    expect(store.lastCreateData).toBeNull();
  });

  it("creates a record from the current organization and keeps audit text safe", async () => {
    const result = await createVolunteerTrainingRecord({
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      title: "  Sound booth refresher  ",
      completedOn: "2026-09-02",
      expiresOn: "2027-09-02",
      organizationId: OTHER_ORG,
      email: "ann@church.test",
      notes: "Do not store this",
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      title: "Sound booth refresher",
      createdByUserAccountId: USER_ID,
    });
    const audit = mocks.createAuditEvent.mock.calls[0]?.[0] as {
      action: string;
      changes: Array<{ field: string; newValue: string | null }>;
    };
    expect(audit.action).toBe("CREATE_VOLUNTEER_TRAINING_RECORD");
    expect(JSON.stringify(audit)).not.toContain("ann@church.test");
    expect(JSON.stringify(audit)).not.toContain("Do not store this");
    expect(audit.changes).toContainEqual({
      field: "title",
      oldValue: null,
      newValue: "set",
    });
  });

  it("updates title and dates, then archives and restores without hard delete", async () => {
    await expect(
      updateVolunteerTrainingRecord({
        recordId: OTHER_ORG_ID,
        title: "Changed other church",
        completedOn: "2026-01-01",
      }),
    ).resolves.toEqual({ status: "NOT_FOUND" });

    await expect(
      updateVolunteerTrainingRecord({
        recordId: CURRENT_ID,
        title: "Sound-booth training updated",
        completedOn: "2026-01-20",
        expiresOn: "2027-01-20",
      }),
    ).resolves.toEqual({ status: "UPDATED" });
    expect(store.records.find((row) => row.id === CURRENT_ID)).toMatchObject({
      title: "Sound-booth training updated",
      updatedByUserAccountId: USER_ID,
    });

    await expect(
      archiveVolunteerTrainingRecord({
        recordId: CURRENT_ID,
        organizationId: OTHER_ORG,
      }),
    ).resolves.toEqual({ status: "ARCHIVED" });
    expect(store.records.find((row) => row.id === CURRENT_ID)?.archivedAt).toBeInstanceOf(
      Date,
    );
    expect(store.records).toHaveLength(6);

    await expect(
      restoreVolunteerTrainingRecord({ recordId: CURRENT_ID }),
    ).resolves.toEqual({ status: "RESTORED" });
    expect(store.records.find((row) => row.id === CURRENT_ID)?.archivedAt).toBeNull();
    expect(mocks.createAuditEvent.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "UPDATE_VOLUNTEER_TRAINING_RECORD" }),
        expect.objectContaining({ action: "ARCHIVE_VOLUNTEER_TRAINING_RECORD" }),
        expect.objectContaining({ action: "RESTORE_VOLUNTEER_TRAINING_RECORD" }),
      ]),
    );
  });
});
