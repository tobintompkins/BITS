import { randomUUID } from "node:crypto";

import {
  PaymentMethod,
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import type { OriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";
import { parseOriginalV1AcceptanceConfig } from "@/lib/testing/original-v1-acceptance-config";

import { lookupAllClerkUserIds } from "./clerk-users";
import { cleanupOwnedOriginalV1Rows } from "./cleanup";
import {
  writeOriginalV1Manifest,
  type OriginalV1Manifest,
} from "./manifest";
import { writeOriginalV1StatementPdf } from "./pdf";
import { createOriginalV1AcceptancePrisma } from "./prisma";

const OFFERING_DATE = "2026-03-15";
const PERIOD = { startDate: "2026-03-01", endDate: "2026-03-31" };
const A1_AMOUNT = "125.50";
const A2_AMOUNT = "40.25";
const B1_AMOUNT = "999.99";

const ROLE_NAMES: Array<{ code: RoleCode; name: string }> = [
  { code: RoleCode.ORG_ADMIN, name: "Organization Admin" },
  { code: RoleCode.TREASURER, name: "Treasurer" },
  { code: RoleCode.DATA_ENTRY, name: "Data Entry" },
  { code: RoleCode.REPORT_VIEWER, name: "Report Viewer" },
  { code: RoleCode.DONOR, name: "Donor" },
];

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function churchAddress() {
  return {
    mailingAddressLine1: "100 Test Chapel Lane",
    city: "Testville",
    state: "TN",
    postalCode: "37201",
    country: "US",
  };
}

function e2eSlug(label: "north" | "south", clerkOrganizationId: string) {
  const tail = clerkOrganizationId.replace(/[^a-z0-9]/gi, "").slice(-20).toLowerCase();
  return `e2e07-${label}-${tail}`.slice(0, 80);
}

export async function prepareOriginalV1AcceptanceFixtures(
  config: OriginalV1AcceptanceConfig = parseOriginalV1AcceptanceConfig(),
) {
  const prisma = createOriginalV1AcceptancePrisma(config);
  try {
    for (const role of ROLE_NAMES) {
      await prisma.roleType.upsert({
        where: { code: role.code },
        update: { name: role.name },
        create: role,
      });
    }

    const clerkUserIds = await lookupAllClerkUserIds(config);
    const orgA = await prisma.organization.upsert({
      where: { clerkOrganizationId: config.clerkOrgAId },
      update: {
        name: "E2E07 Northside Chapel",
        displayName: "Northside Chapel",
        active: true,
      },
      create: {
        clerkOrganizationId: config.clerkOrgAId,
        name: "E2E07 Northside Chapel",
        displayName: "Northside Chapel",
        slug: e2eSlug("north", config.clerkOrgAId),
        ...churchAddress(),
      },
    });
    const orgB = await prisma.organization.upsert({
      where: { clerkOrganizationId: config.clerkOrgBId },
      update: {
        name: "E2E07 Southside Chapel",
        displayName: "Southside Chapel",
        active: true,
      },
      create: {
        clerkOrganizationId: config.clerkOrgBId,
        name: "E2E07 Southside Chapel",
        displayName: "Southside Chapel",
        slug: e2eSlug("south", config.clerkOrgBId),
        ...churchAddress(),
      },
    });

    await cleanupOwnedOriginalV1Rows(prisma, [orgA.id, orgB.id], config.prefix);

    const roles = await prisma.roleType.findMany({
      where: { code: { in: ROLE_NAMES.map((row) => row.code) } },
    });
    const roleId = (code: RoleCode) => {
      const found = roles.find((row) => row.code === code);
      if (!found) throw new Error(`Role type ${code} is missing.`);
      return found.id;
    };

    async function upsertUser(
      clerkUserId: string,
      email: string,
      displayName: string,
    ) {
      return prisma.userAccount.upsert({
        where: { clerkUserId },
        update: { primaryEmail: email, displayName, active: true },
        create: { clerkUserId, primaryEmail: email, displayName, active: true },
      });
    }

    const users = {
      orgAdmin: await upsertUser(
        clerkUserIds.orgAdmin,
        config.emails.orgAdmin,
        "E2E07 Org Admin",
      ),
      treasurer: await upsertUser(
        clerkUserIds.treasurer,
        config.emails.treasurer,
        "E2E07 Treasurer",
      ),
      dataEntry: await upsertUser(
        clerkUserIds.dataEntry,
        config.emails.dataEntry,
        "E2E07 Data Entry",
      ),
      reportViewer: await upsertUser(
        clerkUserIds.reportViewer,
        config.emails.reportViewer,
        "E2E07 Report Viewer",
      ),
      donorA1: await upsertUser(
        clerkUserIds.donorA1,
        config.emails.donorA1,
        "E2E07 Donor A1",
      ),
      donorA2: await upsertUser(
        clerkUserIds.donorA2,
        config.emails.donorA2,
        "E2E07 Donor A2",
      ),
      multiOrg: await upsertUser(
        clerkUserIds.multiOrg,
        config.emails.multiOrg,
        "E2E07 Multi Org",
      ),
    };

    async function upsertMembership(
      organizationId: string,
      userAccountId: string,
      code: RoleCode,
    ) {
      await prisma.organizationMembership.upsert({
        where: {
          organizationId_userAccountId: { organizationId, userAccountId },
        },
        update: { roleTypeId: roleId(code), active: true },
        create: {
          organizationId,
          userAccountId,
          roleTypeId: roleId(code),
          active: true,
        },
      });
    }

    await upsertMembership(orgA.id, users.orgAdmin.id, RoleCode.ORG_ADMIN);
    await upsertMembership(orgA.id, users.treasurer.id, RoleCode.TREASURER);
    await upsertMembership(orgA.id, users.dataEntry.id, RoleCode.DATA_ENTRY);
    await upsertMembership(orgA.id, users.reportViewer.id, RoleCode.REPORT_VIEWER);
    await upsertMembership(orgA.id, users.donorA1.id, RoleCode.DONOR);
    await upsertMembership(orgA.id, users.donorA2.id, RoleCode.DONOR);
    await upsertMembership(orgA.id, users.multiOrg.id, RoleCode.ORG_ADMIN);
    await upsertMembership(orgB.id, users.multiOrg.id, RoleCode.ORG_ADMIN);

    const prefix = config.prefix;
    await prisma.donor.updateMany({
      where: {
        organizationId: { in: [orgA.id, orgB.id] },
        userAccountId: {
          in: [
            users.donorA1.id,
            users.donorA2.id,
            users.orgAdmin.id,
            users.treasurer.id,
            users.dataEntry.id,
            users.reportViewer.id,
            users.multiOrg.id,
          ],
        },
      },
      data: { userAccountId: null },
    });
    const donorA1 = await prisma.donor.create({
      data: {
        organizationId: orgA.id,
        userAccountId: users.donorA1.id,
        firstName: `${prefix}Avery`,
        lastName: "North",
        email: config.emails.donorA1,
        active: true,
      },
    });
    const donorA2 = await prisma.donor.create({
      data: {
        organizationId: orgA.id,
        userAccountId: users.donorA2.id,
        firstName: `${prefix}Blake`,
        lastName: "North",
        email: config.emails.donorA2,
        active: true,
      },
    });
    const donorUnassigned = await prisma.donor.create({
      data: {
        organizationId: orgA.id,
        firstName: `${prefix}Casey`,
        lastName: "North",
        active: true,
      },
    });
    const donorB1 = await prisma.donor.create({
      data: {
        organizationId: orgB.id,
        firstName: `${prefix}Drew`,
        lastName: "South",
        active: true,
      },
    });

    const householdA = await prisma.household.create({
      data: {
        organizationId: orgA.id,
        displayName: `${prefix}North Household`,
        ...churchAddress(),
        primaryDonorId: donorA1.id,
        preferredStatementRecipientId: donorA1.id,
        statementDeliveryMethod: "EMAIL",
        active: true,
      },
    });
    const householdB = await prisma.household.create({
      data: {
        organizationId: orgB.id,
        displayName: `${prefix}South Household`,
        ...churchAddress(),
        primaryDonorId: donorB1.id,
        preferredStatementRecipientId: donorB1.id,
        active: true,
      },
    });

    await prisma.householdMembership.createMany({
      data: [
        {
          organizationId: orgA.id,
          householdId: householdA.id,
          donorId: donorA1.id,
          startDate: dateOnly("2026-01-01"),
          relationshipLabel: "Spouse",
        },
        {
          organizationId: orgA.id,
          householdId: householdA.id,
          donorId: donorA2.id,
          startDate: dateOnly("2026-01-01"),
          relationshipLabel: "Spouse",
        },
        {
          organizationId: orgB.id,
          householdId: householdB.id,
          donorId: donorB1.id,
          startDate: dateOnly("2026-01-01"),
        },
      ],
    });

    const offeringTypeA = await prisma.offeringType.create({
      data: {
        organizationId: orgA.id,
        name: `${prefix}General`,
        code: `E2E07A${config.runId}`.slice(0, 64),
        defaultTaxDeductible: true,
        active: true,
      },
    });
    const offeringTypeB = await prisma.offeringType.create({
      data: {
        organizationId: orgB.id,
        name: `${prefix}Missions`,
        code: `E2E07B${config.runId}`.slice(0, 64),
        defaultTaxDeductible: true,
        active: true,
      },
    });

    const batchA = await prisma.offeringBatch.create({
      data: {
        organizationId: orgA.id,
        name: `${prefix}Sunday`,
        offeringDate: dateOnly(OFFERING_DATE),
        status: "ENTERED",
        recordedTotal: A1_AMOUNT,
        createdByUserAccountId: users.orgAdmin.id,
      },
    });
    const batchB = await prisma.offeringBatch.create({
      data: {
        organizationId: orgB.id,
        name: `${prefix}Sunday B`,
        offeringDate: dateOnly(OFFERING_DATE),
        status: "ENTERED",
        recordedTotal: B1_AMOUNT,
        createdByUserAccountId: users.multiOrg.id,
      },
    });

    const donationA1 = await prisma.donation.create({
      data: {
        organizationId: orgA.id,
        donorId: donorA1.id,
        batchId: batchA.id,
        offeringDate: dateOnly(OFFERING_DATE),
        receivedDate: dateOnly(OFFERING_DATE),
        paymentMethod: PaymentMethod.CHECK,
        totalAmount: A1_AMOUNT,
        deductibleAmount: A1_AMOUNT,
        note: `${prefix}A1`,
        allocations: {
          create: {
            organizationId: orgA.id,
            offeringTypeId: offeringTypeA.id,
            amount: A1_AMOUNT,
          },
        },
      },
    });
    const donationA2 = await prisma.donation.create({
      data: {
        organizationId: orgA.id,
        donorId: donorA2.id,
        batchId: batchA.id,
        offeringDate: dateOnly(OFFERING_DATE),
        receivedDate: dateOnly(OFFERING_DATE),
        paymentMethod: PaymentMethod.CASH,
        totalAmount: A2_AMOUNT,
        deductibleAmount: A2_AMOUNT,
        note: `${prefix}A2`,
        allocations: {
          create: {
            organizationId: orgA.id,
            offeringTypeId: offeringTypeA.id,
            amount: A2_AMOUNT,
          },
        },
      },
    });
    const donationB1 = await prisma.donation.create({
      data: {
        organizationId: orgB.id,
        donorId: donorB1.id,
        batchId: batchB.id,
        offeringDate: dateOnly(OFFERING_DATE),
        receivedDate: dateOnly(OFFERING_DATE),
        paymentMethod: PaymentMethod.CHECK,
        totalAmount: B1_AMOUNT,
        deductibleAmount: B1_AMOUNT,
        note: `${prefix}B1`,
        allocations: {
          create: {
            organizationId: orgB.id,
            offeringTypeId: offeringTypeB.id,
            amount: B1_AMOUNT,
          },
        },
      },
    });

    await prisma.offeringBatch.update({
      where: { id: batchA.id },
      data: { recordedTotal: "165.75" },
    });

    async function createStatement(input: {
      organizationId: string;
      identifier: string;
      marker: string;
      status: StatementStatus;
      type: StatementType;
      donorId?: string;
      householdId?: string;
    }) {
      const id = randomUUID();
      const pdf = await writeOriginalV1StatementPdf({
        organizationId: input.organizationId,
        statementId: id,
        marker: input.marker,
      });
      await prisma.contributionStatement.create({
        data: {
          id,
          organizationId: input.organizationId,
          statementType: input.type,
          donorId: input.donorId ?? null,
          householdId: input.householdId ?? null,
          periodStart: dateOnly("2026-01-01"),
          periodEnd: dateOnly("2026-03-31"),
          taxYear: 2026,
          deductibleTotal: "0.00",
          statementIdentifier: input.identifier,
          pdfStorageKey: pdf.storageKey,
          pdfChecksum: pdf.checksum,
          status: input.status,
          generatedByUserAccountId: users.orgAdmin.id,
        },
      });
      return { id, marker: input.marker };
    }

    const statements = {
      a1Published: await createStatement({
        organizationId: orgA.id,
        identifier: `${prefix}A1-PUB`,
        marker: `${prefix}A1-PUBLISHED`,
        status: StatementStatus.PUBLISHED,
        type: StatementType.INDIVIDUAL,
        donorId: donorA1.id,
      }),
      a1Generated: await createStatement({
        organizationId: orgA.id,
        identifier: `${prefix}A1-GEN`,
        marker: `${prefix}A1-GENERATED`,
        status: StatementStatus.GENERATED,
        type: StatementType.INDIVIDUAL,
        donorId: donorA1.id,
      }),
      a2Published: await createStatement({
        organizationId: orgA.id,
        identifier: `${prefix}A2-PUB`,
        marker: `${prefix}A2-PUBLISHED`,
        status: StatementStatus.PUBLISHED,
        type: StatementType.INDIVIDUAL,
        donorId: donorA2.id,
      }),
      aHouseholdPublished: await createStatement({
        organizationId: orgA.id,
        identifier: `${prefix}HH-PUB`,
        marker: `${prefix}HOUSEHOLD-PUBLISHED`,
        status: StatementStatus.PUBLISHED,
        type: StatementType.HOUSEHOLD,
        householdId: householdA.id,
      }),
      b1Published: await createStatement({
        organizationId: orgB.id,
        identifier: `${prefix}B1-PUB`,
        marker: `${prefix}B1-PUBLISHED`,
        status: StatementStatus.PUBLISHED,
        type: StatementType.INDIVIDUAL,
        donorId: donorB1.id,
      }),
      b1Generated: await createStatement({
        organizationId: orgB.id,
        identifier: `${prefix}B1-GEN`,
        marker: `${prefix}B1-GENERATED`,
        status: StatementStatus.GENERATED,
        type: StatementType.INDIVIDUAL,
        donorId: donorB1.id,
      }),
    };

    await prisma.statementAccessEvent.create({
      data: {
        organizationId: orgA.id,
        statementId: statements.a1Published.id,
        userAccountId: users.donorA1.id,
        action: "VIEWED",
        occurredAt: dateOnly("2026-03-20"),
      },
    });

    const manifest: OriginalV1Manifest = {
      runId: config.runId,
      prefix,
      offeringDate: OFFERING_DATE,
      period: PERIOD,
      orgs: {
        a: {
          id: orgA.id,
          clerkOrganizationId: config.clerkOrgAId,
          name: orgA.displayName ?? orgA.name,
        },
        b: {
          id: orgB.id,
          clerkOrganizationId: config.clerkOrgBId,
          name: orgB.displayName ?? orgB.name,
        },
      },
      users: {
        orgAdmin: { id: users.orgAdmin.id, clerkUserId: users.orgAdmin.clerkUserId },
        treasurer: { id: users.treasurer.id, clerkUserId: users.treasurer.clerkUserId },
        dataEntry: { id: users.dataEntry.id, clerkUserId: users.dataEntry.clerkUserId },
        reportViewer: {
          id: users.reportViewer.id,
          clerkUserId: users.reportViewer.clerkUserId,
        },
        donorA1: { id: users.donorA1.id, clerkUserId: users.donorA1.clerkUserId },
        donorA2: { id: users.donorA2.id, clerkUserId: users.donorA2.clerkUserId },
        multiOrg: { id: users.multiOrg.id, clerkUserId: users.multiOrg.clerkUserId },
      },
      donors: {
        a1: {
          id: donorA1.id,
          label: `${donorA1.lastName}, ${donorA1.firstName}`,
          amount: A1_AMOUNT,
        },
        a2: {
          id: donorA2.id,
          label: `${donorA2.lastName}, ${donorA2.firstName}`,
          amount: A2_AMOUNT,
        },
        aUnassigned: {
          id: donorUnassigned.id,
          label: `${donorUnassigned.lastName}, ${donorUnassigned.firstName}`,
        },
        b1: {
          id: donorB1.id,
          label: `${donorB1.lastName}, ${donorB1.firstName}`,
          amount: B1_AMOUNT,
        },
      },
      households: {
        a: { id: householdA.id, label: householdA.displayName },
        b: { id: householdB.id, label: householdB.displayName },
      },
      offeringTypes: {
        a: { id: offeringTypeA.id, label: offeringTypeA.name },
        b: { id: offeringTypeB.id, label: offeringTypeB.name },
      },
      batches: {
        a: { id: batchA.id, label: batchA.name },
        b: { id: batchB.id, label: batchB.name },
      },
      donations: {
        a1: { id: donationA1.id, amount: A1_AMOUNT },
        a2: { id: donationA2.id, amount: A2_AMOUNT },
        b1: { id: donationB1.id, amount: B1_AMOUNT },
      },
      statements,
    };

    await writeOriginalV1Manifest(manifest);
    return manifest;
  } finally {
    await prisma.$disconnect();
  }
}
