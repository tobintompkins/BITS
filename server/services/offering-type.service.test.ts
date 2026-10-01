import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyOfferingType } from "@/lib/validation/offering-type";
import { normalizeNewOfferingTypeCode } from "@/lib/validation/offering-type";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  actor: vi.fn(),
  memberships: vi.fn(),
  find: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  allocationCount: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    userAccount: { findUnique: m.actor },
    organizationMembership: { findMany: m.memberships },
    offeringType: {
      findFirst: m.find,
      findMany: m.list,
      count: m.count,
      create: m.create,
      updateMany: m.updateMany,
    },
    donationAllocation: { count: m.allocationCount },
    $transaction: m.transaction,
  },
}));
vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: m.audit,
}));

import {
  getOfferingType,
  listOfferingTypeDirectory,
  requireOfferingTypeAccess,
  saveOfferingType,
  setOfferingTypeActive,
} from "./offering-type.service";

const org = { id: "org-a", active: true, name: "Church A" };
const updatedAt = new Date("2026-09-30T12:00:00.000Z");

function role(code: string) {
  m.memberships.mockResolvedValue([
    { organizationId: org.id, organization: org, roleType: { code } },
  ]);
}

const input = {
  ...emptyOfferingType,
  name: "General Fund",
  displayOrder: "10",
};

describe("normalizeNewOfferingTypeCode", () => {
  it("normalizes new codes without treating blank as a unique empty string", () => {
    expect(normalizeNewOfferingTypeCode("")).toBeNull();
    expect(normalizeNewOfferingTypeCode("  general fund  ")).toBe("GENERAL_FUND");
  });
});

