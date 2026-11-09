import { createHash } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import Decimal from "decimal.js";

import { originalV1PdfBytes } from "../../e2e/acceptance/fixtures/pdf";
import { isRecoveryLoopbackAddress, recoveryFixtureAmounts } from "@/lib/ops/local-database-recovery";
import {
  classifyIsolatedDatabasePreflight,
  describeIsolatedRunnerFailure,
} from "@/lib/testing/isolated-database";
import { parsePostgresTargetIdentity } from "@/lib/testing/original-v1-database-url";

/**
 * Opt-in fictional fixtures for original specification section 17.
 * `npm run db:seed` does not call this module. Apply writes only when the
 * command includes `--apply`, and only to loopback database `bits_e2e`.
 * The local account identifiers do not create Clerk logins.
 * Statement files are synthetic placeholders, not tax statements or restore proof.
 */

export const ORIGINAL_V1_FIXTURE_DATABASE = "bits_e2e";
export const ORIGINAL_V1_FIXTURE_DRY_RUN_MESSAGE =
  "Dry run only. No fixture rows or files were written. Apply was not performed.";
export const ORIGINAL_V1_FIXTURE_LOCAL_ID_LIMIT =
  "These local identifiers do not create a Clerk login, send an invitation, or grant access to an actual Clerk user.";
export const ORIGINAL_V1_FIXTURE_STATEMENT_WARNING =
  "SYNTHETIC FIXTURE PLACEHOLDER. NOT A TAX STATEMENT.";
export const ORIGINAL_V1_FIXTURE_TARGET_REASON =
  "Original v1 fixtures apply only to the loopback database bits_e2e. Other names, remote hosts, and the working database are refused.";
export const ORIGINAL_V1_FIXTURE_APPLY_COMMAND =
  "npx tsx prisma/seed.ts --original-v1-fixtures --apply";
export const ORIGINAL_V1_FIXTURE_DRY_RUN_COMMAND =
  "npx tsx prisma/seed.ts --original-v1-fixtures";

const FIXTURE_AT = "2026-11-05T18:00:00.000Z";
const IDEMPOTENCY_ACTION = recoveryFixtureAmounts().idempotencyAction;
const ROLE_NAMES = [
  ["ORG_ADMIN", "Organization Admin"],
  ["TREASURER", "Treasurer"],
  ["DATA_ENTRY", "Data Entry"],
  ["REPORT_VIEWER", "Report Viewer"],
  ["DONOR", "Donor"],
] as const;

export const ORIGINAL_V1_FIXTURE_TABLES = [
  "organizations",
  "user_accounts",
  "role_types",
  "organization_memberships",
  "donors",
  "households",
  "household_memberships",
  "offering_types",
  "offering_batches",
  "donations",
  "donation_allocations",
  "ledger_create_idempotency",
  "contribution_statements",
] as const;

export type OriginalV1FixtureScope = "development" | "integration";
export type OriginalV1FixtureQuery = (
  sql: string,
  params?: readonly unknown[],
) => Promise<{ rows: ReadonlyArray<Record<string, unknown>> }>;

export type OriginalV1FixtureConnection = {
  query: OriginalV1FixtureQuery;
  end: () => Promise<void>;
};

export type OriginalV1FixtureFileState = "missing" | "matching" | "different";

export type OriginalV1FixtureFilePort = {
  inspect(absolutePath: string, expectedChecksum: string): Promise<OriginalV1FixtureFileState>;
  createExclusive(absolutePath: string, bytes: Buffer): Promise<void>;
  remove(absolutePath: string): Promise<void>;
};

type RoleCode = (typeof ROLE_NAMES)[number][0];

export type OriginalV1FixturePlan = {
  scope: OriginalV1FixtureScope;
  placeholderPdf: Buffer;
  placeholderChecksum: string;
  organization: {
    id: string;
    name: string;
    displayName: string;
    slug: string;
    ein: string;
    mailingAddressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    contactEmail: string;
    statementFooterText: string;
    timeZone: string;
    locale: string;
  };
  users: Array<{
    id: string;
    membershipId: string;
    clerkUserId: string;
    primaryEmail: string;
    displayName: string;
    roleCode: RoleCode;
  }>;
  donors: Array<{
    id: string;
    userAccountId: string | null;
    firstName: string;
    lastName: string;
    email: string;
    mailingAddressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    active: boolean;
  }>;
  household: {
    id: string;
    displayName: string;
    mailingAddressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    primaryDonorId: string;
    preferredStatementRecipientId: string;
  };
  householdMemberships: Array<{
    id: string;
    donorId: string;
    startDate: string;
    endDate: null;
  }>;
  offeringTypes: Array<{
    id: string;
    name: string;
    code: string;
    displayOrder: number;
  }>;
  batches: Array<{
    id: string;
    name: string;
    offeringDate: string;
    status: "DRAFT" | "LOCKED";
    expectedTotal: string | null;
    recordedTotal: string;
    createdByUserAccountId: string;
    reviewVersion: number;
  }>;
  donations: Array<{
    id: string;
    donorId: string | null;
    batchId: string;
    offeringDate: string;
    paymentMethod: "CHECK" | "CASH";
    totalAmount: string;
    deductibleAmount: string;
    checkNumber: string | null;
    note: string | null;
    anonymous: boolean;
  }>;
  allocations: Array<{
    id: string;
    donationId: string;
    offeringTypeId: string;
    amount: string;
  }>;
  idempotency: Array<{
    id: string;
    operationToken: string;
    actorUserAccountId: string;
    batchId: string;
    payloadFingerprint: string;
    donationId: string;
  }>;
  statements: Array<{
    id: string;
    statementType: "INDIVIDUAL" | "HOUSEHOLD";
    donorId: string | null;
    householdId: string | null;
    periodStart: string;
    periodEnd: string;
    taxYear: number;
    deductibleTotal: string;
    statementIdentifier: string;
    storageKey: string;
    checksum: string;
  }>;
};

type SnapshotRow = { id: string; snapshot: string };

export type OriginalV1FixtureObservation = {
  organizations: SnapshotRow[];
  users: SnapshotRow[];
  memberships: SnapshotRow[];
  donors: SnapshotRow[];
  households: SnapshotRow[];
  householdMemberships: SnapshotRow[];
  offerings: SnapshotRow[];
  batches: SnapshotRow[];
  donations: SnapshotRow[];
  allocations: SnapshotRow[];
  idempotency: SnapshotRow[];
  statements: SnapshotRow[];
};

export type OriginalV1FixtureDecision =
  | { status: "absent" }
  | { status: "applied" }
  | { status: "conflict"; reason: string };

type OrgRead = OriginalV1FixturePlan["organization"];
type UserRead = {
  id: string;
  clerkUserId: string;
  primaryEmail: string;
  displayName: string;
};
type MembershipRead = {
  id: string;
  organizationId: string;
  userAccountId: string;
  roleCode: string;
};
type DonorRead = OriginalV1FixturePlan["donors"][number] & { organizationId: string };
type HouseholdRead = OriginalV1FixturePlan["household"] & { organizationId: string };
type HouseholdMembershipRead = {
  id: string;
  householdId: string;
  donorId: string;
  startDate: string;
  endDate: string | null;
};
type OfferingRead = OriginalV1FixturePlan["offeringTypes"][number] & {
  organizationId: string;
};
type BatchRead = OriginalV1FixturePlan["batches"][number] & { organizationId: string };
type DonationRead = OriginalV1FixturePlan["donations"][number] & { organizationId: string };
type AllocationRead = OriginalV1FixturePlan["allocations"][number];
type IdempotencyRead = {
  id: string;
  action: string;
  operationToken: string;
  donationId: string;
  batchId: string;
};
type StatementRead = {
  id: string;
  statementType: string;
  status: string;
  statementIdentifier: string;
  donorId: string | null;
  householdId: string | null;
  deductibleTotal: string;
  pdfStorageKey: string;
  pdfChecksum: string;
};

