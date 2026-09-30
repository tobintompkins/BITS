import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  EVENT_LOCATION_EXPORT_COLUMNS,
  MEMBER_DIRECTORY_EXPORT_COLUMNS,
  OPERATIONS_EXPORT_COLUMNS,
  churchDataExportNavItems,
} from "@/lib/validation/church-data-export";

type MemberRow = {
  organizationId: string;
  recordStatus: string;
  membershipStatus: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  suffix: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  maritalStatus: string | null;
  memberSince: Date | null;
  baptismDate: Date | null;
  salvationDate: Date | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  userAccountId: string | null;
  clerkUserId: string;
  passwordHash: string;
  stripeCustomerId: string;
  householdLinks: Array<{ household: { householdName: string } }>;
  emergencyContacts: Array<{ name: string; phone: string }>;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  equipment: [] as Array<Record<string, unknown>>,
  maintenance: [] as Array<Record<string, unknown>>,
  purchases: [] as Array<Record<string, unknown>>,
  checkouts: [] as Array<Record<string, unknown>>,
  locations: [] as Array<Record<string, unknown>>,
  lastMemberFilters: null as unknown,
  lastEquipmentWhere: null as unknown,
  lastMaintenanceWhere: null as unknown,
  lastPurchaseWhere: null as unknown,
  lastCheckoutWhere: null as unknown,
  lastLocationWhere: null as unknown,
  audits: [] as Array<Record<string, unknown>>,
  rateLimitKeys: [] as string[],
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getOrganizationAccess: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/permissions", () => ({
  getOrganizationAccess: mocks.getOrganizationAccess,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  assertActionAllowed: async (actionKey: string) => {
    store.rateLimitKeys.push(actionKey);
    return { allowed: true };
  },
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: async (input: Record<string, unknown>) => {
    store.audits.push(input);
    return input;
  },
}));

vi.mock("@/server/repositories/member.repository", () => ({
  findMembers: async (filters: {
    organizationId: string;
    recordStatus?: string;
    membershipStatus?: string;
  }) => {
    store.lastMemberFilters = filters;
    return store.members.filter((row) => {
      if (row.organizationId !== filters.organizationId) return false;
      if (filters.recordStatus && row.recordStatus !== filters.recordStatus) {
        return false;
      }
      if (
        filters.membershipStatus &&
        row.membershipStatus !== filters.membershipStatus
      ) {
        return false;
      }
      return true;
    });
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    equipmentItem: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string };
      }) => {
        store.lastEquipmentWhere = where;
        return store.equipment.filter(
          (row) => row.organizationId === where.organizationId,
        );
      },
    },
    maintenanceRequest: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string };
      }) => {
        store.lastMaintenanceWhere = where;
        return store.maintenance.filter(
          (row) => row.organizationId === where.organizationId,
        );
      },
    },
    purchaseRequest: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string };
      }) => {
        store.lastPurchaseWhere = where;
        return store.purchases.filter(
          (row) => row.organizationId === where.organizationId,
        );
      },
    },
    equipmentCheckout: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string };
      }) => {
        store.lastCheckoutWhere = where;
        return store.checkouts.filter(
          (row) => row.organizationId === where.organizationId,
        );
      },
    },
    eventLocation: {
      findMany: async ({
        where,
      }: {
        where: { organizationId: string };
      }) => {
        store.lastLocationWhere = where;
        return store.locations.filter(
          (row) => row.organizationId === where.organizationId,
        );
      },
    },
  },
}));

import {
  exportChurchData,
  getChurchDataExportAccess,
} from "./church-data-export.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";

function adminAccess(overrides?: {
  canEdit?: boolean;
  isSuperAdmin?: boolean;
  roleCode?: RoleCode | null;
}) {
  return {
    canEdit: overrides?.canEdit ?? true,
    isReadOnly: !(overrides?.canEdit ?? true),
    roleCode: overrides?.roleCode ?? RoleCode.ORG_ADMIN,
    isSuperAdmin: overrides?.isSuperAdmin ?? false,
  };
}

