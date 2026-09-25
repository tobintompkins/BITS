import { beforeEach, describe, expect, it, vi } from "vitest";

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  firstName: string;
  lastName: string;
  email: string;
  allowEmail: boolean;
  allowSms: boolean;
  allowPhoneCalls: boolean;
  allowPostalMail: boolean;
  allowDirectoryListing: boolean;
  allowPhotoUse: boolean;
  emailOptOutDate: Date | null;
  smsOptOutDate: Date | null;
  notes: string | null;
};

type ConsentRow = {
  memberId: string;
  consentType: string;
  previousValue: string | null;
  newValue: string;
  source: string;
  notes: string | null;
  changedByUserId: string | null;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  history: [] as ConsentRow[],
  lastMemberWhere: null as unknown,
  lastUpdateWhere: null as unknown,
  lastUpdateData: null as unknown,
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
      if (!row) return null;
      return {
        id: row.id,
        allowEmail: row.allowEmail,
        allowSms: row.allowSms,
        allowPhoneCalls: row.allowPhoneCalls,
        allowPostalMail: row.allowPostalMail,
      };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        id: string;
        organizationId: string;
        userAccountId: string;
        recordStatus: string;
      };
      data: Record<string, unknown>;
    }) => {
      store.lastUpdateWhere = where;
      store.lastUpdateData = data;
      const row = store.members.find(
        (item) =>
          item.id === where.id &&
          item.organizationId === where.organizationId &&
          item.userAccountId === where.userAccountId &&
          item.recordStatus === where.recordStatus,
      );
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };

  return {
    prisma: {
      member: memberApi,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          member: memberApi,
          memberConsentHistory: {
            create: async ({ data }: { data: ConsentRow }) => {
              store.history.push(data);
              return data;
            },
          },
        }),
    },
  };
});

import {
  getMemberCommunicationPreferences,
  updateMemberCommunicationPreferences,
} from "./member-communication-preferences.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const OTHER_USER = "00000000-0000-4000-8000-00000000c002";
const MEMBER_ID = "00000000-0000-4000-8000-00000000m001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000m002";
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
      allowEmail: true,
      allowSms: true,
      allowPhoneCalls: true,
      allowPostalMail: true,
      allowDirectoryListing: true,
      allowPhotoUse: true,
      emailOptOutDate: null,
      smsOptOutDate: null,
      notes: "staff only communication memo",
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: OTHER_USER,
      recordStatus: "ACTIVE",
      firstName: "Other",
      lastName: "Person",
      email: "other@church.test",
      allowEmail: true,
      allowSms: false,
      allowPhoneCalls: false,
      allowPostalMail: false,
      allowDirectoryListing: false,
      allowPhotoUse: false,
      emailOptOutDate: new Date("2024-01-01T00:00:00.000Z"),
      smsOptOutDate: new Date("2024-01-01T00:00:00.000Z"),
      notes: null,
    },
  ];
  store.history = [];
  store.lastMemberWhere = null;
  store.lastUpdateWhere = null;
  store.lastUpdateData = null;
}

const currentPreferences = {
  allowEmail: true,
  allowSms: true,
  allowPhoneCalls: true,
  allowPostalMail: true,
};

