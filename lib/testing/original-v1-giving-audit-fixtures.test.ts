import { describe, expect, it } from "vitest";

import { GIVING_AUDIT_PAGE_SIZE } from "@/lib/validation/giving-audit-history";

import {
  ORIGINAL_V1_CHURCH_B_AUDIT_ID,
  ORIGINAL_V1_GIVING_AUDIT_PAGE_SIZE,
  ORIGINAL_V1_GIVING_AUDIT_ROW_COUNT,
  ORIGINAL_V1_MISSING_DONATION_ID,
  originalV1AuditIdMayBeRecorded,
  originalV1GivingAuditEventId,
  originalV1GivingAuditEventIds,
} from "./original-v1-giving-audit-fixtures";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const DONATION = "44444444-4444-4444-8444-444444444444";

describe("original v1 giving audit fixture ids", () => {
  it("covers one full page plus one older row, with stable id order", () => {
    const ids = originalV1GivingAuditEventIds();
    expect(ORIGINAL_V1_GIVING_AUDIT_PAGE_SIZE).toBe(GIVING_AUDIT_PAGE_SIZE);
    expect(ORIGINAL_V1_GIVING_AUDIT_ROW_COUNT).toBe(GIVING_AUDIT_PAGE_SIZE + 1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(GIVING_AUDIT_PAGE_SIZE + 2);
    expect(originalV1GivingAuditEventId(GIVING_AUDIT_PAGE_SIZE + 1) > originalV1GivingAuditEventId(GIVING_AUDIT_PAGE_SIZE)).toBe(true);
    expect(ids.at(-1)).toBe(ORIGINAL_V1_CHURCH_B_AUDIT_ID);
    expect(ids).not.toContain(ORIGINAL_V1_MISSING_DONATION_ID);
  });

  it("records only this run's organization settings audit or owned giving rows", () => {
    const settingsId = "55555555-5555-4555-8555-555555555555";
    expect(
      originalV1AuditIdMayBeRecorded({
        auditId: settingsId,
        organizationId: ORG_A,
        entityType: "Organization",
        entityId: ORG_A,
        orgIds: [ORG_A, ORG_B],
        donationIds: [DONATION],
      }),
    ).toBe(true);
    expect(
      originalV1AuditIdMayBeRecorded({
        auditId: settingsId,
        organizationId: OTHER,
        entityType: "Organization",
        entityId: OTHER,
        orgIds: [ORG_A, ORG_B],
        donationIds: [DONATION],
      }),
    ).toBe(false);
    expect(
      originalV1AuditIdMayBeRecorded({
        auditId: originalV1GivingAuditEventId(1),
        organizationId: ORG_A,
        entityType: "Donation",
        entityId: DONATION,
        orgIds: [ORG_A, ORG_B],
        donationIds: [DONATION],
      }),
    ).toBe(true);
    expect(
      originalV1AuditIdMayBeRecorded({
        auditId: settingsId,
        organizationId: ORG_A,
        entityType: "Donation",
        entityId: DONATION,
        orgIds: [ORG_A, ORG_B],
        donationIds: [DONATION],
      }),
    ).toBe(false);
  });
});