function seed() {
  store.members = [
    {
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
      membershipStatus: "MEMBER",
      firstName: "Ann",
      middleName: null,
      lastName: "Admin",
      preferredName: null,
      suffix: null,
      email: "ann@church.test",
      phone: "+15550100",
      alternatePhone: null,
      dateOfBirth: new Date("1990-01-15T00:00:00.000Z"),
      gender: "F",
      maritalStatus: "MARRIED",
      memberSince: new Date("2018-03-01T00:00:00.000Z"),
      baptismDate: null,
      salvationDate: null,
      addressLine1: "1 Church St",
      addressLine2: null,
      city: "Saco",
      state: "ME",
      postalCode: "04072",
      country: "US",
      notes: "Confidential pastoral note",
      userAccountId: USER_ID,
      clerkUserId: "user_secret_clerk",
      passwordHash: "hashed_password_secret",
      stripeCustomerId: "cus_secret_stripe",
      householdLinks: [{ household: { householdName: "Admin Household" } }],
      emergencyContacts: [{ name: "Hidden Contact", phone: "555-0199" }],
    },
    {
      organizationId: ORG_ID,
      recordStatus: "ARCHIVED",
      membershipStatus: "MEMBER",
      firstName: "Archived",
      middleName: null,
      lastName: "Person",
      preferredName: null,
      suffix: null,
      email: "archived@church.test",
      phone: null,
      alternatePhone: null,
      dateOfBirth: null,
      gender: null,
      maritalStatus: null,
      memberSince: null,
      baptismDate: null,
      salvationDate: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: "US",
      notes: null,
      userAccountId: null,
      clerkUserId: "user_archived",
      passwordHash: "nope",
      stripeCustomerId: "cus_archived",
      householdLinks: [],
      emergencyContacts: [],
    },
    {
      organizationId: OTHER_ORG,
      recordStatus: "ACTIVE",
      membershipStatus: "MEMBER",
      firstName: "Other",
      middleName: null,
      lastName: "Church",
      preferredName: null,
      suffix: null,
      email: "other@elsewhere.test",
      phone: null,
      alternatePhone: null,
      dateOfBirth: null,
      gender: null,
      maritalStatus: null,
      memberSince: null,
      baptismDate: null,
      salvationDate: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: "US",
      notes: null,
      userAccountId: null,
      clerkUserId: "user_other",
      passwordHash: "nope",
      stripeCustomerId: "cus_other",
      householdLinks: [],
      emergencyContacts: [],
    },
  ];

  store.equipment = [
    {
      organizationId: ORG_ID,
      name: "=CMD()",
      category: "Sound",
      quantity: 2,
      storageLocation: "Booth",
      status: "AVAILABLE",
      condition: "GOOD",
      notes: "Internal equipment note",
      archivedAt: null,
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    },
    {
      organizationId: OTHER_ORG,
      name: "Other Camera",
      category: "Video",
      quantity: 1,
      storageLocation: "Elsewhere",
      status: "AVAILABLE",
      condition: "GOOD",
      notes: "secret",
      archivedAt: null,
      updatedAt: new Date("2026-09-02T00:00:00.000Z"),
    },
  ];

  store.maintenance = [
    {
      organizationId: ORG_ID,
      title: "Fix speaker",
      description: "Private repair description",
      locationDescription: "Sanctuary",
      priority: "HIGH",
      status: "OPEN",
      resolutionNote: "Do not export this",
      createdAt: new Date("2026-09-03T00:00:00.000Z"),
      resolvedAt: null,
    },
  ];

  store.purchases = [
    {
      organizationId: ORG_ID,
      title: "New cables",
      description: "Need shielded cables",
      category: "Sound",
      estimatedAmountCents: 12500,
      stripePaymentIntent: "pi_secret_stripe",
      requestedForLocation: "Booth",
      status: "PENDING",
      decisionNote: "Hold for budget",
      requesterEmail: "blake@church.test",
      createdAt: new Date("2026-09-04T00:00:00.000Z"),
    },
  ];

  store.checkouts = [
    {
      organizationId: ORG_ID,
      quantity: 1,
      checkedOutAt: new Date("2026-09-05T00:00:00.000Z"),
      returnedAt: null,
      purpose: "Sunday service",
      returnNote: "Handle carefully",
      checkedOutToName: "Blake Treasurer",
      equipmentItem: {
        name: "Handheld mic",
        storageLocation: "Booth",
      },
    },
  ];

  store.locations = [
    {
      organizationId: ORG_ID,
      name: "Sanctuary",
      roomName: "Main sanctuary",
      isOnline: false,
      capacity: 220,
      isActive: true,
      address1: "1 Church St",
      address2: null,
      city: "Saco",
      state: "ME",
      zip: "04072",
      country: "US",
      onlineMeetingUrl: "https://meet.example/secret-room",
      description: "Do not export this description",
    },
    {
      organizationId: ORG_ID,
      name: "Online Prayer",
      roomName: null,
      isOnline: true,
      capacity: null,
      isActive: false,
      address1: null,
      address2: null,
      city: null,
      state: null,
      zip: null,
      country: "US",
      onlineMeetingUrl: "https://zoom.us/j/private",
      description: null,
    },
    {
      organizationId: OTHER_ORG,
      name: "Other Campus",
      roomName: "Hall",
      isOnline: false,
      capacity: 50,
      isActive: true,
      address1: "9 Other Rd",
      address2: null,
      city: "Portland",
      state: "ME",
      zip: "04101",
      country: "US",
      onlineMeetingUrl: "https://meet.example/other",
      description: null,
    },
  ];
}