export type OriginalV1FixtureReadModel = {
  organizations: OrgRead[];
  users: UserRead[];
  memberships: MembershipRead[];
  donors: DonorRead[];
  households: HouseholdRead[];
  householdMemberships: HouseholdMembershipRead[];
  offerings: OfferingRead[];
  batches: BatchRead[];
  donations: DonationRead[];
  allocations: AllocationRead[];
  idempotency: IdempotencyRead[];
  statements: StatementRead[];
};

function fixtureId(scope: OriginalV1FixtureScope, slot: number) {
  const prefix =
    scope === "development" ? "11111111-1111-4111-8111-" : "22222222-2222-4222-8222-";
  return `${prefix}${slot.toString(16).padStart(12, "0")}`;
}

function money(value: string) {
  const amount = new Decimal(value);
  if (!amount.isFinite() || amount.decimalPlaces() > 2) {
    throw new Error("Fixture amount is not a two-decimal currency value.");
  }
  return amount.toFixed(2);
}

function sumMoney(values: readonly string[]) {
  return values
    .reduce((total, value) => total.plus(value), new Decimal(0))
    .toFixed(2);
}

function fingerprint(scope: OriginalV1FixtureScope, token: string, amount: string) {
  return createHash("sha256").update(`${scope}|${token}|${amount}`).digest("hex");
}

function localStatementKey(organizationId: string, statementId: string) {
  return `private/statements/${organizationId}/${statementId}/synthetic-placeholder.pdf`;
}

export function buildOriginalV1FixturePlan(
  scope: OriginalV1FixtureScope,
): OriginalV1FixturePlan {
  const development = scope === "development";
  const domain = development
    ? "original-v1.example.test"
    : "original-v1-integration.example.test";
  const clerkPrefix = development ? "original-v1-local:" : "original-v1-integration-local:";
  const placeholderPdf = originalV1PdfBytes(ORIGINAL_V1_FIXTURE_STATEMENT_WARNING);
  const placeholderChecksum = createHash("sha256").update(placeholderPdf).digest("hex");
  const organizationId = fixtureId(scope, 1);
  const adminId = fixtureId(scope, 2);
  const treasurerId = fixtureId(scope, 3);
  const dataEntryId = fixtureId(scope, 4);
  const viewerId = fixtureId(scope, 5);
  const portalId = fixtureId(scope, 6);
  const patId = fixtureId(scope, 7);
  const alexId = fixtureId(scope, 8);
  const jordanId = fixtureId(scope, 9);
  const morganId = fixtureId(scope, 10);
  const rileyId = fixtureId(scope, 11);
  const householdId = fixtureId(scope, 12);
  const generalId = fixtureId(scope, 15);
  const buildingId = fixtureId(scope, 16);
  const missionsId = fixtureId(scope, 17);
  const benevolenceId = fixtureId(scope, 18);
  const draftId = fixtureId(scope, 19);
  const lockedId = fixtureId(scope, 20);
  const checkId = fixtureId(scope, 21);
  const envelopeId = fixtureId(scope, 22);
  const anonymousId = fixtureId(scope, 23);
  const householdAddress = "200 Fictional Lane";
  const checkAmount = money("25.00");
  const envelopeGeneral = money("10.00");
  const envelopeMissions = money("15.00");
  const envelopeAmount = sumMoney([envelopeGeneral, envelopeMissions]);
  const anonymousAmount = money("50.00");
  const lockedTotal = sumMoney([checkAmount, envelopeAmount, anonymousAmount]);
  const checkToken = `original-v1-${scope}-gift-check`;
  const envelopeToken = `original-v1-${scope}-gift-envelope`;
  const anonymousToken = `original-v1-${scope}-gift-anonymous`;
  const individualStatementId = fixtureId(scope, 31);
  const householdStatementId = fixtureId(scope, 32);

  const plan: OriginalV1FixturePlan = {
    scope,
    placeholderPdf,
    placeholderChecksum,
    organization: {
      id: organizationId,
      name: development ? "Grace Community Church" : "Original V1 Integration Church",
      displayName: development ? "Grace Community" : "Original V1 Integration",
      slug: development ? "original-v1-grace-community" : "original-v1-integration-church",
      ein: development ? "00-0000000" : "00-0000001",
      mailingAddressLine1: "100 Fictional Lane",
      city: "Example",
      state: "TN",
      postalCode: "00000",
      country: "US",
      contactEmail: `office@${domain}`,
      statementFooterText:
        "No goods or services were provided in exchange for these contributions other than intangible religious benefits. SYNTHETIC FIXTURE PLACEHOLDER. NOT A TAX STATEMENT.",
      timeZone: "America/New_York",
      locale: "en-US",
    },
    users: [
      {
        id: adminId,
        membershipId: fixtureId(scope, 33),
        clerkUserId: `${clerkPrefix}org-admin`,
        primaryEmail: `org-admin@${domain}`,
        displayName: "Organization Admin",
        roleCode: "ORG_ADMIN",
      },
      {
        id: treasurerId,
        membershipId: fixtureId(scope, 34),
        clerkUserId: `${clerkPrefix}treasurer`,
        primaryEmail: `treasurer@${domain}`,
        displayName: "Treasurer",
        roleCode: "TREASURER",
      },
      {
        id: dataEntryId,
        membershipId: fixtureId(scope, 35),
        clerkUserId: `${clerkPrefix}data-entry`,
        primaryEmail: `data-entry@${domain}`,
        displayName: "Data Entry",
        roleCode: "DATA_ENTRY",
      },
      {
        id: viewerId,
        membershipId: fixtureId(scope, 36),
        clerkUserId: `${clerkPrefix}report-viewer`,
        primaryEmail: `report-viewer@${domain}`,
        displayName: "Report Viewer",
        roleCode: "REPORT_VIEWER",
      },
      {
        id: portalId,
        membershipId: fixtureId(scope, 37),
        clerkUserId: `${clerkPrefix}portal-donor`,
        primaryEmail: `jordan.taylor@${domain}`,
        displayName: "Jordan Taylor",
        roleCode: "DONOR",
      },
    ],
    donors: [
      donor(patId, null, "Pat", "Smith", domain, householdAddress, true),
      donor(alexId, null, "Alex", "Smith", domain, householdAddress, true),
      donor(jordanId, portalId, "Jordan", "Taylor", domain, "300 Fictional Lane", true),
      donor(morganId, null, "Morgan", "Lee", domain, "400 Fictional Lane", true),
      donor(rileyId, null, "Riley", "Quinn", domain, "500 Fictional Lane", false),
    ],
    household: {
      id: householdId,
      displayName: development ? "Smith Household" : "Integration Smith Household",
      mailingAddressLine1: householdAddress,
      city: "Example",
      state: "TN",
      postalCode: "00000",
      primaryDonorId: patId,
      preferredStatementRecipientId: patId,
    },
    householdMemberships: [
      { id: fixtureId(scope, 13), donorId: patId, startDate: "2024-01-01", endDate: null },
      { id: fixtureId(scope, 14), donorId: alexId, startDate: "2024-01-01", endDate: null },
    ],
    offeringTypes: [
      { id: generalId, name: "General Fund", code: "GENERAL", displayOrder: 1 },
      { id: buildingId, name: "Building Fund", code: "BUILDING", displayOrder: 2 },
      { id: missionsId, name: "Missions", code: "MISSIONS", displayOrder: 3 },
      { id: benevolenceId, name: "Benevolence", code: "BENEVOLENCE", displayOrder: 4 },
    ],
    batches: [
      {
        id: draftId,
        name: development ? "Weekly offering draft" : "Integration weekly offering draft",
        offeringDate: "2026-11-01",
        status: "DRAFT",
        expectedTotal: null,
        recordedTotal: money("0.00"),
        createdByUserAccountId: dataEntryId,
        reviewVersion: 1,
      },
      {
        id: lockedId,
        name: development ? "Historic locked offering" : "Integration historic locked offering",
        offeringDate: "2025-12-07",
        status: "LOCKED",
        expectedTotal: lockedTotal,
        recordedTotal: lockedTotal,
        createdByUserAccountId: treasurerId,
        reviewVersion: 2,
      },
    ],
    donations: [
      {
        id: checkId,
        donorId: jordanId,
        batchId: lockedId,
        offeringDate: "2025-12-07",
        paymentMethod: "CHECK",
        totalAmount: checkAmount,
        deductibleAmount: checkAmount,
        checkNumber: "1001",
        note: null,
        anonymous: false,
      },
      {
        id: envelopeId,
        donorId: alexId,
        batchId: lockedId,
        offeringDate: "2025-12-07",
        paymentMethod: "CASH",
        totalAmount: envelopeAmount,
        deductibleAmount: envelopeAmount,
        checkNumber: null,
        note: "Split envelope",
        anonymous: false,
      },
      {
        id: anonymousId,
        donorId: null,
        batchId: lockedId,
        offeringDate: "2025-12-07",
        paymentMethod: "CASH",
        totalAmount: anonymousAmount,
        deductibleAmount: anonymousAmount,
        checkNumber: null,
        note: null,
        anonymous: true,
      },
    ],
    allocations: [
      { id: fixtureId(scope, 24), donationId: checkId, offeringTypeId: generalId, amount: checkAmount },
      {
        id: fixtureId(scope, 25),
        donationId: envelopeId,
        offeringTypeId: generalId,
        amount: envelopeGeneral,
      },
      {
        id: fixtureId(scope, 26),
        donationId: envelopeId,
        offeringTypeId: missionsId,
        amount: envelopeMissions,
      },
      {
        id: fixtureId(scope, 27),
        donationId: anonymousId,
        offeringTypeId: generalId,
        amount: anonymousAmount,
      },
    ],
    idempotency: [
      token(fixtureId(scope, 28), checkToken, dataEntryId, lockedId, checkId, scope, checkAmount),
      token(fixtureId(scope, 29), envelopeToken, dataEntryId, lockedId, envelopeId, scope, envelopeAmount),
      token(
        fixtureId(scope, 30),
        anonymousToken,
        dataEntryId,
        lockedId,
        anonymousId,
        scope,
        anonymousAmount,
      ),
    ],
    statements: [
      {
        id: individualStatementId,
        statementType: "INDIVIDUAL",
        donorId: jordanId,
        householdId: null,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        taxYear: 2025,
        deductibleTotal: checkAmount,
        statementIdentifier: development
          ? "SYNTHETIC-ORIGINAL-V1-INDIVIDUAL"
          : "SYNTHETIC-ORIGINAL-V1-INTEGRATION-INDIVIDUAL",
        storageKey: localStatementKey(organizationId, individualStatementId),
        checksum: placeholderChecksum,
      },
      {
        id: householdStatementId,
        statementType: "HOUSEHOLD",
        donorId: null,
        householdId,
        periodStart: "2025-01-01",
        periodEnd: "2025-12-31",
        taxYear: 2025,
        deductibleTotal: envelopeAmount,
        statementIdentifier: development
          ? "SYNTHETIC-ORIGINAL-V1-HOUSEHOLD"
          : "SYNTHETIC-ORIGINAL-V1-INTEGRATION-HOUSEHOLD",
        storageKey: localStatementKey(organizationId, householdStatementId),
        checksum: placeholderChecksum,
      },
    ],
  };
  assertFixturePlan(plan);
  return plan;
}

