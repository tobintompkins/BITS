import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MEMBER_COMMUNICATION_HISTORY_ROW_FIELDS,
  formatConsentHistorySourceLabel,
  formatConsentHistoryTypeLabel,
  formatConsentHistoryValueLabel,
} from "@/lib/validation/member-communication-history";

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

type HistoryRow = {
  id: string;
  memberId: string;
  consentType: string;
  previousValue: string | null;
  newValue: string;
  source: string;
  notes: string | null;
  changedByUserId: string | null;
  changedAt: Date;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  history: [] as HistoryRow[],
  lastMemberWhere: null as unknown,
  lastHistoryWhere: null as unknown,
  lastHistorySelect: null as unknown,
  lastHistoryOrderBy: null as unknown,
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
    memberConsentHistory: {
      findMany: async ({
        where,
        select,
        orderBy,
      }: {
        where: {
          memberId: string;
          member: { organizationId: string };
        };
        select: unknown;
        orderBy: unknown;
      }) => {
        store.lastHistoryWhere = where;
        store.lastHistorySelect = select;
        store.lastHistoryOrderBy = orderBy;
        const member = store.members.find((item) => item.id === where.memberId);
        if (!member || member.organizationId !== where.member.organizationId) {
          return [];
        }
        return store.history
          .filter((row) => row.memberId === where.memberId)
          .sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())
          .map((row) => ({
            consentType: row.consentType,
            previousValue: row.previousValue,
            newValue: row.newValue,
            source: row.source,
            changedAt: row.changedAt,
          }));
      },
    },
  },
}));

import { getMemberCommunicationHistory } from "./member-communication-history.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const STAFF_ID = "00000000-0000-4000-8000-00000000c099";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000d003";
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
      userAccountId: "00000000-0000-4000-8000-00000000c002",
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
  store.history = [
    {
      id: "00000000-0000-4000-8000-00000000b001",
      memberId: MEMBER_ID,
      consentType: "EMAIL",
      previousValue: "true",
      newValue: "false",
      source: "MEMBER_REQUEST",
      notes: "member asked quietly",
      changedByUserId: USER_ID,
      changedAt: new Date("2026-09-01T12:00:00.000Z"),
    },
    {
      id: "00000000-0000-4000-8000-00000000b002",
      memberId: MEMBER_ID,
      consentType: "PHOTO_USE",
      previousValue: null,
      newValue: "true",
      source: "STAFF_UPDATE",
      notes: "staff private remark",
      changedByUserId: STAFF_ID,
      changedAt: new Date("2026-09-20T12:00:00.000Z"),
    },
    {
      id: "00000000-0000-4000-8000-00000000b003",
      memberId: MEMBER_ID,
      consentType: "DIRECTORY_LISTING",
      previousValue: "false",
      newValue: "true",
      source: "STAFF_UPDATE",
      notes: "do not show this note",
      changedByUserId: STAFF_ID,
      changedAt: new Date("2026-08-15T12:00:00.000Z"),
    },
    {
      id: "00000000-0000-4000-8000-00000000b004",
      memberId: OTHER_MEMBER,
      consentType: "SMS",
      previousValue: "true",
      newValue: "false",
      source: "STAFF_UPDATE",
      notes: "other member staff note",
      changedByUserId: STAFF_ID,
      changedAt: new Date("2026-09-22T12:00:00.000Z"),
    },
    {
      id: "00000000-0000-4000-8000-00000000b005",
      memberId: OTHER_ORG_MEMBER,
      consentType: "PHONE_CALLS",
      previousValue: "true",
      newValue: "false",
      source: "STAFF_UPDATE",
      notes: "other church note",
      changedByUserId: STAFF_ID,
      changedAt: new Date("2026-09-23T12:00:00.000Z"),
    },
  ];
}