describe("offering type administration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({ userId: "clerk-user", orgId: "clerk-org-a" });
    m.actor.mockResolvedValue({ id: "staff-a", active: true });
    role("TREASURER");
    m.list.mockResolvedValue([]);
    m.count.mockResolvedValue(0);
    m.allocationCount.mockResolvedValue(0);
    m.create.mockResolvedValue({ id: "fund-a", organizationId: org.id });
    m.updateMany.mockResolvedValue({ count: 1 });
    m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        offeringType: {
          findFirst: m.find,
          create: m.create,
          updateMany: m.updateMany,
        },
        donationAllocation: { count: m.allocationCount },
      }),
    );
  });

  it("rejects signed-out access before querying records", async () => {
    m.auth.mockResolvedValue({ userId: null });
    await expect(listOfferingTypeDirectory("", "all", 1)).rejects.toThrow();
    expect(m.list).not.toHaveBeenCalled();
  });

  it("rejects inactive accounts", async () => {
    m.actor.mockResolvedValue({ id: "staff", active: false });
    await expect(requireOfferingTypeAccess()).rejects.toThrow();
  });

  it("requires membership in the selected Clerk organization", async () => {
    await requireOfferingTypeAccess();
    expect(m.memberships.mock.calls[0][0].where.organization).toEqual({
      active: true,
      clerkOrganizationId: "clerk-org-a",
    });
  });

  it("rejects ambiguous organization fallback", async () => {
    m.auth.mockResolvedValue({ userId: "u", orgId: null });
    m.memberships.mockResolvedValue([{}, {}]);
    await expect(requireOfferingTypeAccess()).rejects.toThrow("Select a church");
  });

  it.each(["DONOR", "VOLUNTEER"])("blocks %s from offering types", async (code) => {
    role(code);
    await expect(listOfferingTypeDirectory("", "all", 1)).rejects.toThrow();
    expect(m.list).not.toHaveBeenCalled();
  });

  it("allows report viewers and data entry to read but not mutate", async () => {
    role("REPORT_VIEWER");
    expect((await listOfferingTypeDirectory("", "all", 1)).canEdit).toBe(false);
    await expect(saveOfferingType(org.id, null, input)).rejects.toThrow();
    expect(m.transaction).not.toHaveBeenCalled();
    role("DATA_ENTRY");
    expect((await listOfferingTypeDirectory("", "all", 1)).canEdit).toBe(false);
    await expect(saveOfferingType(org.id, null, input)).rejects.toThrow();
  });

  it("lets administrators and treasurers mutate", async () => {
    role("ORG_ADMIN");
    await saveOfferingType(org.id, null, input);
    expect(m.create).toHaveBeenCalled();
    role("TREASURER");
    await saveOfferingType(org.id, null, { ...input, name: "Missions" });
    expect(m.create).toHaveBeenCalledTimes(2);
  });

  it("scopes list queries and bounds pagination", async () => {
    await listOfferingTypeDirectory("General", "inactive", 2);
    const query = m.list.mock.calls[0][0];
    expect(query.where.organizationId).toBe(org.id);
    expect(query.where.active).toBe(false);
    expect(query.orderBy).toEqual([
      { displayOrder: "asc" },
      { name: "asc" },
      { id: "asc" },
    ]);
    expect(query.skip).toBe(25);
    expect(query.take).toBe(25);
  });

  it("does not fetch another church's offering type", async () => {
    m.find.mockResolvedValue(null);
    await expect(getOfferingType("foreign-id")).rejects.toThrow("not found");
    expect(m.find).toHaveBeenCalledWith({
      where: { id: "foreign-id", organizationId: org.id },
    });
  });

  it("rejects stale forms after a church switch", async () => {
    await expect(saveOfferingType("org-b", null, input)).rejects.toThrow(
      "selection changed",
    );
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("creates a fund, stores blank codes as null, and audits in the same transaction", async () => {
    await saveOfferingType(org.id, null, { ...input, code: "  " });
    expect(m.create.mock.calls[0][0].data).toMatchObject({
      organizationId: org.id,
      name: "General Fund",
      code: null,
      displayOrder: 10,
    });
    expect(m.audit.mock.calls[0][1]).toHaveProperty("offeringType");
    expect(m.audit.mock.calls[0][0].action).toBe("OFFERING_TYPE_CREATED");
  });

  it("normalizes a new code and returns a friendly duplicate-code error", async () => {
    await saveOfferingType(org.id, null, { ...input, code: "building fund" });
    expect(m.create.mock.calls[0][0].data.code).toBe("BUILDING_FUND");
    m.create.mockRejectedValueOnce({ code: "P2002" });
    await expect(
      saveOfferingType(org.id, null, { ...input, code: "BUILDING_FUND" }),
    ).rejects.toThrow("already used in this church");
  });

  it("does not change an existing nonempty integration code", async () => {
    m.find.mockResolvedValue({
      id: "fund-a",
      organizationId: org.id,
      name: "Tithes",
      description: null,
      code: "STRIPE_TITHES",
      defaultTaxDeductible: true,
      onlineGivingEnabled: true,
      displayOrder: 1,
      active: true,
      updatedAt,
    });
    await saveOfferingType(
      org.id,
      "fund-a",
      { ...input, name: "Tithes (updated)", code: "CHANGED" },
      updatedAt.toISOString(),
    );
    expect(m.updateMany.mock.calls[0][0].where).toEqual({
      id: "fund-a",
      organizationId: org.id,
    });
    expect(m.updateMany.mock.calls[0][0].data.code).toBe("STRIPE_TITHES");
    expect(m.updateMany.mock.calls[0][0].data.name).toBe("Tithes (updated)");
  });

  it("rejects concurrent edits that do not match the loaded updatedAt", async () => {
    m.find.mockResolvedValue({
      id: "fund-a",
      organizationId: org.id,
      name: "Tithes",
      code: "STRIPE_TITHES",
      description: null,
      defaultTaxDeductible: true,
      onlineGivingEnabled: true,
      displayOrder: 1,
      active: true,
      updatedAt,
    });
    await expect(
      saveOfferingType(
        org.id,
        "fund-a",
        input,
        "2026-01-01T00:00:00.000Z",
      ),
    ).rejects.toThrow("updated by someone else");
    expect(m.updateMany).not.toHaveBeenCalled();
    await expect(saveOfferingType(org.id, "fund-a", input)).rejects.toThrow(
      "updated by someone else",
    );
  });

  it("deactivates without deleting allocations", async () => {
    m.find.mockResolvedValue({
      id: "fund-a",
      organizationId: org.id,
      name: "General Fund",
      description: null,
      code: null,
      defaultTaxDeductible: true,
      onlineGivingEnabled: false,
      displayOrder: 10,
      active: true,
      updatedAt,
    });
    await saveOfferingType(
      org.id,
      "fund-a",
      { ...input, active: false },
      updatedAt.toISOString(),
    );
    expect(m.updateMany.mock.calls[0][0].data.active).toBe(false);
    expect(m.updateMany.mock.calls[0][0].data).not.toHaveProperty("allocations");
    expect(m.audit.mock.calls[0][0].action).toBe("OFFERING_TYPE_DEACTIVATED");
  });

  it("does not rewrite donation amounts when tax defaults change", async () => {
    m.find.mockResolvedValue({
      id: "fund-a",
      organizationId: org.id,
      name: "General Fund",
      description: null,
      code: null,
      defaultTaxDeductible: true,
      onlineGivingEnabled: false,
      displayOrder: 10,
      active: true,
      updatedAt,
    });
    await saveOfferingType(
      org.id,
      "fund-a",
      { ...input, defaultTaxDeductible: false },
      updatedAt.toISOString(),
    );
    const data = m.updateMany.mock.calls[0][0].data;
    expect(data.defaultTaxDeductible).toBe(false);
    expect(data).not.toHaveProperty("deductibleAmount");
    expect(data).not.toHaveProperty("donations");
  });

  it("rolls back the write when audit fails", async () => {
    m.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(saveOfferingType(org.id, null, input)).rejects.toThrow(
      "audit unavailable",
    );
  });

  it("rejects invalid details before writing", async () => {
    await expect(
      saveOfferingType(org.id, null, { ...input, name: "", displayOrder: "-1" }),
    ).rejects.toThrow();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("reactivates using the intended active state", async () => {
    m.find.mockResolvedValue({
      id: "fund-a",
      organizationId: org.id,
      name: "General Fund",
      description: null,
      code: null,
      defaultTaxDeductible: true,
      onlineGivingEnabled: false,
      displayOrder: 10,
      active: false,
      updatedAt,
    });
    await setOfferingTypeActive(org.id, "fund-a", true, updatedAt.toISOString());
    expect(m.updateMany.mock.calls[0][0].data.active).toBe(true);
    expect(m.audit.mock.calls[0][0].action).toBe("OFFERING_TYPE_REACTIVATED");
  });
});