function donor(
  id: string,
  userAccountId: string | null,
  firstName: string,
  lastName: string,
  domain: string,
  mailingAddressLine1: string,
  active: boolean,
): OriginalV1FixturePlan["donors"][number] {
  return {
    id,
    userAccountId,
    firstName,
    lastName,
    email: `${firstName}.${lastName}@${domain}`.toLowerCase(),
    mailingAddressLine1,
    city: "Example",
    state: "TN",
    postalCode: "00000",
    active,
  };
}

function token(
  id: string,
  operationToken: string,
  actorUserAccountId: string,
  batchId: string,
  donationId: string,
  scope: OriginalV1FixtureScope,
  amount: string,
): OriginalV1FixturePlan["idempotency"][number] {
  return {
    id,
    operationToken,
    actorUserAccountId,
    batchId,
    donationId,
    payloadFingerprint: fingerprint(scope, operationToken, amount),
  };
}

function assertFixturePlan(plan: OriginalV1FixturePlan) {
  if (plan.scope === "development" && plan.organization.name !== "Grace Community Church") {
    throw new Error("The development fixture church must be Grace Community Church.");
  }
  if (plan.scope === "integration" && plan.organization.name === "Grace Community Church") {
    throw new Error("The integration fixture uses a separate church namespace.");
  }
  const ids = new Set<string>();
  for (const id of ownedIdList(plan)) {
    if (ids.has(id)) throw new Error("Fixture identifiers must be unique.");
    ids.add(id);
  }
  for (const user of plan.users) {
    if (!user.clerkUserId.includes("local:") || user.clerkUserId.startsWith("user_")) {
      throw new Error("Fixture account identifiers must stay local.");
    }
    if (!user.primaryEmail.endsWith(".example.test")) {
      throw new Error("Fixture emails must stay on the fictional example domain.");
    }
  }
  const smiths = plan.donors.filter((row) => row.lastName === "Smith");
  if (smiths.length !== 2 || new Set(smiths.map((row) => row.mailingAddressLine1)).size !== 1) {
    throw new Error("Smith Household requires two donors at one shared address.");
  }
  const jordan = plan.donors.find((row) => row.firstName === "Jordan" && row.lastName === "Taylor");
  const morgan = plan.donors.find((row) => row.firstName === "Morgan" && row.lastName === "Lee");
  const riley = plan.donors.find((row) => row.firstName === "Riley");
  if (!jordan?.userAccountId || morgan?.userAccountId || riley?.active !== false) {
    throw new Error("Portal, unlinked, and inactive donor fixtures are incomplete.");
  }
  for (const gift of plan.donations) {
    if (gift.paymentMethod !== "CHECK" && gift.paymentMethod !== "CASH") {
      throw new Error("Fixture gifts cannot use a closed payment method.");
    }
    const allocated = sumMoney(
      plan.allocations.filter((row) => row.donationId === gift.id).map((row) => row.amount),
    );
    if (allocated !== gift.totalAmount || gift.totalAmount !== gift.deductibleAmount) {
      throw new Error("Fixture allocation totals must equal the gift.");
    }
    if (gift.anonymous !== (gift.donorId === null)) {
      throw new Error("An anonymous fixture gift has no donor, and an identified gift has one.");
    }
  }
  const locked = plan.batches.find((batch) => batch.status === "LOCKED");
  const draft = plan.batches.find((batch) => batch.status === "DRAFT");
  if (
    !locked ||
    !draft ||
    draft.recordedTotal !== "0.00" ||
    draft.reviewVersion !== 1 ||
    locked.reviewVersion < 1 ||
    locked.recordedTotal !==
      sumMoney(
        plan.donations.filter((gift) => gift.batchId === locked.id).map((gift) => gift.totalAmount),
      )
  ) {
    throw new Error("Fixture batch totals or review versions are inconsistent.");
  }
  if (!plan.placeholderPdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("The fixture placeholder must be a marked synthetic PDF.");
  }
  const pdfText = plan.placeholderPdf.toString("utf8");
  if (
    !pdfText.includes(ORIGINAL_V1_FIXTURE_STATEMENT_WARNING) ||
    /Grace|Smith|Jordan|Morgan|Riley|00-0000000|Fictional Lane/.test(pdfText)
  ) {
    throw new Error("The fixture placeholder contains church or donor data.");
  }
  for (const statement of plan.statements) {
    if (!statement.storageKey.startsWith("private/statements/") || statement.storageKey.includes("s3v1:")) {
      throw new Error("Fixture statement keys must stay local.");
    }
    if ((statement.donorId === null) === (statement.householdId === null)) {
      throw new Error("A fixture statement belongs to one donor or one household.");
    }
  }
}