beforeEach(() => {
  store.members = [];
  store.equipment = [];
  store.maintenance = [];
  store.purchases = [];
  store.checkouts = [];
  store.locations = [];
  store.lastMemberFilters = null;
  store.lastEquipmentWhere = null;
  store.lastMaintenanceWhere = null;
  store.lastPurchaseWhere = null;
  store.lastCheckoutWhere = null;
  store.lastLocationWhere = null;
  store.audits = [];
  store.rateLimitKeys = [];
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getOrganizationAccess.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: "ann@church.test",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getOrganizationAccess.mockResolvedValue(adminAccess());
  seed();
});

describe("church data export navigation", () => {
  it("shows Church Data Export only for permitted administrators", () => {
    expect(churchDataExportNavItems(false)).toEqual([]);
    expect(churchDataExportNavItems(true)).toEqual([
      { href: "/administration/data-export", label: "Church Data Export" },
    ]);
  });
});

describe("church data export access", () => {
  it("denies signed-out users", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getChurchDataExportAccess()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
  });

  it.each([
    RoleCode.TREASURER,
    RoleCode.DATA_ENTRY,
    RoleCode.REPORT_VIEWER,
    RoleCode.DONOR,
  ])("denies non-admin role %s", async (roleCode) => {
    mocks.getOrganizationAccess.mockResolvedValue(
      adminAccess({ canEdit: false, roleCode, isSuperAdmin: false }),
    );
    await expect(
      exportChurchData({
        exportType: "MEMBER_DIRECTORY",
        confirmed: true,
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(store.lastMemberFilters).toBeNull();
    expect(store.audits).toEqual([]);
  });

  it("lets organization administrators and super administrators export", async () => {
    await expect(getChurchDataExportAccess()).resolves.toEqual({
      status: "READY",
    });
    mocks.getOrganizationAccess.mockResolvedValue(
      adminAccess({ canEdit: true, isSuperAdmin: true }),
    );
    const result = await exportChurchData({
      exportType: "EVENT_LOCATIONS",
      confirmed: true,
    });
    expect(result.status).toBe("EXPORTED");
  });
});

describe("church data export", () => {
  it("requires confirmation and ignores client organization ids", async () => {
    await expect(
      exportChurchData({
        exportType: "MEMBER_DIRECTORY",
        confirmed: false,
        organizationId: OTHER_ORG,
      }),
    ).resolves.toEqual({ status: "UNCONFIRMED" });

    const result = await exportChurchData({
      exportType: "MEMBER_DIRECTORY",
      confirmed: true,
      organizationId: OTHER_ORG,
      memberId: "00000000-0000-4000-8000-00000000d001",
    });
    expect(result.status).toBe("EXPORTED");
    if (result.status !== "EXPORTED") return;
    expect(store.lastMemberFilters).toMatchObject({
      organizationId: ORG_ID,
      recordStatus: "ACTIVE",
    });
    expect(result.csv).not.toContain("other@elsewhere.test");
    expect(result.csv).not.toContain("Archived");
  });

  it("exports only allow-listed member directory fields", async () => {
    const result = await exportChurchData({
      exportType: "MEMBER_DIRECTORY",
      confirmed: true,
    });
    expect(result.status).toBe("EXPORTED");
    if (result.status !== "EXPORTED") return;
    expect(result.csv.split("\n")[0]).toBe(
      MEMBER_DIRECTORY_EXPORT_COLUMNS.join(","),
    );
    expect(result.csv).toContain("Ann");
    expect(result.csv).toContain("Admin Household");
    expect(result.rowCount).toBe(1);
    expect(result.csv).not.toContain("Confidential pastoral note");
    expect(result.csv).not.toContain("user_secret_clerk");
    expect(result.csv).not.toContain("hashed_password_secret");
    expect(result.csv).not.toContain("Hidden Contact");
    expect(result.csv).not.toContain("cus_secret_stripe");
    expect(result.csv.split("\n")[0]).not.toContain("notes");
  });

  it("filters member directory by validated membership status", async () => {
    await expect(
      exportChurchData({
        exportType: "MEMBER_DIRECTORY",
        confirmed: true,
        membershipStatus: "NOT_A_STATUS",
      }),
    ).resolves.toEqual({ status: "INVALID" });

    const result = await exportChurchData({
      exportType: "MEMBER_DIRECTORY",
      confirmed: true,
      membershipStatus: "VISITOR",
    });
    expect(result.status).toBe("EXPORTED");
    if (result.status !== "EXPORTED") return;
    expect(store.lastMemberFilters).toMatchObject({
      membershipStatus: "VISITOR",
      recordStatus: "ACTIVE",
    });
    expect(result.rowCount).toBe(0);
    expect(result.csv).toBe(MEMBER_DIRECTORY_EXPORT_COLUMNS.join(","));
    expect(result.message).toContain("No member directory records");
  });

  it("exports operations with allow-listed fields and no amounts, notes, or emails", async () => {
    const result = await exportChurchData({
      exportType: "OPERATIONS",
      confirmed: true,
      organizationId: OTHER_ORG,
    });
    expect(result.status).toBe("EXPORTED");
    if (result.status !== "EXPORTED") return;
    expect(store.lastEquipmentWhere).toEqual({ organizationId: ORG_ID });
    expect(store.lastPurchaseWhere).toEqual({ organizationId: ORG_ID });
    expect(result.csv.split("\n")[0]).toBe(OPERATIONS_EXPORT_COLUMNS.join(","));
    expect(result.csv).toContain("Equipment inventory");
    expect(result.csv).toContain("Maintenance request");
    expect(result.csv).toContain("Purchase request");
    expect(result.csv).toContain("Equipment check-out");
    expect(result.csv).toContain("New cables");
    expect(result.csv).toContain("Pending review");
    expect(result.csv).not.toContain("12500");
    expect(result.csv).not.toContain("pi_secret_stripe");
    expect(result.csv).not.toContain("blake@church.test");
    expect(result.csv).not.toContain("Private repair description");
    expect(result.csv).not.toContain("Do not export this");
    expect(result.csv).not.toContain("Hold for budget");
    expect(result.csv).not.toContain("Need shielded cables");
    expect(result.csv).not.toContain("Sunday service");
    expect(result.csv).not.toContain("Other Camera");
    expect(result.rowCount).toBe(4);
  });

  it("escapes spreadsheet formula injection in CSV cells", async () => {
    const result = await exportChurchData({
      exportType: "OPERATIONS",
      confirmed: true,
    });
    expect(result.status).toBe("EXPORTED");
    if (result.status !== "EXPORTED") return;
    expect(result.csv).toContain("'=CMD()");
    expect(result.csv).not.toMatch(/(?:^|,)=CMD\(\)/);
  });

  it("exports event locations without meeting URLs or other-org rows", async () => {
    const result = await exportChurchData({
      exportType: "EVENT_LOCATIONS",
      confirmed: true,
    });
    expect(result.status).toBe("EXPORTED");
    if (result.status !== "EXPORTED") return;
    expect(result.csv.split("\n")[0]).toBe(
      EVENT_LOCATION_EXPORT_COLUMNS.join(","),
    );
    expect(result.csv).toContain("Sanctuary");
    expect(result.csv).toContain("Online Prayer");
    expect(result.csv).toContain("Inactive");
    expect(result.csv).not.toContain("https://meet.example/secret-room");
    expect(result.csv).not.toContain("https://zoom.us/j/private");
    expect(result.csv).not.toContain("Other Campus");
    expect(result.csv).not.toContain("onlineMeetingUrl");
    expect(result.rowCount).toBe(2);
  });

  it("never includes giving, payment, or Stripe information", async () => {
    const result = await exportChurchData({
      exportType: "OPERATIONS",
      confirmed: true,
    });
    expect(result.status).toBe("EXPORTED");
    if (result.status !== "EXPORTED") return;
    const serialized = `${result.csv}\n${JSON.stringify(store.audits)}`;
    expect(serialized).not.toMatch(/stripe/i);
    expect(serialized).not.toContain("cus_");
    expect(serialized).not.toContain("pi_");
    expect(serialized).not.toContain("donation");
    expect(serialized).not.toContain("sk_live");
  });

  it("writes safe audit entries with export type and row count only", async () => {
    const result = await exportChurchData({
      exportType: "MEMBER_DIRECTORY",
      confirmed: true,
    });
    expect(result.status).toBe("EXPORTED");
    if (result.status !== "EXPORTED") return;
    expect(store.rateLimitKeys).toEqual([
      "church-data-export.member-directory",
    ]);
    expect(store.audits).toHaveLength(1);
    const audit = JSON.stringify(store.audits[0]);
    expect(store.audits[0]).toMatchObject({
      organizationId: ORG_ID,
      actorUserAccountId: USER_ID,
      action: "EXPORT_MEMBER_DIRECTORY",
      entityType: "ChurchDataExport",
    });
    expect(audit).toContain("MEMBER_DIRECTORY");
    expect(audit).toContain('"1"');
    expect(audit).not.toContain("ann@church.test");
    expect(audit).not.toContain("Confidential pastoral note");
    expect(audit).not.toContain("Ann");
    expect(audit).not.toContain("1 Church St");
  });
});
