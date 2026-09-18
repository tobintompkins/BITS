import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { getGivingCapabilitiesForRole } from "@/lib/auth/giving-permissions";

type StatementRow = {
  id: string;
  organizationId: string;
  statementType: StatementType;
  status: StatementStatus;
  taxYear: number | null;
  periodStart: Date;
  periodEnd: Date;
  statementIdentifier: string;
  deductibleTotal: { toString(): string };
  generatedAt: Date;
  donorId: string | null;
  householdId: string | null;
  pdfStorageKey: string;
  pdfChecksum: string;
  mailingAddressLine1?: string;
  stripePaymentIntentId?: string;
  note?: string;
};

type DonorRow = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
};

type HouseholdRow = {
  id: string;
  organizationId: string;
  displayName: string;
};

type AuditRow = {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  occurredAt: Date;
  changeMetadata: unknown;
  actor: {
    displayName: string | null;
    primaryEmail: string;
  } | null;
};

const store = vi.hoisted(() => ({
  statements: [] as StatementRow[],
  donors: [] as DonorRow[],
  households: [] as HouseholdRow[],
  events: [] as AuditRow[],
  lastFindFirstWhere: null as unknown,
  lastAuditWhere: null as unknown,
  lastAuditTake: null as number | null,
}));

const mocks = vi.hoisted(() => ({
  findPrimaryOrganization: vi.fn(),
  getGivingAccess: vi.fn(),
  getOrCreateUserAccount: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/lib/auth/giving-permissions", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/giving-permissions")
  >("@/lib/auth/giving-permissions");
  return {
    ...actual,
    getGivingAccess: mocks.getGivingAccess,
    requireStatementViewAccess: async (organizationId: string) => {
      const access = await mocks.getGivingAccess(organizationId);
      if (!access.canViewStatements) throw new Error("denied");
      return access;
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    contributionStatement: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        store.lastFindFirstWhere = where;
        const row = store.statements.find(
          (statement) =>
            statement.id === where.id &&
            statement.organizationId === where.organizationId,
        );
        if (!row) return null;
        return {
          id: row.id,
          statementIdentifier: row.statementIdentifier,
          statementType: row.statementType,
          status: row.status,
          taxYear: row.taxYear,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          deductibleTotal: row.deductibleTotal,
          generatedAt: row.generatedAt,
          donorId: row.donorId,
          householdId: row.householdId,
          donor:
            store.donors.find((donor) => donor.id === row.donorId) ?? null,
          household:
            store.households.find(
              (household) => household.id === row.householdId,
            ) ?? null,
        };
      },
    },
    auditEvent: {
      findMany: async ({
        where,
        take,
      }: {
        where: {
          organizationId: string;
          entityType: string;
          entityId: string | { in: string[] };
        };
        take: number;
      }) => {
        store.lastAuditWhere = where;
        store.lastAuditTake = take;
        const entityIds =
          typeof where.entityId === "string"
            ? [where.entityId]
            : where.entityId.in;
        return store.events
          .filter(
            (event) =>
              event.organizationId === where.organizationId &&
              event.entityType === where.entityType &&
              entityIds.includes(event.entityId),
          )
          .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
          .slice(0, take);
      },
    },
    statementVoidRequest: {
      findMany: async () => [],
    },
  },
}));

import {
  APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST,
  EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST,
  GENERATE_CONTRIBUTION_STATEMENT,
  PUBLISH_CONTRIBUTION_STATEMENT,
  REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST,
  REISSUE_CONTRIBUTION_STATEMENT,
  REQUEST_CONTRIBUTION_STATEMENT_VOID,
  UNKNOWN_STATEMENT_ACTIVITY_LABEL,
  VIEW_GENERATED_CONTRIBUTION_STATEMENT,
  VOID_CONTRIBUTION_STATEMENT,
  getStatementAuditTimeline,
  statementAuditActionLabel,
  summarizeStatementAuditChanges,
} from "./statement-audit-timeline.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const DONOR_ANN = "00000000-0000-4000-8000-00000000d001";
const OTHER_DONOR = "00000000-0000-4000-8000-00000000d099";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-00000000e001";
const STMT = "00000000-0000-4000-8000-00000000b001";
const STMT_OTHER = "00000000-0000-4000-8000-00000000b002";
const STMT_HH = "00000000-0000-4000-8000-00000000b003";
const ACTOR_ID = "00000000-0000-4000-8000-00000000c099";