function ownedIdList(plan: OriginalV1FixturePlan) {
  return [
    plan.organization.id,
    ...plan.users.flatMap((user) => [user.id, user.membershipId]),
    ...plan.donors.map((row) => row.id),
    plan.household.id,
    ...plan.householdMemberships.map((row) => row.id),
    ...plan.offeringTypes.map((row) => row.id),
    ...plan.batches.map((row) => row.id),
    ...plan.donations.map((row) => row.id),
    ...plan.allocations.map((row) => row.id),
    ...plan.idempotency.map((row) => row.id),
    ...plan.statements.map((row) => row.id),
  ];
}

export function originalV1FixtureReadModel(
  plan: OriginalV1FixturePlan,
): OriginalV1FixtureReadModel {
  return {
    organizations: [plan.organization],
    users: plan.users.map((user) => ({
      id: user.id,
      clerkUserId: user.clerkUserId,
      primaryEmail: user.primaryEmail,
      displayName: user.displayName,
    })),
    memberships: plan.users.map((user) => ({
      id: user.membershipId,
      organizationId: plan.organization.id,
      userAccountId: user.id,
      roleCode: user.roleCode,
    })),
    donors: plan.donors.map((row) => ({ ...row, organizationId: plan.organization.id })),
    households: [{ ...plan.household, organizationId: plan.organization.id }],
    householdMemberships: plan.householdMemberships.map((row) => ({
      id: row.id,
      householdId: plan.household.id,
      donorId: row.donorId,
      startDate: row.startDate,
      endDate: row.endDate,
    })),
    offerings: plan.offeringTypes.map((row) => ({
      ...row,
      organizationId: plan.organization.id,
    })),
    batches: plan.batches.map((row) => ({ ...row, organizationId: plan.organization.id })),
    donations: plan.donations.map((row) => ({ ...row, organizationId: plan.organization.id })),
    allocations: plan.allocations,
    idempotency: plan.idempotency.map((row) => ({
      id: row.id,
      action: IDEMPOTENCY_ACTION,
      operationToken: row.operationToken,
      donationId: row.donationId,
      batchId: row.batchId,
    })),
    statements: plan.statements.map((row) => ({
      id: row.id,
      statementType: row.statementType,
      status: "GENERATED",
      statementIdentifier: row.statementIdentifier,
      donorId: row.donorId,
      householdId: row.householdId,
      deductibleTotal: row.deductibleTotal,
      pdfStorageKey: row.storageKey,
      pdfChecksum: row.checksum,
    })),
  };
}

