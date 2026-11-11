export const ORIGINAL_V1_GIVING_AUDIT_DAY = "2099-01-15";
export const ORIGINAL_V1_GIVING_AUDIT_AT = "2099-01-15T12:00:00.000Z";
export const ORIGINAL_V1_GIVING_AUDIT_PAGE_SIZE = 25;
export const ORIGINAL_V1_GIVING_AUDIT_ROW_COUNT = ORIGINAL_V1_GIVING_AUDIT_PAGE_SIZE + 1;
export const ORIGINAL_V1_PRIVATE_NOTE_A = "e2e28a-private-note-a";
export const ORIGINAL_V1_PRIVATE_CHECK_A = "e2e28a-private-check-a";
export const ORIGINAL_V1_PRIVATE_DEPOSIT_A = "e2e28a-private-deposit-a";
export const ORIGINAL_V1_PRIVATE_GOODS_B = "e2e28a-private-goods-b";
export const ORIGINAL_V1_SETTINGS_FOOTER = "e2e28a fictional statement footer";
export const ORIGINAL_V1_MISSING_DONATION_ID =
  "28a00000-0000-4000-8000-0000000000ff";
export const ORIGINAL_V1_CHURCH_B_AUDIT_ID =
  "28a00000-0000-4000-8000-0000000000b1";

const AUDIT_ID =
  /^28a00000-0000-4000-8000-[0-9a-f]{12}$/i;

export function originalV1GivingAuditEventId(index: number) {
  if (
    !Number.isInteger(index) ||
    index < 1 ||
    index > ORIGINAL_V1_GIVING_AUDIT_ROW_COUNT
  ) {
    throw new Error("Giving audit fixture index is outside the owned page.");
  }
  return `28a00000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

export function originalV1GivingAuditEventIds() {
  return [
    ...Array.from({ length: ORIGINAL_V1_GIVING_AUDIT_ROW_COUNT }, (_, index) =>
      originalV1GivingAuditEventId(index + 1),
    ),
    ORIGINAL_V1_CHURCH_B_AUDIT_ID,
  ];
}

export function originalV1AuditIdMayBeRecorded(input: {
  auditId: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  orgIds: string[];
  donationIds: string[];
}) {
  if (!AUDIT_ID.test(input.auditId) && !/^[0-9a-f-]{36}$/i.test(input.auditId)) {
    return false;
  }
  if (!input.orgIds.includes(input.organizationId)) return false;
  if (
    input.entityType === "Organization" &&
    input.entityId === input.organizationId
  ) {
    return true;
  }
  if (
    input.entityType === "Donation" &&
    (input.donationIds.includes(input.entityId) ||
      input.entityId === ORIGINAL_V1_MISSING_DONATION_ID)
  ) {
    return originalV1GivingAuditEventIds().includes(input.auditId);
  }
  return false;
}
