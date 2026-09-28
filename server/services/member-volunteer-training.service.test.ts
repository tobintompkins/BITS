import { beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBER_VOLUNTEER_TRAINING_ROW_FIELDS } from "@/lib/validation/member-volunteer-training";
import { volunteerTrainingStatus } from "@/lib/validation/volunteer-training";

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  firstName: string;
  lastName: string;
  email: string;
  notes: string;
};

type MinistryRow = {
  id: string;
  organizationId: string;
  name: string;
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
  createdByUserAccountId: string;
  staffNote?: string;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  ministries: [] as MinistryRow[],
  records: [] as TrainingRow[],
  lastMemberWhere: null as unknown,
  lastRecordWhere: null as unknown,
  lastRecordSelect: null as unknown,
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
    volunteerTrainingRecord: {
      findMany: async ({
        where,
        select,
      }: {
        where: {
          organizationId: string;
          memberId: string;
          archivedAt: null;
        };
        select: unknown;
      }) => {
        store.lastRecordWhere = where;
        store.lastRecordSelect = select;
        return store.records
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (row.memberId !== where.memberId) return false;
            if (where.archivedAt === null && row.archivedAt !== null) {
              return false;
            }
            return true;
          })
          .map((row) => {
            const ministry = store.ministries.find(
              (item) => item.id === row.ministryId,
            );
            return {
              title: row.title,
              completedOn: row.completedOn,
              expiresOn: row.expiresOn,
              ministry: ministry ? { name: ministry.name } : null,
            };
          });
      },
    },
  },
}));

import { getMemberVolunteerTraining } from "./member-volunteer-training.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000d003";
const WORSHIP_ID = "00000000-0000-4000-8000-00000000f001";
const NOW = new Date("2026-09-25T15:00:00.000Z");
const OWN_EMAIL = "ann@church.test";

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
      notes: "pastoral note must stay hidden",
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      recordStatus: "ACTIVE",
      firstName: "Blake",
      lastName: "Baker",
      email: "blake@church.test",
      notes: "other member note",
    },
    {
      id: OTHER_ORG_MEMBER,
      organizationId: OTHER_ORG,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      firstName: "Other",
      lastName: "Church",
      email: "other@elsewhere.test",
      notes: "other church note",
    },
  ];
  store.ministries = [
    { id: WORSHIP_ID, organizationId: ORG_ID, name: "Worship Team" },
  ];
  store.records = [
    {
      id: "00000000-0000-4000-8000-00000000b001",
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      title: "Sound-booth training",
      completedOn: new Date("2026-01-15T00:00:00.000Z"),
      expiresOn: new Date("2026-12-01T00:00:00.000Z"),
      archivedAt: null,
      createdByUserAccountId: OTHER_USER,
      staffNote: "internal staff memo",
    },
    {
      id: "00000000-0000-4000-8000-00000000b002",
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      ministryId: null,
      title: "Safety orientation",
      completedOn: new Date("2026-08-01T00:00:00.000Z"),
      expiresOn: new Date("2026-10-15T00:00:00.000Z"),
      archivedAt: null,
      createdByUserAccountId: OTHER_USER,
    },
    {
      id: "00000000-0000-4000-8000-00000000b003",
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      title: "Nursery orientation",
      completedOn: new Date("2025-01-01T00:00:00.000Z"),
      expiresOn: new Date("2026-09-01T00:00:00.000Z"),
      archivedAt: null,
      createdByUserAccountId: OTHER_USER,
    },
    {
      id: "00000000-0000-4000-8000-00000000b004",
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      ministryId: null,
      title: "Church policy training",
      completedOn: new Date("2026-09-01T00:00:00.000Z"),
      expiresOn: null,
      archivedAt: null,
      createdByUserAccountId: OTHER_USER,
    },
    {
      id: "00000000-0000-4000-8000-00000000b005",
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      ministryId: WORSHIP_ID,
      title: "Archived booth training",
      completedOn: new Date("2025-06-01T00:00:00.000Z"),
      expiresOn: new Date("2026-12-01T00:00:00.000Z"),
      archivedAt: new Date("2026-09-20T12:00:00.000Z"),
      createdByUserAccountId: OTHER_USER,
    },
    {
      id: "00000000-0000-4000-8000-00000000b006",
      organizationId: ORG_ID,
      memberId: OTHER_MEMBER,
      ministryId: WORSHIP_ID,
      title: "Other volunteer CPR",
      completedOn: new Date("2026-01-01T00:00:00.000Z"),
      expiresOn: new Date("2026-12-01T00:00:00.000Z"),
      archivedAt: null,
      createdByUserAccountId: OTHER_USER,
    },
    {
      id: "00000000-0000-4000-8000-00000000b007",
      organizationId: OTHER_ORG,
      memberId: OTHER_ORG_MEMBER,
      ministryId: null,
      title: "Other church secret training",
      completedOn: new Date("2026-01-01T00:00:00.000Z"),
      expiresOn: new Date("2026-09-01T00:00:00.000Z"),
      archivedAt: null,
      createdByUserAccountId: OTHER_USER,
    },
  ];
}