function snap(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

export function originalV1FixtureObservationFromReadModel(
  model: OriginalV1FixtureReadModel,
): OriginalV1FixtureObservation {
  return {
    organizations: model.organizations.map((row) => ({
      id: row.id,
      snapshot: snap({
        name: row.name,
        displayName: row.displayName,
        slug: row.slug,
        ein: row.ein,
        contactEmail: row.contactEmail,
        statementFooterText: row.statementFooterText,
        mailingAddressLine1: row.mailingAddressLine1,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
      }),
    })),
    users: model.users.map((row) => ({
      id: row.id,
      snapshot: snap({
        clerkUserId: row.clerkUserId,
        primaryEmail: row.primaryEmail,
        displayName: row.displayName,
      }),
    })),
    memberships: model.memberships.map((row) => ({
      id: row.id,
      snapshot: snap({
        organizationId: row.organizationId,
        userAccountId: row.userAccountId,
        roleCode: row.roleCode,
      }),
    })),
    donors: model.donors.map((row) => ({
      id: row.id,
      snapshot: snap({
        organizationId: row.organizationId,
        userAccountId: row.userAccountId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        mailingAddressLine1: row.mailingAddressLine1,
        active: row.active,
      }),
    })),
    households: model.households.map((row) => ({
      id: row.id,
      snapshot: snap({
        organizationId: row.organizationId,
        displayName: row.displayName,
        mailingAddressLine1: row.mailingAddressLine1,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
        primaryDonorId: row.primaryDonorId,
        preferredStatementRecipientId: row.preferredStatementRecipientId,
      }),
    })),
    householdMemberships: model.householdMemberships.map((row) => ({
      id: row.id,
      snapshot: snap({
        householdId: row.householdId,
        donorId: row.donorId,
        startDate: row.startDate,
        endDate: row.endDate,
      }),
    })),
    offerings: model.offerings.map((row) => ({
      id: row.id,
      snapshot: snap({
        organizationId: row.organizationId,
        name: row.name,
        code: row.code,
        displayOrder: row.displayOrder,
      }),
    })),
    batches: model.batches.map((row) => ({
      id: row.id,
      snapshot: snap({
        organizationId: row.organizationId,
        name: row.name,
        offeringDate: row.offeringDate,
        status: row.status,
        expectedTotal: row.expectedTotal,
        recordedTotal: row.recordedTotal,
        createdByUserAccountId: row.createdByUserAccountId,
        reviewVersion: row.reviewVersion,
      }),
    })),
    donations: model.donations.map((row) => ({
      id: row.id,
      snapshot: snap({
        organizationId: row.organizationId,
        donorId: row.donorId,
        batchId: row.batchId,
        offeringDate: row.offeringDate,
        paymentMethod: row.paymentMethod,
        totalAmount: row.totalAmount,
        deductibleAmount: row.deductibleAmount,
        anonymous: row.anonymous,
        checkNumber: row.checkNumber,
      }),
    })),
    allocations: model.allocations.map((row) => ({
      id: row.id,
      snapshot: snap({
        donationId: row.donationId,
        offeringTypeId: row.offeringTypeId,
        amount: row.amount,
      }),
    })),
    idempotency: model.idempotency.map((row) => ({
      id: row.id,
      snapshot: snap({
        action: row.action,
        operationToken: row.operationToken,
        donationId: row.donationId,
        batchId: row.batchId,
      }),
    })),
    statements: model.statements.map((row) => ({
      id: row.id,
      snapshot: snap({
        statementType: row.statementType,
        status: row.status,
        statementIdentifier: row.statementIdentifier,
        donorId: row.donorId,
        householdId: row.householdId,
        deductibleTotal: row.deductibleTotal,
        pdfStorageKey: row.pdfStorageKey,
        pdfChecksum: row.pdfChecksum,
      }),
    })),
  };
}

const FOREIGN_REASONS = {
  organizations:
    "A church with this name, slug, or email already exists and is not owned by this fixture.",
  users:
    "A user account with this email or local identifier already exists and is not owned by this fixture.",
  donors:
    "A donor with this email already exists and is not owned by this fixture.",
  offerings:
    "An offering type with this code already exists for the fixture church and is not owned by this fixture.",
  statements:
    "A statement identifier already exists for the fixture church and is not owned by this fixture.",
} as const;

export function evaluateOriginalV1FixtureOwnership(
  plan: OriginalV1FixturePlan,
  observation: OriginalV1FixtureObservation,
): OriginalV1FixtureDecision {
  const expected = originalV1FixtureObservationFromReadModel(originalV1FixtureReadModel(plan));
  const tables = Object.keys(expected) as Array<keyof OriginalV1FixtureObservation>;
  let found = 0;
  let wanted = 0;
  for (const table of tables) {
    const expectedIds = new Set(expected[table].map((row) => row.id));
    const foreign = observation[table].filter((row) => !expectedIds.has(row.id));
    if (foreign.length > 0) {
      return {
        status: "conflict",
        reason:
          FOREIGN_REASONS[table as keyof typeof FOREIGN_REASONS] ??
          "A fixture read returned a row this fixture does not own.",
      };
    }
    found += observation[table].length;
    wanted += expected[table].length;
  }
  if (found === 0) return { status: "absent" };
  if (found !== wanted) {
    return {
      status: "conflict",
      reason: "Owned original v1 fixture rows are incomplete. They were not repaired or reset.",
    };
  }
  for (const table of tables) {
    const actual = new Map(observation[table].map((row) => [row.id, row.snapshot]));
    for (const row of expected[table]) {
      if (actual.get(row.id) !== row.snapshot) {
        return {
          status: "conflict",
          reason: "Owned original v1 fixture rows differ from this fixture. They were not reset.",
        };
      }
    }
  }
  return { status: "applied" };
}

export function originalV1FixtureManifest(plan: OriginalV1FixturePlan) {
  const locked = plan.batches.find((batch) => batch.status === "LOCKED");
  const draft = plan.batches.find((batch) => batch.status === "DRAFT");
  return {
    scope: plan.scope,
    church: {
      id: plan.organization.id,
      name: plan.organization.name,
      slug: plan.organization.slug,
      ein: plan.organization.ein,
      contactEmail: plan.organization.contactEmail,
    },
    localAccounts: plan.users.map((user) => ({
      role: user.roleCode,
      email: user.primaryEmail,
      localIdentifier: user.clerkUserId,
    })),
    donors: plan.donors.map((row) => ({
      name: `${row.firstName} ${row.lastName}`,
      active: row.active,
      linkedToLocalAccount: row.userAccountId !== null,
    })),
    household: {
      name: plan.household.displayName,
      sharedAddress: plan.household.mailingAddressLine1,
      members: plan.householdMemberships.map((membership) => {
        const member = plan.donors.find((row) => row.id === membership.donorId);
        return member ? `${member.firstName} ${member.lastName}` : membership.donorId;
      }),
    },
    offeringCodes: plan.offeringTypes.map((row) => row.code),
    draftBatch: draft
      ? {
          name: draft.name,
          status: draft.status,
          recordedTotal: draft.recordedTotal,
          reviewVersion: draft.reviewVersion,
        }
      : null,
    lockedBatch: locked
      ? {
          name: locked.name,
          status: locked.status,
          recordedTotal: locked.recordedTotal,
          expectedTotal: locked.expectedTotal,
          reviewVersion: locked.reviewVersion,
          gifts: plan.donations
            .filter((gift) => gift.batchId === locked.id)
            .map((gift) => ({
              paymentMethod: gift.paymentMethod,
              totalAmount: gift.totalAmount,
              anonymous: gift.anonymous,
              allocationCount: plan.allocations.filter((row) => row.donationId === gift.id).length,
            })),
        }
      : null,
    statements: plan.statements.map((statement) => ({
      identifier: statement.statementIdentifier,
      type: statement.statementType,
      deductibleTotal: statement.deductibleTotal,
      storageKey: statement.storageKey,
      checksum: statement.checksum,
      warning: ORIGINAL_V1_FIXTURE_STATEMENT_WARNING,
    })),
    placeholderIsSynthetic: true,
    notATaxStatement: true,
    notRestoreProof: true,
    localIdentityLimitation: ORIGINAL_V1_FIXTURE_LOCAL_ID_LIMIT,
  };
}

export function originalV1FixturePublicReport(
  plan: OriginalV1FixturePlan,
  mode: "dry-run" | "apply",
  status: "not-applied" | "applied" | "already-applied" = "not-applied",
) {
  return {
    mode,
    applyPerformed: mode === "apply",
    status,
    message:
      mode === "dry-run"
        ? ORIGINAL_V1_FIXTURE_DRY_RUN_MESSAGE
        : "Original v1 fixture rows were written only to loopback bits_e2e.",
    localIdentityLimitation: ORIGINAL_V1_FIXTURE_LOCAL_ID_LIMIT,
    statementWarning: ORIGINAL_V1_FIXTURE_STATEMENT_WARNING,
    dryRunCommand: ORIGINAL_V1_FIXTURE_DRY_RUN_COMMAND,
    applyCommand: ORIGINAL_V1_FIXTURE_APPLY_COMMAND,
    manifest: originalV1FixtureManifest(plan),
  };
}

export function classifyOriginalV1FixtureApplyTarget(
  env: Record<string, string | undefined>,
) {
  const preflight = classifyIsolatedDatabasePreflight(env);
  if (!preflight.ok) return preflight;
  const identity = parsePostgresTargetIdentity(preflight.isolatedUrl);
  if (
    !identity ||
    identity.database.toLowerCase() !== ORIGINAL_V1_FIXTURE_DATABASE ||
    identity.hostname !== "loopback"
  ) {
    return { ok: false as const, reason: ORIGINAL_V1_FIXTURE_TARGET_REASON };
  }
  return preflight;
}

export function classifyOriginalV1FixtureInvocation(input: {
  argv: readonly string[];
  env: Record<string, string | undefined>;
}) {
  const plan = buildOriginalV1FixturePlan("development");
  if (!input.argv.includes("--apply")) {
    return { ok: true as const, mode: "dry-run" as const, plan };
  }
  const target = classifyOriginalV1FixtureApplyTarget(input.env);
  if (!target.ok) return target;
  return {
    ok: true as const,
    mode: "apply" as const,
    plan,
    isolatedUrl: target.isolatedUrl,
  };
}

export function originalV1FixtureStatementPath(storageRoot: string, storageKey: string) {
  const normalized = storageKey.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    normalized.includes("..") ||
    normalized.includes("s3v1:") ||
    !normalized.startsWith("private/statements/")
  ) {
    throw new Error("Fixture statement key escaped the local statement directory.");
  }
  const absolute = path.resolve(storageRoot, "storage", normalized);
  const allowed = `${path.resolve(storageRoot, "storage", "private", "statements")}${path.sep}`;
  if (!absolute.startsWith(allowed)) {
    throw new Error("Fixture statement key escaped the local statement directory.");
  }
  return absolute;
}

export function defaultOriginalV1FixtureStorageRoot(
  env: Record<string, string | undefined> = process.env,
) {
  return env.BITS_FILE_STORAGE_ROOT?.trim() || process.cwd();
}

export function createLocalFixtureFilePort(): OriginalV1FixtureFilePort {
  return {
    async inspect(absolutePath, expectedChecksum) {
      try {
        const bytes = await readFile(absolutePath);
        const checksum = createHash("sha256").update(bytes).digest("hex");
        return checksum === expectedChecksum ? "matching" : "different";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
        throw error;
      }
    },
    async createExclusive(absolutePath, bytes) {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      const handle = await open(absolutePath, "wx");
      try {
        await handle.writeFile(bytes);
      } catch (error) {
        await handle.close();
        await unlink(absolutePath).catch(() => undefined);
        throw error;
      }
      await handle.close();
    },
    async remove(absolutePath) {
      await unlink(absolutePath);
    },
  };
}

async function placeholderStates(
  plan: OriginalV1FixturePlan,
  files: OriginalV1FixtureFilePort,
  storageRoot: string,
) {
  const states = [];
  for (const statement of plan.statements) {
    const absolute = originalV1FixtureStatementPath(storageRoot, statement.storageKey);
    states.push({
      absolute,
      checksum: statement.checksum,
      state: await files.inspect(absolute, statement.checksum),
    });
  }
  return states;
}