function seed() {
  store.donors = [
    {
      id: DONOR_ANN,
      organizationId: ORG_ID,
      firstName: "Ann",
      lastName: "Adams",
    },
    {
      id: OTHER_DONOR,
      organizationId: OTHER_ORG,
      firstName: "Other",
      lastName: "Org",
    },
  ];
  store.households = [
    {
      id: HOUSEHOLD_ID,
      organizationId: ORG_ID,
      displayName: "Adams Household",
    },
  ];
  store.statements = [
    {
      id: STMT,
      organizationId: ORG_ID,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.PUBLISHED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      statementIdentifier: "IND-2026-ADAM",
      deductibleTotal: { toString: () => "90.00" },
      generatedAt: new Date("2026-09-10T12:00:00.000Z"),
      donorId: DONOR_ANN,
      householdId: null,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT}/file.pdf`,
      pdfChecksum: "a".repeat(64),
      mailingAddressLine1: "10 Oak Street",
      stripePaymentIntentId: "pi_secret",
      note: "internal memo",
    },
    {
      id: STMT_OTHER,
      organizationId: OTHER_ORG,
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.GENERATED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      statementIdentifier: "IND-2026-OTHER",
      deductibleTotal: { toString: () => "999.00" },
      generatedAt: new Date("2026-09-11T12:00:00.000Z"),
      donorId: OTHER_DONOR,
      householdId: null,
      pdfStorageKey: `private/statements/${OTHER_ORG}/${STMT_OTHER}/file.pdf`,
      pdfChecksum: "b".repeat(64),
    },
    {
      id: STMT_HH,
      organizationId: ORG_ID,
      statementType: StatementType.HOUSEHOLD,
      status: StatementStatus.GENERATED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      statementIdentifier: "HH-2026-ADAMS",
      deductibleTotal: { toString: () => "150.00" },
      generatedAt: new Date("2026-09-12T12:00:00.000Z"),
      donorId: null,
      householdId: HOUSEHOLD_ID,
      pdfStorageKey: `private/statements/${ORG_ID}/${STMT_HH}/file.pdf`,
      pdfChecksum: "c".repeat(64),
    },
  ];
  store.events = [
    {
      id: "event-generate",
      organizationId: ORG_ID,
      entityType: "ContributionStatement",
      entityId: STMT,
      action: GENERATE_CONTRIBUTION_STATEMENT,
      occurredAt: new Date("2026-09-10T12:00:00.000Z"),
      actor: { displayName: "Terry Treasurer", primaryEmail: "terry@church.test" },
      changeMetadata: {
        changes: [
          { field: "statementType", oldValue: null, newValue: "INDIVIDUAL" },
          { field: "taxYear", oldValue: null, newValue: "2026" },
          { field: "recipientId", oldValue: null, newValue: DONOR_ANN },
          { field: "deductibleTotal", oldValue: null, newValue: "90.00" },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: "IND-2026-ADAM",
          },
          { field: "status", oldValue: null, newValue: "GENERATED" },
          {
            field: "pdfStorageKey",
            oldValue: null,
            newValue: `private/statements/${ORG_ID}/${STMT}/file.pdf`,
          },
          { field: "pdfChecksum", oldValue: null, newValue: "a".repeat(64) },
          {
            field: "mailingAddress",
            oldValue: null,
            newValue: "10 Oak Street",
          },
          { field: "stripePaymentIntentId", oldValue: null, newValue: "pi_secret" },
          { field: "internalNotes", oldValue: null, newValue: "internal memo" },
        ],
      },
    },
    {
      id: "event-view",
      organizationId: ORG_ID,
      entityType: "ContributionStatement",
      entityId: STMT,
      action: VIEW_GENERATED_CONTRIBUTION_STATEMENT,
      occurredAt: new Date("2026-09-11T09:00:00.000Z"),
      actor: { displayName: null, primaryEmail: "reviewer@church.test" },
      changeMetadata: {
        changes: [
          { field: "statementType", oldValue: null, newValue: "INDIVIDUAL" },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: "IND-2026-ADAM",
          },
          { field: "status", oldValue: null, newValue: "GENERATED" },
        ],
      },
    },
    {
      id: "event-publish",
      organizationId: ORG_ID,
      entityType: "ContributionStatement",
      entityId: STMT,
      action: PUBLISH_CONTRIBUTION_STATEMENT,
      occurredAt: new Date("2026-09-12T15:00:00.000Z"),
      actor: { displayName: "Patty Pastor", primaryEmail: "patty@church.test" },
      changeMetadata: {
        changes: [
          { field: "status", oldValue: "GENERATED", newValue: "PUBLISHED" },
          { field: "statementType", oldValue: null, newValue: "INDIVIDUAL" },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: "IND-2026-ADAM",
          },
          { field: "taxYear", oldValue: null, newValue: "2026" },
          { field: "deductibleTotal", oldValue: null, newValue: "90.00" },
          {
            field: "generatedByUserAccountId",
            oldValue: null,
            newValue: ACTOR_ID,
          },
          {
            field: "publishedByUserAccountId",
            oldValue: null,
            newValue: USER_ID,
          },
        ],
      },
    },
    {
      id: "event-other-statement",
      organizationId: ORG_ID,
      entityType: "ContributionStatement",
      entityId: STMT_HH,
      action: GENERATE_CONTRIBUTION_STATEMENT,
      occurredAt: new Date("2026-09-12T12:00:00.000Z"),
      actor: { displayName: "Terry Treasurer", primaryEmail: "terry@church.test" },
      changeMetadata: {
        changes: [
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: "HH-2026-ADAMS",
          },
        ],
      },
    },
    {
      id: "event-other-org",
      organizationId: OTHER_ORG,
      entityType: "ContributionStatement",
      entityId: STMT,
      action: GENERATE_CONTRIBUTION_STATEMENT,
      occurredAt: new Date("2026-09-10T08:00:00.000Z"),
      actor: { displayName: "Other Staff", primaryEmail: "other@org.test" },
      changeMetadata: {
        changes: [
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: "IND-2026-LEAK",
          },
        ],
      },
    },
  ];
}

describe("statement audit timeline", () => {
  beforeEach(() => {
    seed();
    store.lastFindFirstWhere = null;
    store.lastAuditWhere = null;
    store.lastAuditTake = null;
    vi.clearAllMocks();
    mocks.findPrimaryOrganization.mockResolvedValue({
      id: ORG_ID,
      name: "First United Pentecostal Church",
      displayName: "First UPC",
    });
    mocks.getOrCreateUserAccount.mockResolvedValue({ id: USER_ID });
    mocks.getGivingAccess.mockResolvedValue(
      getGivingCapabilitiesForRole(RoleCode.TREASURER),
    );
  });

  it("rejects signed-out users without looking up a statement", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValue(null);
    await expect(getStatementAuditTimeline(STMT)).rejects.toMatchObject({
      code: "SIGNED_OUT",
    });
    expect(store.lastFindFirstWhere).toBeNull();
    expect(store.lastAuditWhere).toBeNull();
  });

  it.each([RoleCode.DATA_ENTRY, RoleCode.DONOR])(
    "rejects %s without revealing whether the statement exists",
    async (role) => {
      mocks.getGivingAccess.mockResolvedValue(
        getGivingCapabilitiesForRole(role),
      );
      await expect(getStatementAuditTimeline(STMT)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(store.lastFindFirstWhere).toBeNull();
      expect(store.lastAuditWhere).toBeNull();
    },
  );

  it("returns the same not-found error for invalid ids and other-organization records", async () => {
    await expect(getStatementAuditTimeline("not-a-uuid")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(store.lastFindFirstWhere).toBeNull();
    expect(store.lastAuditWhere).toBeNull();

    await expect(getStatementAuditTimeline(STMT_OTHER)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(store.lastFindFirstWhere).toMatchObject({
      id: STMT_OTHER,
      organizationId: ORG_ID,
    });
    expect(store.lastAuditWhere).toBeNull();
  });

  it("scopes the statement and audit query to the current organization", async () => {
    const result = await getStatementAuditTimeline(STMT);
    expect(store.lastFindFirstWhere).toEqual({
      id: STMT,
      organizationId: ORG_ID,
    });
    expect(store.lastAuditWhere).toEqual({
      organizationId: ORG_ID,
      entityType: "ContributionStatement",
      entityId: STMT,
    });
    expect(store.lastAuditTake).toBe(100);
    expect(result.statement.recipientLabel).toBe("Ann Adams");
    expect(result.events.map((event) => event.id)).not.toContain(
      "event-other-org",
    );
    expect(JSON.stringify(result)).not.toContain("IND-2026-LEAK");
  });

  it("does not include audit rows from another statement", async () => {
    const result = await getStatementAuditTimeline(STMT);
    expect(result.events.map((event) => event.id)).toEqual([
      "event-generate",
      "event-view",
      "event-publish",
    ]);
    expect(JSON.stringify(result)).not.toContain("HH-2026-ADAMS");
  });

  it("returns events oldest first and uses friendly action labels", async () => {
    const result = await getStatementAuditTimeline(STMT);
    expect(result.events.map((event) => event.id)).toEqual([
      "event-generate",
      "event-view",
      "event-publish",
    ]);
    expect(result.events.map((event) => event.actionLabel)).toEqual([
      "Generate contribution statement",
      "View generated statement for review",
      "Publish contribution statement",
    ]);
    expect(result.events[1]?.actorLabel).toBe("reviewer@church.test");
    expect(result.events[2]?.summary).toContain(
      "Status changed from Generated to Published.",
    );
  });

  it("caps the timeline at 100 events from the most recent history", async () => {
    store.events = Array.from({ length: 101 }, (_, index) => ({
      id: `event-${String(index).padStart(3, "0")}`,
      organizationId: ORG_ID,
      entityType: "ContributionStatement",
      entityId: STMT,
      action: VIEW_GENERATED_CONTRIBUTION_STATEMENT,
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      actor: { displayName: "Terry Treasurer", primaryEmail: "terry@church.test" },
      changeMetadata: { changes: [] },
    }));

    const result = await getStatementAuditTimeline(STMT);
    expect(result.events).toHaveLength(100);
    expect(store.lastAuditTake).toBe(100);
    expect(result.events[0]?.id).toBe("event-001");
    expect(result.events.at(-1)?.id).toBe("event-100");
    expect(result.events.map((event) => event.id)).not.toContain("event-000");
  });

  it("allow-lists status, type, year, total, and identifier without leaking sensitive metadata", async () => {
    const result = await getStatementAuditTimeline(STMT);
    const json = JSON.stringify(result);
    expect(result.events[0]?.summary).toContain("Type set to Individual.");
    expect(result.events[0]?.summary).toContain("Tax year set to 2026.");
    expect(result.events[0]?.summary).toContain("Deductible total set to $90.00.");
    expect(result.events[0]?.summary).toContain("Identifier set to IND-2026-ADAM.");
    expect(result.events[0]?.summary).toContain("Status set to Generated.");
    expect(json).not.toMatch(
      /private\/statements|checksum|10 Oak|pi_secret|internal memo/i,
    );
    expect(json).not.toContain(DONOR_ANN);
    expect(json).not.toContain(ACTOR_ID);
    expect(json).not.toContain("changeMetadata");
    expect(json).not.toContain(GENERATE_CONTRIBUTION_STATEMENT);
    expect(result.statement).toEqual({
      id: STMT,
      statementIdentifier: "IND-2026-ADAM",
      statementType: StatementType.INDIVIDUAL,
      status: StatementStatus.PUBLISHED,
      taxYear: 2026,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-12-31T00:00:00.000Z"),
      deductibleTotal: "90.00",
      generatedAt: new Date("2026-09-10T12:00:00.000Z"),
      recipientLabel: "Ann Adams",
    });
  });

  it("uses a neutral label and summary for unknown actions", () => {
    expect(statementAuditActionLabel("SECRET_VOID_STATEMENT")).toBe(
      UNKNOWN_STATEMENT_ACTIVITY_LABEL,
    );
    expect(
      summarizeStatementAuditChanges("SECRET_VOID_STATEMENT", {
        changes: [
          {
            field: "pdfStorageKey",
            oldValue: null,
            newValue: "private/statements/secret.pdf",
          },
          { field: "status", oldValue: "PUBLISHED", newValue: "VOIDED" },
        ],
      }),
    ).toBe("A statement activity was recorded.");
  });

  it("allow-lists the statement void requested summary without the reason text", () => {
    expect(statementAuditActionLabel(REQUEST_CONTRIBUTION_STATEMENT_VOID)).toBe(
      "Statement void requested",
    );
    const summary = summarizeStatementAuditChanges(
      REQUEST_CONTRIBUTION_STATEMENT_VOID,
      {
        changes: [
          {
            field: "contributionStatementId",
            oldValue: null,
            newValue: STMT,
          },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: "IND-2026-ADAM",
          },
          { field: "status", oldValue: null, newValue: "PUBLISHED" },
          { field: "requestStatus", oldValue: null, newValue: "PENDING" },
          {
            field: "reason",
            oldValue: null,
            newValue: "The published total does not match the locked batch.",
          },
        ],
      },
    );
    expect(summary).toContain("Statement void requested");
    expect(summary).toContain("Identifier set to IND-2026-ADAM.");
    expect(summary).toContain("Status set to Published.");
    expect(summary).toContain("Request status set to Pending.");
    expect(summary).not.toContain("locked batch");
    expect(summary).not.toContain(STMT);
  });

  it("allow-lists approve and reject void-request summaries", () => {
    expect(
      statementAuditActionLabel(APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST),
    ).toBe("Approve statement void request");
    expect(
      statementAuditActionLabel(REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST),
    ).toBe("Reject statement void request");
    expect(
      summarizeStatementAuditChanges(
        APPROVE_CONTRIBUTION_STATEMENT_VOID_REQUEST,
        {
          changes: [
            { field: "requestStatus", oldValue: "PENDING", newValue: "APPROVED" },
            {
              field: "reviewNote",
              oldValue: null,
              newValue: "Totals were checked against the locked batch.",
            },
          ],
        },
      ),
    ).toBe(
      "Statement void request approved. Request status changed from Pending to Approved.",
    );
    expect(
      summarizeStatementAuditChanges(
        REJECT_CONTRIBUTION_STATEMENT_VOID_REQUEST,
        { changes: [] },
      ),
    ).toBe("Statement void request rejected.");
  });

  it("allow-lists void and execute summaries without request notes or identifiers", () => {
    expect(statementAuditActionLabel(VOID_CONTRIBUTION_STATEMENT)).toBe(
      "Void contribution statement",
    );
    expect(
      statementAuditActionLabel(EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST),
    ).toBe("Execute statement void request");
    const voidSummary = summarizeStatementAuditChanges(
      VOID_CONTRIBUTION_STATEMENT,
      {
        changes: [
          { field: "status", oldValue: "PUBLISHED", newValue: "VOIDED" },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: "IND-2026-ADAM",
          },
          {
            field: "statementVoidRequestId",
            oldValue: null,
            newValue: STMT,
          },
          {
            field: "executedByUserAccountId",
            oldValue: null,
            newValue: ACTOR_ID,
          },
          {
            field: "reason",
            oldValue: null,
            newValue: "The published total does not match the locked batch.",
          },
        ],
      },
    );
    expect(voidSummary).toContain("Statement voided.");
    expect(voidSummary).toContain("Status changed from Published to Voided.");
    expect(voidSummary).toContain("Identifier set to IND-2026-ADAM.");
    expect(voidSummary).not.toContain("locked batch");
    expect(voidSummary).not.toContain(STMT);
    expect(voidSummary).not.toContain(ACTOR_ID);
    expect(
      summarizeStatementAuditChanges(
        EXECUTE_CONTRIBUTION_STATEMENT_VOID_REQUEST,
        {
          changes: [
            {
              field: "requestStatus",
              oldValue: null,
              newValue: "APPROVED",
            },
            {
              field: "statementIdentifier",
              oldValue: null,
              newValue: "IND-2026-ADAM",
            },
            { field: "status", oldValue: "PUBLISHED", newValue: "VOIDED" },
          ],
        },
      ),
    ).toBe(
      "Approved void request executed. Request status set to Approved. Identifier set to IND-2026-ADAM. Status changed from Published to Voided.",
    );
  });

  it("allow-lists replacement statement generation without raw IDs or notes", () => {
    expect(statementAuditActionLabel(REISSUE_CONTRIBUTION_STATEMENT)).toBe(
      "Replacement statement generated",
    );
    const summary = summarizeStatementAuditChanges(
      REISSUE_CONTRIBUTION_STATEMENT,
      {
        changes: [
          { field: "priorStatementId", oldValue: null, newValue: STMT },
          {
            field: "priorStatementIdentifier",
            oldValue: null,
            newValue: "IND-2026-VOID",
          },
          {
            field: "replacementStatementId",
            oldValue: null,
            newValue: STMT_HH,
          },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: "IND-2026-NEW1",
          },
          { field: "statementType", oldValue: null, newValue: "INDIVIDUAL" },
          { field: "taxYear", oldValue: null, newValue: "2026" },
          { field: "deductibleTotal", oldValue: null, newValue: "90.00" },
          {
            field: "generatedByUserAccountId",
            oldValue: null,
            newValue: ACTOR_ID,
          },
        ],
      },
    );
    expect(summary).toContain("Replacement statement generated.");
    expect(summary).toContain("Prior identifier set to IND-2026-VOID.");
    expect(summary).toContain("Identifier set to IND-2026-NEW1.");
    expect(summary).toContain("Type set to Individual.");
    expect(summary).toContain("Tax year set to 2026.");
    expect(summary).toContain("Deductible total set to $90.00.");
    expect(summary).not.toContain(STMT);
    expect(summary).not.toContain(STMT_HH);
    expect(summary).not.toContain(ACTOR_ID);
  });

  it("allow-lists household replacement summaries without member names or addresses", () => {
    const summary = summarizeStatementAuditChanges(
      REISSUE_CONTRIBUTION_STATEMENT,
      {
        changes: [
          { field: "priorStatementId", oldValue: null, newValue: STMT_HH },
          {
            field: "priorStatementIdentifier",
            oldValue: null,
            newValue: "HH-2026-VOID",
          },
          {
            field: "statementIdentifier",
            oldValue: null,
            newValue: "HH-2026-NEW1",
          },
          { field: "statementType", oldValue: null, newValue: "HOUSEHOLD" },
          { field: "taxYear", oldValue: null, newValue: "2026" },
          { field: "deductibleTotal", oldValue: null, newValue: "125.00" },
          {
            field: "generatedByUserAccountId",
            oldValue: null,
            newValue: ACTOR_ID,
          },
          {
            field: "householdMembers",
            oldValue: null,
            newValue: "Ann Adams, Ben Adams",
          },
        ],
      },
    );
    expect(summary).toContain("Replacement household statement generated.");
    expect(summary).toContain("Prior identifier set to HH-2026-VOID.");
    expect(summary).toContain("Identifier set to HH-2026-NEW1.");
    expect(summary).toContain("Type set to Household.");
    expect(summary).not.toContain("Ann Adams");
    expect(summary).not.toContain(STMT_HH);
    expect(summary).not.toContain(ACTOR_ID);
  });

  it("returns an empty timeline when no audit rows exist", async () => {
    store.events = [];
    const result = await getStatementAuditTimeline(STMT);
    expect(result.events).toEqual([]);
    expect(result.statement.statementIdentifier).toBe("IND-2026-ADAM");
  });

  it("links a replacement timeline event to the prior VOIDED statement without showing the raw id", async () => {
    const priorId = "00000000-0000-4000-8000-00000000b008";
    store.events = [
      {
        id: "event-reissue",
        organizationId: ORG_ID,
        entityType: "ContributionStatement",
        entityId: STMT,
        action: REISSUE_CONTRIBUTION_STATEMENT,
        occurredAt: new Date("2026-09-16T12:00:00.000Z"),
        actor: {
          displayName: "Terry Treasurer",
          primaryEmail: "terry@church.test",
        },
        changeMetadata: {
          changes: [
            { field: "priorStatementId", oldValue: null, newValue: priorId },
            {
              field: "priorStatementIdentifier",
              oldValue: null,
              newValue: "IND-2026-VOID",
            },
            {
              field: "statementIdentifier",
              oldValue: null,
              newValue: "IND-2026-ADAM",
            },
            {
              field: "generatedByUserAccountId",
              oldValue: null,
              newValue: ACTOR_ID,
            },
          ],
        },
      },
    ];
    const result = await getStatementAuditTimeline(STMT);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.actionLabel).toBe("Replacement statement generated");
    expect(result.events[0]?.summary).toContain("Prior identifier set to IND-2026-VOID.");
    expect(result.events[0]?.summary).not.toContain(priorId);
    expect(result.events[0]?.summary).not.toContain(ACTOR_ID);
    expect(result.events[0]?.relatedStatement).toEqual({
      href: `/statements/registry/${priorId}`,
      label: "IND-2026-VOID",
    });
  });
});
