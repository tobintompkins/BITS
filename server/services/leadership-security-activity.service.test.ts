import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";
import {
  LEADERSHIP_SECURITY_ACTIVITY_LIMIT,
  LEADERSHIP_SECURITY_ACTIVITY_UNKNOWN_ACTOR,
  leadershipSecurityActivityAllowList,
  leadershipSecurityActivityNavItems,
} from "@/lib/validation/leadership-security-activity";

type AuditRecord = {
  id: string;
  organizationId: string;
  actorUserAccountId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changeMetadata: unknown;
  occurredAt: Date;
  actorEmail: string | null;
  actorDisplayName: string | null;
};

const store = vi.hoisted(() => ({
  records: [] as AuditRecord[],
  lastQuery: null as null | {
    organizationId: string;
    allowList: Array<{ entityType: string; action: string }>;
    take: number;
  },
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

vi.mock("@/server/repositories/audit-event.repository", () => ({
  findAllowListedAuditEvents: async (query: {
    organizationId: string;
    allowList: Array<{ entityType: string; action: string }>;
    take: number;
  }) => {
    store.lastQuery = query;
    const allowed = new Set(
      query.allowList.map((item) => `${item.entityType}:${item.action}`),
    );
    return store.records
      .filter((row) => row.organizationId === query.organizationId)
      .filter((row) => allowed.has(`${row.entityType}:${row.action}`))
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, query.take)
      .map((row) => ({
        action: row.action,
        entityType: row.entityType,
        occurredAt: row.occurredAt,
        changeMetadata: row.changeMetadata,
        id: row.id,
        entityId: row.entityId,
        actorUserAccountId: row.actorUserAccountId,
        organizationId: row.organizationId,
        actor: row.actorUserAccountId
          ? {
              displayName: row.actorDisplayName,
              primaryEmail: row.actorEmail,
            }
          : null,
      }));
  },
}));

import { getLeadershipSecurityActivity } from "./leadership-security-activity.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DOCUMENT_ID = "00000000-0000-4000-8000-00000000d001";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d002";
const EVENT_ID = "00000000-0000-4000-8000-00000000e001";

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

function record(
  overrides: Partial<AuditRecord> &
    Pick<AuditRecord, "id" | "action" | "entityType" | "occurredAt">,
): AuditRecord {
  return {
    organizationId: ORG_ID,
    actorUserAccountId: USER_ID,
    entityId: DOCUMENT_ID,
    changeMetadata: { changes: [] },
    actorEmail: "ann@church.test",
    actorDisplayName: "Ann Admin",
    ...overrides,
  };
}

function seed() {
  store.records = [
    record({
      id: "00000000-0000-4000-8000-00000000e010",
      action: "UPLOAD_LEADERSHIP_DOCUMENT",
      entityType: "LeadershipDocument",
      occurredAt: new Date("2026-09-30T15:00:00.000Z"),
      changeMetadata: {
        changes: [
          { field: "title", oldValue: null, newValue: "set" },
          {
            field: "documentType",
            oldValue: null,
            newValue: "BOARD_MINUTES",
          },
          {
            field: "fileKey",
            oldValue: null,
            newValue: "storage/private/leadership/secret-file.pdf",
          },
          {
            field: "secret",
            oldValue: null,
            newValue: "sk_test_should_never_appear",
          },
        ],
      },
    }),
    record({
      id: "00000000-0000-4000-8000-00000000e011",
      action: "APPROVE_FINANCIAL_CORRECTION",
      entityType: "FinancialCorrectionRequest",
      entityId: "00000000-0000-4000-8000-00000000d003",
      occurredAt: new Date("2026-09-30T16:00:00.000Z"),
      changeMetadata: {
        changes: [
          { field: "status", oldValue: "PENDING", newValue: "APPROVED" },
          {
            field: "estimatedAmountCents",
            oldValue: "12500",
            newValue: "12500",
          },
          {
            field: "bankAccount",
            oldValue: null,
            newValue: "acct_secret_999",
          },
        ],
      },
    }),
    record({
      id: "00000000-0000-4000-8000-00000000e012",
      action: "UPDATE_PRIVACY_DATA_REQUEST_STATUS",
      entityType: "MemberPrivacyDataRequest",
      entityId: "00000000-0000-4000-8000-00000000d004",
      occurredAt: new Date("2026-09-29T12:00:00.000Z"),
      actorDisplayName: "   ",
      changeMetadata: {
        changes: [
          { field: "status", oldValue: "OPEN", newValue: "COMPLETED" },
          { field: "requestType", oldValue: null, newValue: "DATA_COPY" },
          {
            field: "staffResolutionNote",
            oldValue: null,
            newValue: "Internal note with 555-0100",
          },
        ],
      },
    }),
    record({
      id: "00000000-0000-4000-8000-00000000e013",
      action: "UPDATE_MEMBER",
      entityType: "Member",
      entityId: MEMBER_ID,
      occurredAt: new Date("2026-09-30T18:00:00.000Z"),
      changeMetadata: {
        changes: [
          { field: "email", oldValue: null, newValue: "member@church.test" },
        ],
      },
    }),
    record({
      id: "00000000-0000-4000-8000-00000000e014",
      action: "VIEW_GENERATED_CONTRIBUTION_STATEMENT",
      entityType: "ContributionStatement",
      entityId: "00000000-0000-4000-8000-00000000d005",
      occurredAt: new Date("2026-09-30T17:30:00.000Z"),
    }),
    record({
      id: "00000000-0000-4000-8000-00000000e015",
      organizationId: OTHER_ORG,
      action: "UPLOAD_LEADERSHIP_DOCUMENT",
      entityType: "LeadershipDocument",
      occurredAt: new Date("2026-09-30T19:00:00.000Z"),
      actorDisplayName: "Other Church Admin",
      actorEmail: "other@elsewhere.test",
    }),
    record({
      id: "00000000-0000-4000-8000-00000000e016",
      action: "UPDATE",
      entityType: "Organization",
      entityId: ORG_ID,
      actorUserAccountId: null,
      actorDisplayName: null,
      actorEmail: null,
      occurredAt: new Date("2026-09-28T09:00:00.000Z"),
      changeMetadata: {
        changes: [
          {
            field: "legalName",
            oldValue: "Old Name",
            newValue: "First UPC of Saco",
          },
          {
            field: "logoStorageKey",
            oldValue: null,
            newValue: "storage/public/logos/church.png",
          },
        ],
      },
    }),
  ];
}

beforeEach(() => {
  store.records = [];
  store.lastQuery = null;
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

describe("leadership security activity navigation", () => {
  it("shows Security Activity only for permitted administrators", () => {
    expect(leadershipSecurityActivityNavItems(false)).toEqual([]);
    expect(leadershipSecurityActivityNavItems(true)).toEqual([
      {
        href: "/administration/security-activity",
        label: "Security Activity",
      },
    ]);
  });
});

describe("leadership security activity", () => {
  it("denies signed-out users without querying audit records", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getLeadershipSecurityActivity()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastQuery).toBeNull();
    expect(mocks.getOrganizationAccess).not.toHaveBeenCalled();
  });

  it.each([
    RoleCode.TREASURER,
    RoleCode.DATA_ENTRY,
    RoleCode.REPORT_VIEWER,
    RoleCode.DONOR,
  ])("denies non-admin role %s without listing audit records", async (roleCode) => {
    mocks.getOrganizationAccess.mockResolvedValue(
      adminAccess({ canEdit: false, roleCode, isSuperAdmin: false }),
    );
    await expect(getLeadershipSecurityActivity()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    expect(store.lastQuery).toBeNull();
  });

  it("lets organization administrators review current-organization activity", async () => {
    const result = await getLeadershipSecurityActivity();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(mocks.getOrganizationAccess).toHaveBeenCalledWith(ORG_ID);
    expect(store.lastQuery?.organizationId).toBe(ORG_ID);
    expect(store.lastQuery?.take).toBe(LEADERSHIP_SECURITY_ACTIVITY_LIMIT);
  });

  it("lets super administrators review current-organization activity", async () => {
    mocks.getOrganizationAccess.mockResolvedValue(
      adminAccess({ canEdit: true, isSuperAdmin: true }),
    );
    const result = await getLeadershipSecurityActivity();
    expect(result.status).toBe("READY");
  });

  it("scopes the list to the current organization and ignores client ids", async () => {
    const result = await getLeadershipSecurityActivity({
      organizationId: OTHER_ORG,
      actorId: USER_ID,
      eventId: EVENT_ID,
      entityId: DOCUMENT_ID,
      limit: 5,
    });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastQuery?.organizationId).toBe(ORG_ID);
    expect(store.lastQuery?.take).toBe(100);
    expect(result.rows.some((row) => row.performedBy === "Other Church Admin")).toBe(
      false,
    );
  });

  it("returns only explicit allow-list action and entity pairs", async () => {
    const result = await getLeadershipSecurityActivity();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.rows.map((row) => row.actionLabel)).toEqual([
      "Approved a financial correction",
      "Uploaded a leadership document",
      "Updated a privacy request",
      "Updated organization settings",
    ]);
    const allowList = store.lastQuery?.allowList ?? [];
    expect(
      allowList.some(
        (item) =>
          item.entityType === "Member" && item.action === "UPDATE_MEMBER",
      ),
    ).toBe(false);
    expect(
      allowList.some(
        (item) => item.action === "VIEW_GENERATED_CONTRIBUTION_STATEMENT",
      ),
    ).toBe(false);
    expect(leadershipSecurityActivityAllowList()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "LeadershipDocument",
          action: "UPLOAD_LEADERSHIP_DOCUMENT",
        }),
      ]),
    );
  });

  it("sorts newest first and validates the category filter", async () => {
    const ready = await getLeadershipSecurityActivity();
    expect(ready.status).toBe("READY");
    if (ready.status !== "READY") return;
    expect(ready.rows.map((row) => row.actionLabel)).toEqual([
      "Approved a financial correction",
      "Uploaded a leadership document",
      "Updated a privacy request",
      "Updated organization settings",
    ]);

    await expect(
      getLeadershipSecurityActivity({ category: "EVERYTHING" }),
    ).resolves.toEqual({ status: "INVALID_FILTER" });

    const documents = await getLeadershipSecurityActivity({
      category: "DOCUMENTS",
    });
    expect(documents.status).toBe("READY");
    if (documents.status !== "READY") return;
    expect(documents.rows).toHaveLength(1);
    expect(documents.rows[0]?.category).toBe("DOCUMENTS");
    expect(store.lastQuery?.allowList.every((item) => item.entityType === "LeadershipDocument")).toBe(
      true,
    );
  });

  it("never returns raw metadata, ids, actor email, file paths, or secret-like fields", async () => {
    const result = await getLeadershipSecurityActivity();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("ann@church.test");
    expect(serialized).not.toContain("storage/private");
    expect(serialized).not.toContain("sk_test_should_never_appear");
    expect(serialized).not.toContain("acct_secret_999");
    expect(serialized).not.toContain("12500");
    expect(serialized).not.toContain("Internal note");
    expect(serialized).not.toContain(DOCUMENT_ID);
    expect(serialized).not.toContain(MEMBER_ID);
    expect(serialized).not.toContain("changeMetadata");
    expect(serialized).not.toContain("primaryEmail");
    expect(serialized).not.toContain("entityId");
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        actionLabel: expect.any(String),
        categoryLabel: expect.any(String),
        performedBy: expect.any(String),
        summary: expect.any(String),
        occurredAtLabel: expect.any(String),
      }),
    );
    expect(result.rows[0]).not.toHaveProperty("id");
    expect(result.rows[0]).not.toHaveProperty("entityId");
    expect(result.rows[0]).not.toHaveProperty("changeMetadata");
  });

  it("uses friendly labels and safe summaries from allow-listed fields", async () => {
    const result = await getLeadershipSecurityActivity();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const documentRow = result.rows.find(
      (row) => row.category === "DOCUMENTS",
    );
    const financialRow = result.rows.find(
      (row) => row.category === "FINANCIAL",
    );
    const privacyRow = result.rows.find((row) => row.category === "PRIVACY");
    const organizationRow = result.rows.find(
      (row) => row.category === "ORGANIZATION",
    );
    expect(documentRow?.actionLabel).toBe("Uploaded a leadership document");
    expect(documentRow?.summary).toContain("A leadership document was uploaded.");
    expect(documentRow?.summary).toContain("Document type: Board Minutes.");
    expect(financialRow?.summary).toContain(
      "A financial correction was approved.",
    );
    expect(financialRow?.summary).toContain("Status is now Approved.");
    expect(privacyRow?.summary).toContain(
      "A privacy data request decision was recorded.",
    );
    expect(organizationRow?.summary).toBe(
      "Organization settings were updated.",
    );
    expect(organizationRow?.summary).not.toContain("First UPC of Saco");
    expect(result.relatedLinks).toEqual([
      { href: "/administration/staff-access", label: "Staff Access" },
      { href: "/leadership-documents", label: "Leadership Documents" },
    ]);
  });

  it("falls back when the actor is missing or unnamed", async () => {
    const result = await getLeadershipSecurityActivity();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const privacyRow = result.rows.find((row) => row.category === "PRIVACY");
    const organizationRow = result.rows.find(
      (row) => row.category === "ORGANIZATION",
    );
    expect(privacyRow?.performedBy).toBe(
      LEADERSHIP_SECURITY_ACTIVITY_UNKNOWN_ACTOR,
    );
    expect(organizationRow?.performedBy).toBe(
      LEADERSHIP_SECURITY_ACTIVITY_UNKNOWN_ACTOR,
    );
  });
});