async function createMissingPlaceholders(
  plan: OriginalV1FixturePlan,
  files: OriginalV1FixtureFilePort,
  storageRoot: string,
) {
  const created: string[] = [];
  try {
    for (const statement of plan.statements) {
      const absolute = originalV1FixtureStatementPath(storageRoot, statement.storageKey);
      const state = await files.inspect(absolute, statement.checksum);
      if (state === "different") {
        throw new Error(
          "A fixture placeholder already exists with different bytes. It was not overwritten.",
        );
      }
      if (state === "missing") {
        try {
          await files.createExclusive(absolute, plan.placeholderPdf);
          created.push(absolute);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const raced = await files.inspect(absolute, statement.checksum);
          if (raced !== "matching") {
            throw new Error(
              "A fixture placeholder already exists with different bytes. It was not overwritten.",
            );
          }
        }
      }
    }
    return created;
  } catch (error) {
    for (const absolute of created) {
      await files.remove(absolute).catch(() => undefined);
    }
    throw error;
  }
}

function text(value: unknown) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function flag(value: unknown) {
  if (value === true || value === "true" || value === "t") return true;
  if (value === false || value === "false" || value === "f") return false;
  throw new Error("Fixture row had an unreadable boolean.");
}

function amount(value: unknown) {
  if (value === null || value === undefined) return null;
  return new Decimal(String(value)).toFixed(2);
}

function requiredText(value: unknown) {
  const parsed = text(value);
  if (parsed === null) throw new Error("Fixture row was missing a required value.");
  return parsed;
}

async function collectObservation(
  query: OriginalV1FixtureQuery,
  plan: OriginalV1FixturePlan,
): Promise<OriginalV1FixtureObservation> {
  const userIds = plan.users.map((user) => user.id);
  const donorIds = plan.donors.map((row) => row.id);
  const organizations = await query(
    `-- ov1:organizations
     SELECT id::text AS id, name, "displayName", slug, ein, "contactEmail",
            "statementFooterText", "mailingAddressLine1", city, state, "postalCode"
     FROM organizations
     WHERE id = $1::uuid OR slug = $2 OR name = $3 OR "contactEmail" = $4`,
    [
      plan.organization.id,
      plan.organization.slug,
      plan.organization.name,
      plan.organization.contactEmail,
    ],
  );
  const users = await query(
    `-- ov1:users
     SELECT id::text AS id, "clerkUserId", "primaryEmail", "displayName"
     FROM user_accounts
     WHERE id = ANY($1::uuid[])
        OR "clerkUserId" = ANY($2::text[])
        OR "primaryEmail" = ANY($3::text[])`,
    [userIds, plan.users.map((user) => user.clerkUserId), plan.users.map((user) => user.primaryEmail)],
  );
  const memberships = await query(
    `-- ov1:memberships
     SELECT m.id::text AS id, m."organizationId"::text AS "organizationId",
            m."userAccountId"::text AS "userAccountId", r.code::text AS "roleCode"
     FROM organization_memberships m
     JOIN role_types r ON r.id = m."roleTypeId"
     WHERE m.id = ANY($1::uuid[])`,
    [plan.users.map((user) => user.membershipId)],
  );
  const donors = await query(
    `-- ov1:donors
     SELECT id::text AS id, "organizationId"::text AS "organizationId",
            "userAccountId"::text AS "userAccountId", "firstName", "lastName", email,
            "mailingAddressLine1", active
     FROM donors
     WHERE id = ANY($1::uuid[]) OR email = ANY($2::text[])`,
    [donorIds, plan.donors.map((row) => row.email)],
  );
  const households = await query(
    `-- ov1:households
     SELECT id::text AS id, "organizationId"::text AS "organizationId", "displayName",
            "mailingAddressLine1", city, state, "postalCode",
            "primaryDonorId"::text AS "primaryDonorId",
            "preferredStatementRecipientId"::text AS "preferredStatementRecipientId"
     FROM households
     WHERE id = $1::uuid`,
    [plan.household.id],
  );
  const householdMemberships = await query(
    `-- ov1:household-memberships
     SELECT id::text AS id, "householdId"::text AS "householdId", "donorId"::text AS "donorId",
            to_char("startDate", 'YYYY-MM-DD') AS "startDate",
            to_char("endDate", 'YYYY-MM-DD') AS "endDate"
     FROM household_memberships
     WHERE id = ANY($1::uuid[])`,
    [plan.householdMemberships.map((row) => row.id)],
  );
  const offerings = await query(
    `-- ov1:offerings
     SELECT id::text AS id, "organizationId"::text AS "organizationId", name, code, "displayOrder"
     FROM offering_types
     WHERE id = ANY($1::uuid[])
        OR ("organizationId" = $2::uuid AND code = ANY($3::text[]))`,
    [plan.offeringTypes.map((row) => row.id), plan.organization.id, plan.offeringTypes.map((row) => row.code)],
  );
  const batches = await query(
    `-- ov1:batches
     SELECT id::text AS id, "organizationId"::text AS "organizationId", name,
            to_char("offeringDate", 'YYYY-MM-DD') AS "offeringDate", status::text AS status,
            "expectedTotal"::text AS "expectedTotal", "recordedTotal"::text AS "recordedTotal",
            "createdByUserAccountId"::text AS "createdByUserAccountId", "reviewVersion"
     FROM offering_batches
     WHERE id = ANY($1::uuid[])`,
    [plan.batches.map((row) => row.id)],
  );
  const donations = await query(
    `-- ov1:donations
     SELECT id::text AS id, "organizationId"::text AS "organizationId",
            "donorId"::text AS "donorId", "batchId"::text AS "batchId",
            to_char("offeringDate", 'YYYY-MM-DD') AS "offeringDate",
            "paymentMethod"::text AS "paymentMethod", "totalAmount"::text AS "totalAmount",
            "deductibleAmount"::text AS "deductibleAmount", anonymous, "checkNumber"
     FROM donations
     WHERE id = ANY($1::uuid[])`,
    [plan.donations.map((row) => row.id)],
  );
  const allocations = await query(
    `-- ov1:allocations
     SELECT id::text AS id, "donationId"::text AS "donationId",
            "offeringTypeId"::text AS "offeringTypeId", amount::text AS amount
     FROM donation_allocations
     WHERE id = ANY($1::uuid[])`,
    [plan.allocations.map((row) => row.id)],
  );
  const idempotency = await query(
    `-- ov1:idempotency
     SELECT id::text AS id, action, "operationToken", "donationId"::text AS "donationId",
            "batchId"::text AS "batchId"
     FROM ledger_create_idempotency
     WHERE id = ANY($1::uuid[])`,
    [plan.idempotency.map((row) => row.id)],
  );
  const statements = await query(
    `-- ov1:statements
     SELECT id::text AS id, "statementType"::text AS "statementType", status::text AS status,
            "statementIdentifier", "donorId"::text AS "donorId", "householdId"::text AS "householdId",
            "deductibleTotal"::text AS "deductibleTotal", "pdfStorageKey", "pdfChecksum"
     FROM contribution_statements
     WHERE id = ANY($1::uuid[])
        OR ("organizationId" = $2::uuid AND "statementIdentifier" = ANY($3::text[]))`,
    [
      plan.statements.map((row) => row.id),
      plan.organization.id,
      plan.statements.map((row) => row.statementIdentifier),
    ],
  );

  const model: OriginalV1FixtureReadModel = {
    organizations: organizations.rows.map((row) => ({
      id: requiredText(row.id),
      name: requiredText(row.name),
      displayName: text(row.displayName) ?? "",
      slug: requiredText(row.slug),
      ein: text(row.ein) ?? "",
      contactEmail: text(row.contactEmail) ?? "",
      statementFooterText: text(row.statementFooterText) ?? "",
      mailingAddressLine1: requiredText(row.mailingAddressLine1),
      city: requiredText(row.city),
      state: requiredText(row.state),
      postalCode: requiredText(row.postalCode),
      country: "US",
      timeZone: "America/New_York",
      locale: "en-US",
    })),
    users: users.rows.map((row) => ({
      id: requiredText(row.id),
      clerkUserId: requiredText(row.clerkUserId),
      primaryEmail: requiredText(row.primaryEmail),
      displayName: text(row.displayName) ?? "",
    })),
    memberships: memberships.rows.map((row) => ({
      id: requiredText(row.id),
      organizationId: requiredText(row.organizationId),
      userAccountId: requiredText(row.userAccountId),
      roleCode: requiredText(row.roleCode),
    })),
    donors: donors.rows.map((row) => ({
      id: requiredText(row.id),
      organizationId: requiredText(row.organizationId),
      userAccountId: text(row.userAccountId),
      firstName: requiredText(row.firstName),
      lastName: requiredText(row.lastName),
      email: text(row.email) ?? "",
      mailingAddressLine1: text(row.mailingAddressLine1) ?? "",
      city: "Example",
      state: "TN",
      postalCode: "00000",
      active: flag(row.active),
    })),
    households: households.rows.map((row) => ({
      id: requiredText(row.id),
      organizationId: requiredText(row.organizationId),
      displayName: requiredText(row.displayName),
      mailingAddressLine1: requiredText(row.mailingAddressLine1),
      city: requiredText(row.city),
      state: requiredText(row.state),
      postalCode: requiredText(row.postalCode),
      primaryDonorId: requiredText(row.primaryDonorId),
      preferredStatementRecipientId: requiredText(row.preferredStatementRecipientId),
    })),
    householdMemberships: householdMemberships.rows.map((row) => ({
      id: requiredText(row.id),
      householdId: requiredText(row.householdId),
      donorId: requiredText(row.donorId),
      startDate: requiredText(row.startDate),
      endDate: text(row.endDate),
    })),
    offerings: offerings.rows.map((row) => ({
      id: requiredText(row.id),
      organizationId: requiredText(row.organizationId),
      name: requiredText(row.name),
      code: requiredText(row.code),
      displayOrder: Number(row.displayOrder),
    })),
    batches: batches.rows.map((row) => ({
      id: requiredText(row.id),
      organizationId: requiredText(row.organizationId),
      name: requiredText(row.name),
      offeringDate: requiredText(row.offeringDate),
      status: requiredText(row.status) as "DRAFT" | "LOCKED",
      expectedTotal: amount(row.expectedTotal),
      recordedTotal: amount(row.recordedTotal) ?? "0.00",
      createdByUserAccountId: requiredText(row.createdByUserAccountId),
      reviewVersion: Number(row.reviewVersion),
    })),
    donations: donations.rows.map((row) => ({
      id: requiredText(row.id),
      organizationId: requiredText(row.organizationId),
      donorId: text(row.donorId),
      batchId: requiredText(row.batchId),
      offeringDate: requiredText(row.offeringDate),
      paymentMethod: requiredText(row.paymentMethod) as "CHECK" | "CASH",
      totalAmount: amount(row.totalAmount) ?? "0.00",
      deductibleAmount: amount(row.deductibleAmount) ?? "0.00",
      checkNumber: text(row.checkNumber),
      note: null,
      anonymous: flag(row.anonymous),
    })),
    allocations: allocations.rows.map((row) => ({
      id: requiredText(row.id),
      donationId: requiredText(row.donationId),
      offeringTypeId: requiredText(row.offeringTypeId),
      amount: amount(row.amount) ?? "0.00",
    })),
    idempotency: idempotency.rows.map((row) => ({
      id: requiredText(row.id),
      action: requiredText(row.action),
      operationToken: requiredText(row.operationToken),
      donationId: requiredText(row.donationId),
      batchId: requiredText(row.batchId),
    })),
    statements: statements.rows.map((row) => ({
      id: requiredText(row.id),
      statementType: requiredText(row.statementType),
      status: requiredText(row.status),
      statementIdentifier: requiredText(row.statementIdentifier),
      donorId: text(row.donorId),
      householdId: text(row.householdId),
      deductibleTotal: amount(row.deductibleTotal) ?? "0.00",
      pdfStorageKey: requiredText(row.pdfStorageKey),
      pdfChecksum: text(row.pdfChecksum) ?? "",
    })),
  };
  return originalV1FixtureObservationFromReadModel(model);
}

