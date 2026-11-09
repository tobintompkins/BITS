import { describe, expect, it } from "vitest";

import { RoleCode } from "@/app/generated/prisma/client";

import {
  GIVING_AUDIT_PAGE_SIZE,
  GIVING_AUDIT_PAIRS,
  buildGivingAuditSummary,
  canReviewGivingAuditHistory,
  confirmedGivingAuditDonationBatchId,
  encodeGivingAuditCursor,
  givingAuditHistoryNavItems,
  givingAuditListQuery,
  givingAuditRecordHref,
  parseGivingAuditHistoryFilter,
} from "./giving-audit-history";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const DONOR_ID = "00000000-0000-4000-8000-00000000d001";
const BATCH_ID = "00000000-0000-4000-8000-00000000b001";
const GIFT_ID = "00000000-0000-4000-8000-00000000e001";

describe("giving audit history filters", () => {
  it("lists each persisted giving action once", () => {
    const keys = GIVING_AUDIT_PAIRS.map((pair) => `${pair.entityType}:${pair.action}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("Donor:DONOR_CREATED");
    expect(keys).toContain("Donor:DONOR_PROFILE_UPDATED");
    expect(keys).toContain("Household:GIVING_HOUSEHOLD_DEACTIVATED");
    expect(keys).toContain("HouseholdMembership:GIVING_HOUSEHOLD_MEMBER_MOVED");
    expect(keys).toContain("OfferingBatch:LOCK_OFFERING_BATCH");
    expect(keys).toContain("Donation:DELETE_MANUAL_BATCH_DONATION");
    expect(keys).toContain("Organization:UPDATE");
    expect(keys).toContain("ContributionStatement:VOID_CONTRIBUTION_STATEMENT");
    expect(keys).not.toContain("LeadershipDocument:DOWNLOAD_LEADERSHIP_DOCUMENT");
  });

  it("rejects security-catalog and malformed filters", () => {
    expect(parseGivingAuditHistoryFilter({ category: "PRIVACY" }).success).toBe(false);
    expect(parseGivingAuditHistoryFilter({ entity: "LeadershipDocument" }).success).toBe(false);
    expect(parseGivingAuditHistoryFilter({ action: "DOWNLOAD_LEADERSHIP_DOCUMENT" }).success).toBe(false);
    expect(parseGivingAuditHistoryFilter({ entity: "Donor", action: "UPDATE" }).success).toBe(false);
    expect(parseGivingAuditHistoryFilter({ from: "2026-02-31" }).success).toBe(false);
    expect(parseGivingAuditHistoryFilter({ from: "2026-02-02", to: "2026-02-01" }).success).toBe(false);
    expect(parseGivingAuditHistoryFilter({ cursor: "not-a-cursor" }).success).toBe(false);
    expect(parseGivingAuditHistoryFilter({ entity: ["Donor"] }).success).toBe(false);
  });

  it("pages equal timestamps by id after the timestamp", () => {
    const occurredAt = new Date("2026-11-05T15:00:00.000Z");
    const newerId = "00000000-0000-4000-8000-000000000002";
    const olderId = "00000000-0000-4000-8000-000000000001";
    const query = givingAuditListQuery({
      organizationId: ORG_ID,
      pairs: [{ entityType: "Donor", action: "DONOR_CREATED" }],
      from: null,
      to: null,
      cursor: { occurredAt, id: newerId },
    });
    expect(query.orderBy).toEqual([{ occurredAt: "desc" }, { id: "desc" }]);
    expect(query.take).toBe(GIVING_AUDIT_PAGE_SIZE + 1);
    expect(query.where.AND).toEqual(
      expect.arrayContaining([
        { organizationId: ORG_ID },
        {
          OR: [
            { occurredAt: { lt: occurredAt } },
            { AND: [{ occurredAt }, { id: { lt: newerId } }] },
          ],
        },
      ]),
    );
    expect(olderId < newerId).toBe(true);
    expect(encodeGivingAuditCursor(occurredAt, newerId)).not.toContain(ORG_ID);
  });

  it("describes changed fields without private values", () => {
    const secret = "12 Main Street donor@church.test note-body check-1001 logo-private.png sk_test_abc";
    const summary = buildGivingAuditSummary({
      changes: [
        { field: "email", oldValue: null, newValue: "donor@church.test" },
        { field: "mailingAddressLine1", oldValue: secret, newValue: secret },
        { field: "notes", oldValue: "note-body", newValue: "note-body" },
        { field: "checkNumber", oldValue: null, newValue: "1001" },
        { field: "logoStorageKey", oldValue: null, newValue: "/uploads/organizations/logo-private.png" },
        { field: "unexpectedPrivate", oldValue: secret, newValue: secret },
      ],
    });
    expect(summary).toContain("Email");
    expect(summary).toContain("Address");
    expect(summary).toContain("Notes");
    expect(summary).toContain("Check number");
    expect(summary).toContain("Logo");
    expect(summary).toContain("Additional details were recorded.");
    expect(summary).not.toContain("donor@church.test");
    expect(summary).not.toContain("12 Main Street");
    expect(summary).not.toContain("note-body");
    expect(summary).not.toContain("1001");
    expect(summary).not.toContain("logo-private");
    expect(summary).not.toContain("sk_test");
    expect(summary).not.toContain("unexpectedPrivate");
    expect(buildGivingAuditSummary(null)).toBe("No additional details were recorded.");
  });

  it("links only records confirmed in the current church", () => {
    const targets = {
      donors: new Set([DONOR_ID]),
      households: new Set<string>(),
      offeringTypes: new Set<string>(),
      batches: new Set<string>(),
      donations: new Map<string, string | null>([[GIFT_ID, BATCH_ID]]),
      donationBatchesInChurch: new Set([BATCH_ID]),
      statements: new Set<string>(),
      voidRequestStatements: new Map<string, string>(),
    };
    expect(
      givingAuditRecordHref({
        entityType: "Donor",
        entityId: DONOR_ID,
        organizationId: ORG_ID,
        canOpenOrganizationSettings: false,
        targets,
      }),
    ).toBe(`/donors/${DONOR_ID}`);
    expect(
      givingAuditRecordHref({
        entityType: "Donor",
        entityId: "00000000-0000-4000-8000-00000000d099",
        organizationId: ORG_ID,
        canOpenOrganizationSettings: true,
        targets,
      }),
    ).toBeNull();
    expect(
      givingAuditRecordHref({
        entityType: "Donation",
        entityId: GIFT_ID,
        organizationId: ORG_ID,
        canOpenOrganizationSettings: true,
        targets,
      }),
    ).toBe(`/batches/${BATCH_ID}`);
    expect(
      givingAuditRecordHref({
        entityType: "Donation",
        entityId: GIFT_ID,
        organizationId: ORG_ID,
        canOpenOrganizationSettings: true,
        targets: {
          ...targets,
          donations: new Map([[GIFT_ID, null]]),
        },
      }),
    ).toBeNull();
    expect(
      givingAuditRecordHref({
        entityType: "Donation",
        entityId: "00000000-0000-4000-8000-00000000e099",
        organizationId: ORG_ID,
        canOpenOrganizationSettings: true,
        targets,
      }),
    ).toBeNull();
    const foreignBatch = "00000000-0000-4000-8000-00000000b099";
    expect(
      confirmedGivingAuditDonationBatchId(foreignBatch, new Set([BATCH_ID])),
    ).toBeNull();
    expect(
      confirmedGivingAuditDonationBatchId(BATCH_ID, new Set([BATCH_ID])),
    ).toBe(BATCH_ID);
    expect(confirmedGivingAuditDonationBatchId(null, new Set([BATCH_ID]))).toBeNull();
    expect(
      givingAuditRecordHref({
        entityType: "Organization",
        entityId: ORG_ID,
        organizationId: ORG_ID,
        canOpenOrganizationSettings: false,
        targets,
      }),
    ).toBeNull();
  });

  it("shows the nav item only to organization administrators and treasurers", () => {
    expect(
      givingAuditHistoryNavItems(
        canReviewGivingAuditHistory({ roleCode: RoleCode.ORG_ADMIN, isSuperAdmin: false }),
      ),
    ).toEqual([{ href: "/reports/giving-audit", label: "Giving Audit" }]);
    expect(
      canReviewGivingAuditHistory({ roleCode: RoleCode.TREASURER, isSuperAdmin: false }),
    ).toBe(true);
    for (const roleCode of [RoleCode.DATA_ENTRY, RoleCode.REPORT_VIEWER, RoleCode.DONOR, null]) {
      expect(canReviewGivingAuditHistory({ roleCode, isSuperAdmin: false })).toBe(false);
      expect(givingAuditHistoryNavItems(false)).toEqual([]);
    }
  });
});