beforeEach(() => {
  store.members = [];
  store.ministries = [];
  store.records = [];
  store.lastMemberWhere = null;
  store.lastRecordWhere = null;
  store.lastRecordSelect = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: OWN_EMAIL,
    displayName: "Ann Adams",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  seed();
});

describe("member volunteer training access", () => {
  it("returns signed-out, no-organization, and pending states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getMemberVolunteerTraining(NOW)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastRecordWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getMemberVolunteerTraining(NOW)).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastRecordWhere).toBeNull();

    store.members[0]!.userAccountId = null;
    await expect(getMemberVolunteerTraining(NOW)).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastRecordWhere).toBeNull();
  });

  it("scopes the member lookup to the current organization and never matches email or name", async () => {
    await getMemberVolunteerTraining(NOW);
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("email");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OWN_EMAIL);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("Adams");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OTHER_ORG);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OTHER_MEMBER);
  });
});

describe("member volunteer training records", () => {
  it("lists only the linked member’s active records for the current organization", async () => {
    const result = await getMemberVolunteerTraining(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastRecordWhere).toEqual({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      archivedAt: null,
    });
    expect(result.rows.map((row) => row.title)).toEqual(
      expect.arrayContaining([
        "Sound-booth training",
        "Safety orientation",
        "Nursery orientation",
        "Church policy training",
      ]),
    );
    expect(result.rows).toHaveLength(4);
    expect(JSON.stringify(result)).not.toContain("Archived booth training");
    expect(JSON.stringify(result)).not.toContain("Other volunteer CPR");
    expect(JSON.stringify(result)).not.toContain("Other church secret training");
  });

  it("returns only the safe field allow-list and excludes private data", async () => {
    const result = await getMemberVolunteerTraining(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...MEMBER_VOLUNTEER_TRAINING_ROW_FIELDS].sort(),
    );
    expect(store.lastRecordSelect).toEqual({
      title: true,
      completedOn: true,
      expiresOn: true,
      ministry: { select: { name: true } },
    });
    const payload = JSON.stringify(result);
    expect(payload).not.toContain(OWN_EMAIL);
    expect(payload).not.toContain("pastoral note");
    expect(payload).not.toContain("internal staff memo");
    expect(payload).not.toContain("background");
    expect(payload).not.toContain("certificate");
    expect(payload).not.toContain(OTHER_USER);
    expect(payload).not.toContain(MEMBER_ID);
    expect(payload).not.toContain("Blake");
  });

  it("reuses staff expiration labels for current, expiring, expired, and no-expiration rows", async () => {
    const result = await getMemberVolunteerTraining(NOW);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Sound-booth training",
          ministryName: "Worship Team",
          completedOnLabel: "Jan 15, 2026",
          expiresOnLabel: "Dec 1, 2026",
          status: "CURRENT",
          statusLabel: "Current",
        }),
        expect.objectContaining({
          title: "Safety orientation",
          ministryName: null,
          status: "EXPIRING_SOON",
          statusLabel: "Expiring soon",
        }),
        expect.objectContaining({
          title: "Nursery orientation",
          status: "EXPIRED",
          statusLabel: "Expired",
        }),
        expect.objectContaining({
          title: "Church policy training",
          expiresOnLabel: null,
          status: "NO_EXPIRATION",
          statusLabel: "No expiration date",
        }),
      ]),
    );
    expect(
      volunteerTrainingStatus(new Date("2026-12-01T00:00:00.000Z"), NOW),
    ).toBe("CURRENT");
    expect(
      volunteerTrainingStatus(new Date("2026-10-15T00:00:00.000Z"), NOW),
    ).toBe("EXPIRING_SOON");
    expect(
      volunteerTrainingStatus(new Date("2026-09-01T00:00:00.000Z"), NOW),
    ).toBe("EXPIRED");
    expect(volunteerTrainingStatus(null, NOW)).toBe("NO_EXPIRATION");
  });

  it("returns an empty list when the linked member has no active training", async () => {
    store.records = store.records.filter((row) => row.memberId !== MEMBER_ID);
    const result = await getMemberVolunteerTraining(NOW);
    expect(result).toEqual({ status: "READY", rows: [] });
    expect(store.lastRecordWhere).toEqual({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      archivedAt: null,
    });
  });
});