async function insertFixture(query: OriginalV1FixtureQuery, plan: OriginalV1FixturePlan) {
  for (const [code, name] of ROLE_NAMES) {
    await query(
      `INSERT INTO role_types (id, code, name, "updatedAt")
       SELECT gen_random_uuid(), $1::"RoleCode", $2, $3::timestamptz
       WHERE NOT EXISTS (SELECT 1 FROM role_types WHERE code = $1::"RoleCode")`,
      [code, name, FIXTURE_AT],
    );
  }
  const roles = await query(
    `SELECT id::text AS id, code::text AS code
     FROM role_types
     WHERE code = ANY($1::"RoleCode"[])`,
    [ROLE_NAMES.map(([code]) => code)],
  );
  const roleIds = new Map(
    (roles.rows as Array<{ id: string; code: string }>).map((row) => [row.code, row.id]),
  );
  if (ROLE_NAMES.some(([code]) => !roleIds.get(code))) {
    throw new Error("A required role definition is missing and was not rewritten.");
  }

  const org = plan.organization;
  await query(
    `INSERT INTO organizations
      (id, name, "displayName", slug, ein, "mailingAddressLine1", city, state, "postalCode",
       country, "contactEmail", "statementFooterText", "timeZone", locale, "updatedAt")
     VALUES
      ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamptz)`,
    [
      org.id,
      org.name,
      org.displayName,
      org.slug,
      org.ein,
      org.mailingAddressLine1,
      org.city,
      org.state,
      org.postalCode,
      org.country,
      org.contactEmail,
      org.statementFooterText,
      org.timeZone,
      org.locale,
      FIXTURE_AT,
    ],
  );

  for (const user of plan.users) {
    await query(
      `INSERT INTO user_accounts
        (id, "clerkUserId", "primaryEmail", "displayName", "updatedAt")
       VALUES ($1::uuid, $2, $3, $4, $5::timestamptz)`,
      [user.id, user.clerkUserId, user.primaryEmail, user.displayName, FIXTURE_AT],
    );
    await query(
      `INSERT INTO organization_memberships
        (id, "organizationId", "userAccountId", "roleTypeId", version, "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, $5::timestamptz)`,
      [user.membershipId, org.id, user.id, roleIds.get(user.roleCode), FIXTURE_AT],
    );
  }

  for (const row of plan.donors) {
    await query(
      `INSERT INTO donors
        (id, "organizationId", "userAccountId", "firstName", "lastName", email,
         "mailingAddressLine1", city, state, "postalCode", country, active, "updatedAt")
       VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, 'US', $11, $12::timestamptz)`,
      [
        row.id,
        org.id,
        row.userAccountId,
        row.firstName,
        row.lastName,
        row.email,
        row.mailingAddressLine1,
        row.city,
        row.state,
        row.postalCode,
        row.active,
        FIXTURE_AT,
      ],
    );
  }

  await query(
    `INSERT INTO households
      (id, "organizationId", "displayName", "mailingAddressLine1", city, state, "postalCode",
       country, "primaryDonorId", "preferredStatementRecipientId", "updatedAt")
     VALUES
      ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'US', $8::uuid, $9::uuid, $10::timestamptz)`,
    [
      plan.household.id,
      org.id,
      plan.household.displayName,
      plan.household.mailingAddressLine1,
      plan.household.city,
      plan.household.state,
      plan.household.postalCode,
      plan.household.primaryDonorId,
      plan.household.preferredStatementRecipientId,
      FIXTURE_AT,
    ],
  );

  for (const membership of plan.householdMemberships) {
    await query(
      `INSERT INTO household_memberships
        (id, "organizationId", "householdId", "donorId", "startDate", "endDate", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, $6::date, $7::timestamptz)`,
      [
        membership.id,
        org.id,
        plan.household.id,
        membership.donorId,
        membership.startDate,
        membership.endDate,
        FIXTURE_AT,
      ],
    );
  }

  for (const offering of plan.offeringTypes) {
    await query(
      `INSERT INTO offering_types
        (id, "organizationId", name, code, "defaultTaxDeductible", "onlineGivingEnabled",
         "displayOrder", "updatedAt")
       VALUES ($1::uuid, $2::uuid, $3, $4, true, false, $5::int, $6::timestamptz)`,
      [offering.id, org.id, offering.name, offering.code, offering.displayOrder, FIXTURE_AT],
    );
  }

  for (const batch of plan.batches) {
    await query(
      `INSERT INTO offering_batches
        (id, "organizationId", name, "offeringDate", status, "expectedTotal", "recordedTotal",
         "createdByUserAccountId", "reviewVersion", "updatedAt")
       VALUES
        ($1::uuid, $2::uuid, $3, $4::date, $5::"OfferingBatchStatus", $6::numeric, $7::numeric,
         $8::uuid, $9::int, $10::timestamptz)`,
      [
        batch.id,
        org.id,
        batch.name,
        batch.offeringDate,
        batch.status,
        batch.expectedTotal,
        batch.recordedTotal,
        batch.createdByUserAccountId,
        batch.reviewVersion,
        FIXTURE_AT,
      ],
    );
  }

  for (const gift of plan.donations) {
    await query(
      `INSERT INTO donations
        (id, "organizationId", "donorId", "batchId", "offeringDate", "receivedDate",
         "paymentMethod", "totalAmount", "deductibleAmount", "checkNumber", note, anonymous,
         "isTaxDeductible", "intangibleReligiousBenefitsOnly", "updatedAt")
       VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, $5::date, $6::"PaymentMethod",
         $7::numeric, $8::numeric, $9, $10, $11, true, true, $12::timestamptz)`,
      [
        gift.id,
        org.id,
        gift.donorId,
        gift.batchId,
        gift.offeringDate,
        gift.paymentMethod,
        gift.totalAmount,
        gift.deductibleAmount,
        gift.checkNumber,
        gift.note,
        gift.anonymous,
        FIXTURE_AT,
      ],
    );
  }

  for (const allocation of plan.allocations) {
    await query(
      `INSERT INTO donation_allocations
        (id, "organizationId", "donationId", "offeringTypeId", amount)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric)`,
      [allocation.id, org.id, allocation.donationId, allocation.offeringTypeId, allocation.amount],
    );
  }

  for (const row of plan.idempotency) {
    await query(
      `INSERT INTO ledger_create_idempotency
        (id, "organizationId", action, "operationToken", "actorUserAccountId", "batchId",
         "payloadFingerprint", "donationId", "resultJson")
       VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7, $8::uuid, $9)`,
      [
        row.id,
        org.id,
        IDEMPOTENCY_ACTION,
        row.operationToken,
        row.actorUserAccountId,
        row.batchId,
        row.payloadFingerprint,
        row.donationId,
        '{"syntheticFixture":true}',
      ],
    );
  }

  for (const statement of plan.statements) {
    await query(
      `INSERT INTO contribution_statements
        (id, "organizationId", "statementType", "donorId", "householdId", "periodStart",
         "periodEnd", "taxYear", "deductibleTotal", "statementIdentifier", "pdfStorageKey",
         "pdfChecksum", status, "generatedByUserAccountId", "generatedAt", "updatedAt")
       VALUES
        ($1::uuid, $2::uuid, $3::"StatementType", $4::uuid, $5::uuid, $6::date, $7::date,
         $8::int, $9::numeric, $10, $11, $12, 'GENERATED'::"StatementStatus", $13::uuid,
         $14::timestamptz, $14::timestamptz)`,
      [
        statement.id,
        org.id,
        statement.statementType,
        statement.donorId,
        statement.householdId,
        statement.periodStart,
        statement.periodEnd,
        statement.taxYear,
        statement.deductibleTotal,
        statement.statementIdentifier,
        statement.storageKey,
        statement.checksum,
        plan.users.find((user) => user.roleCode === "TREASURER")?.id,
        FIXTURE_AT,
      ],
    );
  }
}