describe("member communication preferences", () => {
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

  it("returns signed out without querying members", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getMemberCommunicationPreferences()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
  });

  it("returns no organization without querying members", async () => {
    mocks.findPrimaryOrganization.mockResolvedValue(null);
    await expect(getMemberCommunicationPreferences()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastMemberWhere).toBeNull();
  });

  it("returns pending when no safe member portal link exists", async () => {
    store.members[0] = { ...store.members[0], userAccountId: null };
    await expect(getMemberCommunicationPreferences()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastUpdateWhere).toBeNull();
  });

  it("scopes reads to the current organization and linked member", async () => {
    const result = await getMemberCommunicationPreferences();
    expect(result).toEqual({
      status: "READY",
      preferences: currentPreferences,
    });
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    const text = JSON.stringify(result);
    expect(text).not.toContain(OWN_EMAIL);
    expect(text).not.toContain("Ann");
    expect(text).not.toContain(MEMBER_ID);
    expect(text).not.toContain("allowDirectoryListing");
    expect(text).not.toContain("allowPhotoUse");
    expect(text).not.toContain("staff only communication memo");
  });

  it("does not match members by name or email", async () => {
    await getMemberCommunicationPreferences();
    const memberWhere = JSON.stringify(store.lastMemberWhere);
    expect(memberWhere).not.toContain("email");
    expect(memberWhere).not.toContain(OWN_EMAIL);
    expect(memberWhere).not.toContain("Ann");
    expect(memberWhere).not.toContain(OTHER_ORG);
  });

  it("does not update when signed out or unlinked", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(
      updateMemberCommunicationPreferences(currentPreferences),
    ).resolves.toEqual({ status: "SIGNED_OUT" });

    mocks.getOrCreateUserAccount.mockResolvedValue({
      id: USER_ID,
      primaryEmail: OWN_EMAIL,
      displayName: "Ann Adams",
    });
    store.members[0] = { ...store.members[0], userAccountId: null };
    await expect(
      updateMemberCommunicationPreferences({
        allowEmail: false,
        allowSms: false,
        allowPhoneCalls: false,
        allowPostalMail: false,
      }),
    ).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastUpdateWhere).toBeNull();
    expect(store.history).toEqual([]);
  });

  it("rejects disallowed directory, photo, and identity fields", async () => {
    await expect(
      updateMemberCommunicationPreferences({
        ...currentPreferences,
        allowDirectoryListing: false,
        allowPhotoUse: false,
        memberId: OTHER_MEMBER,
      }),
    ).resolves.toEqual({ status: "INVALID" });
    expect(store.lastUpdateWhere).toBeNull();
    expect(store.history).toEqual([]);
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("updates only the signed-in linked member and records MEMBER_REQUEST history", async () => {
    const result = await updateMemberCommunicationPreferences({
      allowEmail: false,
      allowSms: true,
      allowPhoneCalls: false,
      allowPostalMail: true,
    });
    expect(result).toEqual({
      status: "READY",
      preferences: {
        allowEmail: false,
        allowSms: true,
        allowPhoneCalls: false,
        allowPostalMail: true,
      },
      unchanged: false,
    });
    expect(store.lastUpdateWhere).toEqual({
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(store.lastUpdateWhere).not.toEqual(
      expect.objectContaining({ id: OTHER_MEMBER }),
    );
    expect(store.history).toEqual([
      {
        memberId: MEMBER_ID,
        consentType: "EMAIL",
        previousValue: "true",
        newValue: "false",
        source: "MEMBER_REQUEST",
        notes: null,
        changedByUserId: USER_ID,
      },
      {
        memberId: MEMBER_ID,
        consentType: "PHONE_CALLS",
        previousValue: "true",
        newValue: "false",
        source: "MEMBER_REQUEST",
        notes: null,
        changedByUserId: USER_ID,
      },
    ]);
    expect(store.members[1].allowEmail).toBe(true);
  });

  it("sets and clears email and SMS opt-out dates when those flags change", async () => {
    await updateMemberCommunicationPreferences({
      allowEmail: false,
      allowSms: false,
      allowPhoneCalls: true,
      allowPostalMail: true,
    });
    const first = store.lastUpdateData as {
      emailOptOutDate: Date;
      smsOptOutDate: Date;
    };
    expect(first.emailOptOutDate).toBeInstanceOf(Date);
    expect(first.smsOptOutDate).toBeInstanceOf(Date);

    await updateMemberCommunicationPreferences({
      allowEmail: true,
      allowSms: true,
      allowPhoneCalls: true,
      allowPostalMail: true,
    });
    expect(store.lastUpdateData).toEqual(
      expect.objectContaining({
        emailOptOutDate: null,
        smsOptOutDate: null,
      }),
    );
  });

  it("does not write history or audit when nothing changed", async () => {
    await expect(
      updateMemberCommunicationPreferences(currentPreferences),
    ).resolves.toEqual({
      status: "READY",
      preferences: currentPreferences,
      unchanged: true,
    });
    expect(store.lastUpdateWhere).toBeNull();
    expect(store.history).toEqual([]);
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("writes a minimal audit event without sensitive free text", async () => {
    await updateMemberCommunicationPreferences({
      allowEmail: false,
      allowSms: true,
      allowPhoneCalls: true,
      allowPostalMail: true,
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(
      {
        organizationId: ORG_ID,
        actorUserAccountId: USER_ID,
        action: "UPDATE_MEMBER_COMMUNICATION_PREFERENCES",
        entityType: "Member",
        entityId: MEMBER_ID,
        changes: [
          { field: "allowEmail", oldValue: "true", newValue: "false" },
        ],
      },
      expect.anything(),
    );
    const text = JSON.stringify(mocks.createAuditEvent.mock.calls);
    expect(text).not.toContain(OWN_EMAIL);
    expect(text).not.toContain("Ann Adams");
    expect(text).not.toContain("staff only communication memo");
    expect(text).not.toContain("allowDirectoryListing");
    expect(text).not.toContain("allowPhotoUse");
    expect(text).not.toMatch(/notes/);
  });
});
