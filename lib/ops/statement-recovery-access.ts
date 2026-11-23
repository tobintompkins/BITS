import { STATEMENT_PDF_PROBE_ORGANIZATION_ID } from "../storage/statement-pdf-config";
import { statementRehearsalRestoreKey } from "./independent-statement-copy";
import {
  preparedStatementRecoveryRunId,
  preparedStatementRecoverySha256,
} from "./independent-statement-recovery";

const runSuffix = preparedStatementRecoveryRunId.slice(0, -1);

export const statementRecoveryProbeOrganizationId = STATEMENT_PDF_PROBE_ORGANIZATION_ID;
export const statementRecoveryStatementId = preparedStatementRecoveryRunId;

export const statementRecoveryIdentities = {
  organization: {
    id: statementRecoveryProbeOrganizationId,
    name: "Statement recovery probe",
    slug: "statement-recovery-probe",
  },
  statement: {
    id: statementRecoveryStatementId,
    organizationId: statementRecoveryProbeOrganizationId,
    statementIdentifier: "RECOVERY-175b63ed",
    statementType: "INDIVIDUAL" as const,
    donorId: `${runSuffix}2`,
    householdId: null,
    pdfStorageKey: `s3v1:${statementRehearsalRestoreKey(preparedStatementRecoveryRunId)}`,
    pdfChecksum: preparedStatementRecoverySha256,
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
    deductibleTotal: "0.00",
  },
  donor: {
    id: `${runSuffix}2`,
    organizationId: statementRecoveryProbeOrganizationId,
    userAccountId: `${runSuffix}1`,
    clerkUserId: "recovery_donor_175b63ed",
    active: true,
  },
  otherDonor: {
    id: `${runSuffix}4`,
    organizationId: statementRecoveryProbeOrganizationId,
    userAccountId: `${runSuffix}3`,
    clerkUserId: "recovery_other_175b63ed",
    active: true,
  },
  staff: {
    id: `${runSuffix}5`,
    organizationId: statementRecoveryProbeOrganizationId,
    clerkUserId: "recovery_staff_175b63ed",
    roleCode: "ORG_ADMIN" as const,
  },
  reportViewer: {
    id: `${runSuffix}6`,
    organizationId: statementRecoveryProbeOrganizationId,
    clerkUserId: "recovery_viewer_175b63ed",
    roleCode: "REPORT_VIEWER" as const,
  },
};

export const statementRecoveryCleanup = [
  "Delete statement access events for statement 175b63ed-d44d-432e-867f-504064727ce8 only.",
  "Delete audit events whose entity is statement 175b63ed-d44d-432e-867f-504064727ce8 in organization 00000000-0000-4000-8000-00000000f00d only.",
  "Delete contribution statement 175b63ed-d44d-432e-867f-504064727ce8 only.",
  "Delete donors 175b63ed-d44d-432e-867f-504064727ce2 and 175b63ed-d44d-432e-867f-504064727ce4 only.",
  "Delete memberships for user accounts 175b63ed-d44d-432e-867f-504064727ce1, 175b63ed-d44d-432e-867f-504064727ce3, 175b63ed-d44d-432e-867f-504064727ce5, and 175b63ed-d44d-432e-867f-504064727ce6 in organization 00000000-0000-4000-8000-00000000f00d only.",
  "Delete those four user accounts only.",
  "Delete organization 00000000-0000-4000-8000-00000000f00d only when its name is Statement recovery probe and no other rows remain.",
] as const;