export async function applyOriginalV1FixturePlan(input: {
  plan: OriginalV1FixturePlan;
  query: OriginalV1FixtureQuery;
  files: OriginalV1FixtureFilePort;
  storageRoot: string;
}) {
  const identity = await input.query(
    `SELECT current_database() AS database, inet_server_addr()::text AS addr`,
  );
  const connected = identity.rows[0] as { database?: string; addr?: string | null } | undefined;
  if (
    !connected ||
    connected.database !== ORIGINAL_V1_FIXTURE_DATABASE ||
    !isRecoveryLoopbackAddress(connected.addr)
  ) {
    throw new Error("The connected database is not loopback bits_e2e. No fixture rows were written.");
  }

  const tables = await input.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [ORIGINAL_V1_FIXTURE_TABLES],
  );
  const found = new Set(tables.rows.map((row) => String(row.table_name)));
  if (ORIGINAL_V1_FIXTURE_TABLES.some((name) => !found.has(name))) {
    throw new Error(
      "The isolated schema is not ready for original v1 fixtures. No migration or reset was run.",
    );
  }

  const existingFiles = await placeholderStates(input.plan, input.files, input.storageRoot);
  if (existingFiles.some((file) => file.state === "different")) {
    throw new Error(
      "A fixture placeholder already exists with different bytes. It was not overwritten.",
    );
  }

  let status: "applied" | "already-applied";
  await input.query("BEGIN");
  try {
    const decision = evaluateOriginalV1FixtureOwnership(
      input.plan,
      await collectObservation(input.query, input.plan),
    );
    if (decision.status === "conflict") {
      throw new Error(decision.reason);
    }
    if (decision.status === "absent") {
      await insertFixture(input.query, input.plan);
    }
    await input.query("COMMIT");
    status = decision.status === "absent" ? "applied" : "already-applied";
  } catch (error) {
    await input.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  await createMissingPlaceholders(input.plan, input.files, input.storageRoot);
  return { status };
}

export async function executeOriginalV1DevelopmentFixtures(input: {
  argv: readonly string[];
  env: Record<string, string | undefined>;
  connect?: (connectionString: string) => Promise<OriginalV1FixtureConnection>;
  files?: OriginalV1FixtureFilePort;
  storageRoot?: string;
  writeStdout?: (text: string) => void;
  writeStderr?: (text: string) => void;
}) {
  const writeStdout = input.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = input.writeStderr ?? ((text: string) => process.stderr.write(text));
  let connection: OriginalV1FixtureConnection | null = null;
  try {
    const invocation = classifyOriginalV1FixtureInvocation(input);
    if (!invocation.ok) {
      writeStderr(`${invocation.reason}\n`);
      return 2;
    }
    if (invocation.mode === "dry-run") {
      writeStdout(
        `${JSON.stringify(originalV1FixturePublicReport(invocation.plan, "dry-run"), null, 2)}\n`,
      );
      return 0;
    }
    if (!input.connect) {
      writeStderr("Apply requires a database connector. No fixture rows were written.\n");
      return 2;
    }
    connection = await input.connect(invocation.isolatedUrl);
    const result = await applyOriginalV1FixturePlan({
      plan: invocation.plan,
      query: connection.query,
      files: input.files ?? createLocalFixtureFilePort(),
      storageRoot: input.storageRoot ?? defaultOriginalV1FixtureStorageRoot(input.env),
    });
    writeStdout(
      `${JSON.stringify(originalV1FixturePublicReport(invocation.plan, "apply", result.status), null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    writeStderr(`${describeIsolatedRunnerFailure(error)}\n`);
    return 2;
  } finally {
    await connection?.end().catch(() => undefined);
  }
}