beforeEach(() => {
  store.members = [];
  store.history = [];
  store.lastMemberWhere = null;
  store.lastHistoryWhere = null;
  store.lastHistorySelect = null;
  store.lastHistoryOrderBy = null;
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

describe("communication history labels", () => {
  it("formats consent types, sources, and boolean-like values", () => {
    expect(formatConsentHistoryTypeLabel("PHONE_CALLS")).toBe("Phone calls");
    expect(formatConsentHistoryTypeLabel("DIRECTORY_LISTING")).toBe(
      "Directory listing",
    );
    expect(formatConsentHistoryTypeLabel("PHOTO_USE")).toBe("Photo use");
    expect(formatConsentHistoryTypeLabel("SMS")).toBe("Text / SMS");
    expect(formatConsentHistorySourceLabel("MEMBER_PORTAL")).toBe(
      "You updated this in the member portal",
    );
    expect(formatConsentHistorySourceLabel("MEMBER_REQUEST")).toBe(
      "You updated this in the member portal",
    );
    expect(formatConsentHistorySourceLabel("STAFF_UPDATE")).toBe(
      "Updated by church staff",
    );
    expect(formatConsentHistoryValueLabel("true")).toBe("Allowed");
    expect(formatConsentHistoryValueLabel("false")).toBe("Not allowed");
    expect(formatConsentHistoryValueLabel(null)).toBe("Not recorded");
    expect(formatConsentHistoryValueLabel("Seasonal only")).toBe(
      "Seasonal only",
    );
  });
});

describe("member communication history access", () => {
  it("returns signed-out, no-organization, and pending states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getMemberCommunicationHistory()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastHistoryWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getMemberCommunicationHistory()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastHistoryWhere).toBeNull();

    store.members[0]!.userAccountId = null;
    await expect(getMemberCommunicationHistory()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastHistoryWhere).toBeNull();
  });

  it("queries only the current organization and signed-in linked member", async () => {
    await getMemberCommunicationHistory();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("email");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OWN_EMAIL);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("Adams");
    expect(store.lastHistoryWhere).toEqual({
      memberId: MEMBER_ID,
      member: { organizationId: ORG_ID },
    });
  });
});

describe("member communication history rows", () => {
  it("returns newest-first rows for the linked member only", async () => {
    const result = await getMemberCommunicationHistory();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastHistoryOrderBy).toEqual({ changedAt: "desc" });
    expect(result.rows.map((row) => row.preferenceLabel)).toEqual([
      "Photo use",
      "Email",
      "Directory listing",
    ]);
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("blake@church.test");
    expect(payload).not.toContain("other@elsewhere.test");
    expect(payload).not.toContain("Text / SMS");
    expect(payload).not.toContain("Phone calls");
  });

  it("returns only the safe selected fields", async () => {
    const result = await getMemberCommunicationHistory();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastHistorySelect).toEqual({
      consentType: true,
      previousValue: true,
      newValue: true,
      source: true,
      changedAt: true,
    });
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...MEMBER_COMMUNICATION_HISTORY_ROW_FIELDS].sort(),
    );
    expect(result.rows[0]).toEqual({
      preferenceLabel: "Photo use",
      previousValueLabel: "Not recorded",
      newValueLabel: "Allowed",
      sourceLabel: "Updated by church staff",
      changedAtLabel: "Sep 20, 2026",
    });
    expect(result.rows[1]).toEqual({
      preferenceLabel: "Email",
      previousValueLabel: "Allowed",
      newValueLabel: "Not allowed",
      sourceLabel: "You updated this in the member portal",
      changedAtLabel: "Sep 1, 2026",
    });
  });

  it("omits notes, staff identity, other-member data, and client-supplied IDs", async () => {
    const result = await getMemberCommunicationHistory();
    expect(result.status).toBe("READY");
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("staff private remark");
    expect(payload).not.toContain("member asked quietly");
    expect(payload).not.toContain("pastoral note");
    expect(payload).not.toContain(STAFF_ID);
    expect(payload).not.toContain(USER_ID);
    expect(payload).not.toContain(MEMBER_ID);
    expect(payload).not.toContain("00000000-0000-4000-8000-00000000b002");
    expect(JSON.stringify(store.lastHistorySelect)).not.toContain("notes");
    expect(JSON.stringify(store.lastHistorySelect)).not.toContain(
      "changedByUserId",
    );
  });
});
