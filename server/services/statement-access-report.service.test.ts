import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  actor: vi.fn(),
  memberships: vi.fn(),
  count: vi.fn(),
  list: vi.fn(),
  targets: vi.fn(),
  pickers: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  accessCreate: vi.fn(),
  statementUpdate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAccount: { findUnique: m.actor },
    organizationMembership: { findMany: m.memberships },
    statementAccessEvent: { create: m.accessCreate },
    contributionStatement: { update: m.statementUpdate },
    $transaction: m.transaction,
  },
}));
vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: m.audit,
}));
vi.mock("@/server/repositories/statement-access-report.repository", () => ({
  countStatementAccessEvents: m.count,
  listStatementAccessEvents: m.list,
  findStatementAccessFilterTargets: m.targets,
  listStatementAccessPickers: m.pickers,
}));

import {
  exportStatementAccessReportCsv,
  getStatementAccessReport,
} from "./statement-access-report.service";

const org = {
  id: "org-a",
  active: true,
  name: "Church A",
  displayName: "Church A",
  timeZone: "America/New_York",
};
const STATEMENT = "00000000-0000-4000-8000-0000000000s1";
const DONOR = "00000000-0000-4000-8000-0000000000d1";
const HOUSEHOLD = "00000000-0000-4000-8000-0000000000h1";

function role(code: string) {
  m.memberships.mockResolvedValue([
    { organizationId: org.id, organization: org, roleType: { code } },
  ]);
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    occurredAt: new Date("2026-03-08T06:00:00.000Z"),
    action: "DOWNLOADED",
    statementId: STATEMENT,
    userAccount: { id: "actor-1", displayName: "Pat Lee", active: true },
    statement: {
      id: STATEMENT,
      statementIdentifier: "STMT-100",
      statementType: "INDIVIDUAL",
      status: "PUBLISHED",
      donorId: DONOR,
      householdId: null,
      donor: {
        id: DONOR,
        firstName: "Ada",
        lastName: "Young",
        active: false,
        organizationId: org.id,
      },
      household: null,
    },
    ...overrides,
  };
}

const filters = {
  startDate: "2026-03-08",
  endDate: "2026-03-08",
};

describe("statement access report", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    m.actor.mockResolvedValue({ id: "staff-a", active: true });
    role("TREASURER");
    m.targets.mockResolvedValue({
      statement: true,
      donor: true,
      household: true,
      actor: true,
    });
    m.count.mockResolvedValue(1);
    m.list.mockResolvedValue([eventRow()]);
    m.pickers.mockResolvedValue({
      statements: [],
      donors: [],
      households: [],
      actors: [],
    });
    m.audit.mockResolvedValue({ id: "audit-1" });
    m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
  });

  it("rejects signed-out, report-viewer, data-entry, donor and inactive accounts", async () => {
    m.auth.mockResolvedValue({ userId: null });
    await expect(getStatementAccessReport(filters)).rejects.toThrow("Sign in");
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    m.actor.mockResolvedValue({ id: "staff-a", active: false });
    await expect(getStatementAccessReport(filters)).rejects.toThrow("active staff");
    m.actor.mockResolvedValue({ id: "staff-a", active: true });
    role("REPORT_VIEWER");
    await expect(getStatementAccessReport(filters)).rejects.toThrow("permission");
    role("DATA_ENTRY");
    await expect(getStatementAccessReport(filters)).rejects.toThrow("permission");
    role("DONOR");
    await expect(getStatementAccessReport(filters)).rejects.toThrow("permission");
  });

  it("lets an administrator export stored events including inactive recipients", async () => {
    role("ORG_ADMIN");
    const report = await getStatementAccessReport(filters);
    expect(report.rows[0]?.recipientLabel).toBe("Ada Young");
    expect(report.rows[0]?.actorLabel).toBe("Pat Lee");
    const exported = await exportStatementAccessReportCsv(filters);
    expect(exported.csv).toContain("STMT-100");
    expect(exported.csv).toContain("America/New_York");
    expect(exported.csv).not.toContain("pdfStorageKey");
    expect(exported.csv).not.toContain("pdfChecksum");
  });

  it("keeps voided statements and repeated downloads as separate rows", async () => {
    m.count.mockResolvedValue(2);
    m.list.mockResolvedValue([
      eventRow({ id: "evt-1", action: "VIEWED" }),
      eventRow({
        id: "evt-2",
        action: "DOWNLOADED",
        statement: {
          id: STATEMENT,
          statementIdentifier: "STMT-100",
          statementType: "HOUSEHOLD",
          status: "VOIDED",
          donorId: null,
          householdId: HOUSEHOLD,
          donor: null,
          household: {
            id: HOUSEHOLD,
            displayName: "Young household",
            active: false,
            organizationId: org.id,
          },
        },
      }),
    ]);
    const report = await getStatementAccessReport(filters);
    expect(report.allRows).toHaveLength(2);
    expect(report.allRows[1]?.statementStatusLabel).toBe("VOIDED");
    expect(report.allRows[1]?.recipientLabel).toBe("Young household");
  });

  it("rejects a foreign filter id instead of broadening the report", async () => {
    m.targets.mockResolvedValue({
      statement: false,
      donor: true,
      household: true,
      actor: true,
    });
    await expect(
      getStatementAccessReport({
        ...filters,
        statementId: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("not part of this church");
  });

  it("rejects a stale church", async () => {
    await expect(
      getStatementAccessReport({
        ...filters,
        organizationId: "00000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toThrow("church selection changed");
  });

  it("uses a church-timezone range so a DST morning event is included", async () => {
    await getStatementAccessReport(filters);
    expect(m.list).toHaveBeenCalledWith(
      expect.objectContaining({
        startUtc: new Date("2026-03-08T05:00:00.000Z"),
        endExclusiveUtc: new Date("2026-03-09T04:00:00.000Z"),
      }),
      5000,
      expect.anything(),
    );
  });

  it("omits private storage and audit fields from the CSV", async () => {
    const exported = await exportStatementAccessReportCsv(filters);
    expect(exported.csv).not.toContain("pdfStorageKey");
    expect(exported.csv).not.toContain("pdfChecksum");
    expect(exported.csv).not.toContain("reviewNote");
    expect(exported.filename).toBe("statement-access-2026-03-08-to-2026-03-08.csv");
  });

  it("rejects an oversized export instead of truncating and does not audit", async () => {
    m.count.mockResolvedValue(5001);
    await expect(exportStatementAccessReportCsv(filters)).rejects.toThrow(
      "was not truncated",
    );
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("does not release a CSV when audit fails and does not write access events", async () => {
    m.audit.mockRejectedValue(new Error("audit down"));
    await expect(exportStatementAccessReportCsv(filters)).rejects.toThrow(
      "could not be audited",
    );
    expect(m.accessCreate).not.toHaveBeenCalled();
    expect(m.statementUpdate).not.toHaveBeenCalled();
  });

  it("uses a display-name actor label without email", async () => {
    m.list.mockResolvedValue([
      eventRow({
        userAccount: { id: "actor-2", displayName: null, active: true },
      }),
    ]);
    const report = await getStatementAccessReport(filters);
    expect(report.rows[0]?.actorLabel).toBe("Staff member");
  });
});
