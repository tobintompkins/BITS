import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it, vi } from "vitest";

import {
  PrismaClient,
  RoleCode,
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { moneyEquals } from "@/lib/money/decimal";
import {
  isolatedConnectionString,
  isolatedDatabaseRunEnabled,
} from "@/lib/testing/isolated-database";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import { postgresTargetsAreEquivalent } from "@/lib/testing/original-v1-database-url";
import { resolveStatementPdfWriteConfig } from "@/lib/storage/statement-pdf-config";
import {
  getPrivateStatementStorageRoot,
  openAuthorizedStatementPdf,
} from "@/lib/storage/statement-pdf";
import {
  IndividualStatementGenerationError,
  generateIndividualContributionStatement,
} from "@/server/services/individual-statement-generation.service";
import {
  IndividualStatementPublishError,
  publishIndividualContributionStatement,
} from "@/server/services/individual-statement-publish.service";
import {
  generateHouseholdContributionStatement,
} from "@/server/services/household-statement-generation.service";
import {
  HouseholdStatementPublishError,
  publishHouseholdContributionStatement,
} from "@/server/services/household-statement-publish.service";
import {
  authorizePortalStatementPdf,
  recordPortalStatementAccess,
} from "@/server/services/member-portal-statement-pdf.service";

const session = vi.hoisted(() => ({ userId: "", orgId: "" }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({
    userId: session.userId || null,
    orgId: session.orgId || null,
  }),
  currentUser: async () => null,
}));

loadOriginalV1AcceptanceEnvFiles();

const canUseIsolatedDb = isolatedDatabaseRunEnabled();
const runId = `stmt-${randomUUID().slice(0, 8)}`;
const roles = [
  RoleCode.ORG_ADMIN,
  RoleCode.TREASURER,
  RoleCode.DATA_ENTRY,
  RoleCode.REPORT_VIEWER,
  RoleCode.DONOR,
] as const;

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: isolatedConnectionString(),
      max: 2,
    }),
  });
}

function assertIsolatedTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl ||
    !postgresTargetsAreEquivalent(databaseUrl, isolatedConnectionString())
  ) {
    throw new Error(
      "Statement SQL refused to run because DATABASE_URL is not isolated bits_e2e.",
    );
  }
}

function day(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe.skipIf(!canUseIsolatedDb)(
  "statement coverage (isolated bits_e2e)",
  () => {
    const clients: PrismaClient[] = [];
    const created = {
      organizationIds: [] as string[],
      userAccountIds: [] as string[],
    };

    afterAll(async () => {
      const prisma = clients[0] ?? createClient();
      if (!clients.includes(prisma)) clients.push(prisma);
      try {
        if (created.organizationIds.length) {
          await prisma.statementAccessEvent.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.contributionStatement.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.auditEvent.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.donationAllocation.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.donation.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.householdMembership.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.household.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.offeringType.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.donor.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.organizationMembership.deleteMany({
            where: { organizationId: { in: created.organizationIds } },
          });
          await prisma.organization.deleteMany({
            where: { id: { in: created.organizationIds } },
          });
          await Promise.all(
            created.organizationIds.map((organizationId) =>
              rm(`${getPrivateStatementStorageRoot()}/${organizationId}`, {
                recursive: true,
                force: true,
              }),
            ),
          );
        }
        if (created.userAccountIds.length) {
          await prisma.userAccount.deleteMany({
            where: { id: { in: created.userAccountIds } },
          });
        }
      } finally {
        await Promise.all(clients.map((client) => client.$disconnect()));
      }
    });

    it("applies statement boundaries, decimals, access, and audits on isolated rows", async () => {
      assertIsolatedTarget();
      process.env.BITS_STATEMENT_PDF_BACKEND = "local";
      const storage = resolveStatementPdfWriteConfig();
      if (!storage.ok || storage.backend !== "local") {
        throw new Error(
          "Statement SQL refused to run because statement storage is not local.",
        );
      }

      const setup = createClient();
      clients.push(setup);
      const roleRows = await setup.roleType.findMany({
        where: { code: { in: [...roles] } },
      });
      if (roleRows.length !== roles.length) {
        throw new Error(
          "Isolated role types are incomplete. Statement tests will not create global roles.",
        );
      }
      const roleId = new Map(roleRows.map((row) => [row.code, row.id]));
      const seedKey = `${runId}-${randomUUID().slice(0, 8)}`;
      const clerkOrgId = `org_${seedKey}`;
      const actors = new Map<string, { id: string; clerkUserId: string }>();

      async function addUser(key: string) {
        const clerkUserId = `${seedKey}-${key}`;
        const user = await setup.userAccount.create({
          data: {
            clerkUserId,
            primaryEmail: `${seedKey}-${key}@church.test`,
            displayName: `${key} Statement Actor`,
          },
        });
        created.userAccountIds.push(user.id);
        actors.set(key, { id: user.id, clerkUserId });
        return user;
      }

      const orgAdmin = await addUser("org-admin");
      const treasurer = await addUser("treasurer");
      const dataEntry = await addUser("data-entry");
      const reportViewer = await addUser("report-viewer");
      const patUser = await addUser("pat");
      const leeUser = await addUser("lee");
      const kimUser = await addUser("kim");
      const org = await setup.organization.create({
        data: {
          name: `${seedKey} Chapel`,
          slug: seedKey,
          clerkOrganizationId: clerkOrgId,
          mailingAddressLine1: "1 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
          statementFooterText: "No goods or services were provided.",
        },
      });
      created.organizationIds.push(org.id);
      for (const [user, role] of [
        [orgAdmin, RoleCode.ORG_ADMIN],
        [treasurer, RoleCode.TREASURER],
        [dataEntry, RoleCode.DATA_ENTRY],
        [reportViewer, RoleCode.REPORT_VIEWER],
        [patUser, RoleCode.DONOR],
        [leeUser, RoleCode.DONOR],
        [kimUser, RoleCode.DONOR],
      ] as const) {
        await setup.organizationMembership.create({
          data: {
            organizationId: org.id,
            userAccountId: user.id,
            roleTypeId: roleId.get(role)!,
          },
        });
      }

      async function addDonor(
        firstName: string,
        userId: string | null,
      ) {
        return setup.donor.create({
          data: {
            organizationId: org.id,
            userAccountId: userId,
            firstName,
            lastName: seedKey,
            mailingAddressLine1: "1 Test Lane",
            city: "Testville",
            state: "TN",
            postalCode: "37201",
            country: "US",
          },
        });
      }

      const pat = await addDonor("Pat", patUser.id);
      const lee = await addDonor("Lee", leeUser.id);
      const kim = await addDonor("Kim", kimUser.id);
      const general = await setup.offeringType.create({
        data: {
          organizationId: org.id,
          name: "General",
          code: `${seedKey}-gen`,
        },
      });
      const missions = await setup.offeringType.create({
        data: {
          organizationId: org.id,
          name: "Missions",
          code: `${seedKey}-mis`,
        },
      });
      const household = await setup.household.create({
        data: {
          organizationId: org.id,
          displayName: `${seedKey} Household`,
          mailingAddressLine1: "1 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
          preferredStatementRecipientId: kim.id,
        },
      });
      const endedHousehold = await setup.household.create({
        data: {
          organizationId: org.id,
          displayName: `${seedKey} Ended`,
          mailingAddressLine1: "2 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
          preferredStatementRecipientId: lee.id,
        },
      });
      await setup.householdMembership.createMany({
        data: [
          {
            organizationId: org.id,
            householdId: household.id,
            donorId: pat.id,
            startDate: day("2020-01-01"),
          },
          {
            organizationId: org.id,
            householdId: household.id,
            donorId: lee.id,
            startDate: day("2026-01-01"),
            endDate: day("2026-03-31"),
          },
          {
            organizationId: org.id,
            householdId: household.id,
            donorId: kim.id,
            startDate: day("2026-07-01"),
          },
          {
            organizationId: org.id,
            householdId: endedHousehold.id,
            donorId: lee.id,
            startDate: day("2024-01-01"),
            endDate: day("2026-03-31"),
          },
        ],
      });

      async function addGift(input: {
        donorId: string | null;
        anonymous: boolean;
        isTest?: boolean;
        offeringDate: string;
        amount: string;
        checkNumber?: string;
        allocations?: Array<{ fundId: string; amount: string }>;
      }) {
        const donation = await setup.donation.create({
          data: {
            organizationId: org.id,
            donorId: input.donorId,
            anonymous: input.anonymous,
            isTest: input.isTest ?? false,
            offeringDate: day(input.offeringDate),
            receivedDate: day(input.offeringDate),
            paymentMethod: input.checkNumber ? "CHECK" : "CASH",
            checkNumber: input.checkNumber ?? null,
            totalAmount: input.amount,
            deductibleAmount: input.amount,
          },
        });
        const allocations = input.allocations ?? [
          { fundId: general.id, amount: input.amount },
        ];
        await setup.donationAllocation.createMany({
          data: allocations.map((row) => ({
            organizationId: org.id,
            donationId: donation.id,
            offeringTypeId: row.fundId,
            amount: row.amount,
          })),
        });
        return donation;
      }

      await addGift({
        donorId: pat.id,
        anonymous: false,
        offeringDate: "2025-12-31",
        amount: "1.00",
        checkNumber: "441",
      });
      await addGift({
        donorId: pat.id,
        anonymous: false,
        offeringDate: "2026-01-01",
        amount: "0.10",
        checkNumber: "441",
      });
      await addGift({
        donorId: pat.id,
        anonymous: false,
        offeringDate: "2026-12-31",
        amount: "0.30",
        checkNumber: "441",
        allocations: [
          { fundId: general.id, amount: "0.10" },
          { fundId: missions.id, amount: "0.20" },
        ],
      });
      await addGift({
        donorId: pat.id,
        anonymous: false,
        offeringDate: "2027-01-01",
        amount: "1.00",
        checkNumber: "441",
      });
      await addGift({
        donorId: null,
        anonymous: true,
        offeringDate: "2026-06-15",
        amount: "5.00",
      });
      await addGift({
        donorId: pat.id,
        anonymous: true,
        offeringDate: "2026-06-16",
        amount: "6.00",
      });
      await addGift({
        donorId: pat.id,
        anonymous: false,
        isTest: true,
        offeringDate: "2026-06-17",
        amount: "9.00",
      });
      await addGift({
        donorId: lee.id,
        anonymous: false,
        offeringDate: "2025-12-31",
        amount: "2.00",
        checkNumber: "441",
      });
      await addGift({
        donorId: lee.id,
        anonymous: false,
        offeringDate: "2026-01-01",
        amount: "0.10",
        checkNumber: "441",
      });
      await addGift({
        donorId: lee.id,
        anonymous: false,
        offeringDate: "2026-03-31",
        amount: "0.20",
        checkNumber: "441",
      });
      await addGift({
        donorId: lee.id,
        anonymous: false,
        offeringDate: "2026-04-01",
        amount: "3.00",
        checkNumber: "441",
      });
      await addGift({
        donorId: kim.id,
        anonymous: false,
        offeringDate: "2026-06-30",
        amount: "4.00",
        checkNumber: "441",
      });
      await addGift({
        donorId: kim.id,
        anonymous: false,
        offeringDate: "2026-07-01",
        amount: "0.30",
        checkNumber: "441",
        allocations: [
          { fundId: general.id, amount: "0.10" },
          { fundId: missions.id, amount: "0.20" },
        ],
      });

      const now = day("2026-11-16");
      function actAs(key: string) {
        const actor = actors.get(key);
        if (!actor) throw new Error(`Missing ${key} actor.`);
        session.userId = actor.clerkUserId;
        session.orgId = clerkOrgId;
      }

      async function snapshot() {
        const statements = await setup.contributionStatement.findMany({
          where: { organizationId: org.id },
          orderBy: { id: "asc" },
          select: {
            id: true,
            status: true,
            statementType: true,
            donorId: true,
            householdId: true,
            deductibleTotal: true,
          },
        });
        const audits = await setup.auditEvent.findMany({
          where: { organizationId: org.id },
          orderBy: { id: "asc" },
          select: {
            id: true,
            action: true,
            entityId: true,
            actorUserAccountId: true,
            changeMetadata: true,
          },
        });
        const access = await setup.statementAccessEvent.findMany({
          where: { organizationId: org.id },
          orderBy: { id: "asc" },
          select: {
            id: true,
            statementId: true,
            userAccountId: true,
            action: true,
          },
        });
        const gifts = await setup.donation.findMany({
          where: { organizationId: org.id },
          orderBy: { id: "asc" },
          select: {
            id: true,
            donorId: true,
            anonymous: true,
            isTest: true,
            totalAmount: true,
            deductibleAmount: true,
          },
        });
        return {
          statements: statements.map((row) => ({
            ...row,
            deductibleTotal: row.deductibleTotal.toString(),
          })),
          audits,
          access,
          gifts: gifts.map((row) => ({
            ...row,
            totalAmount: row.totalAmount.toString(),
            deductibleAmount: row.deductibleAmount.toString(),
          })),
        };
      }

      async function expectUnchanged(run: () => Promise<unknown>) {
        const before = await snapshot();
        await run();
        expect(await snapshot()).toEqual(before);
      }

      const beforeGenerate = await snapshot();
      for (const key of ["data-entry", "report-viewer", "pat"]) {
        actAs(key);
        await expectUnchanged(() =>
          expect(
            generateIndividualContributionStatement(
              { donorId: pat.id, year: "2026" },
              now,
            ),
          ).rejects.toBeInstanceOf(IndividualStatementGenerationError),
        );
        await expect(
          generateIndividualContributionStatement(
            { donorId: pat.id, year: "2026" },
            now,
          ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(await snapshot()).toEqual(beforeGenerate);

      actAs("treasurer");
      const individual = await generateIndividualContributionStatement(
        { donorId: pat.id, year: "2026" },
        now,
      );
      const householdStatement = await generateHouseholdContributionStatement(
        { householdId: household.id, year: "2026" },
        now,
      );
      const individualRow = await setup.contributionStatement.findFirstOrThrow({
        where: { id: individual.statementId, organizationId: org.id },
      });
      const householdRow = await setup.contributionStatement.findFirstOrThrow({
        where: { id: householdStatement.statementId, organizationId: org.id },
      });
      const individualTotal = await setup.$queryRaw<Array<{ total: string }>>`
        SELECT "deductibleTotal"::text AS total
        FROM contribution_statements
        WHERE id = ${individual.statementId}::uuid
      `;
      const householdTotal = await setup.$queryRaw<Array<{ total: string }>>`
        SELECT "deductibleTotal"::text AS total
        FROM contribution_statements
        WHERE id = ${householdStatement.statementId}::uuid
      `;
      expect(individualRow.statementType).toBe(StatementType.INDIVIDUAL);
      expect(individualRow.donorId).toBe(pat.id);
      expect(individualRow.householdId).toBeNull();
      expect(individualRow.status).toBe(StatementStatus.GENERATED);
      expect(individualTotal[0]?.total).toBe("0.40");
      expect(moneyEquals(individualRow.deductibleTotal.toString(), "0.40")).toBe(
        true,
      );
      expect(householdRow.statementType).toBe(StatementType.HOUSEHOLD);
      expect(householdRow.householdId).toBe(household.id);
      expect(householdRow.donorId).toBeNull();
      expect(householdTotal[0]?.total).toBe("1.00");
      expect(moneyEquals(householdRow.deductibleTotal.toString(), "1.00")).toBe(
        true,
      );
      expect(individualRow.periodStart.toISOString().slice(0, 10)).toBe(
        "2026-01-01",
      );
      expect(individualRow.periodEnd.toISOString().slice(0, 10)).toBe(
        "2026-12-31",
      );

      const generateAudits = await setup.auditEvent.findMany({
        where: {
          organizationId: org.id,
          action: "GENERATE_CONTRIBUTION_STATEMENT",
        },
        orderBy: { id: "asc" },
      });
      expect(generateAudits).toHaveLength(2);
      expect(generateAudits.map((row) => row.entityId).sort()).toEqual(
        [individual.statementId, householdStatement.statementId].sort(),
      );
      const changesFor = (statementId: string) => {
        const audit = generateAudits.find((row) => row.entityId === statementId);
        const metadata = audit?.changeMetadata as {
          changes?: Array<{ field: string; newValue: string | null }>;
        };
        return metadata?.changes ?? [];
      };
      expect(changesFor(individual.statementId).map((change) => change.field)).toEqual([
        "statementType",
        "taxYear",
        "recipientId",
        "deductibleTotal",
        "statementIdentifier",
        "status",
      ]);
      expect(changesFor(householdStatement.statementId).map((change) => change.field)).toEqual([
        "statementType",
        "taxYear",
        "householdId",
        "deductibleTotal",
        "statementIdentifier",
        "status",
      ]);
      expect(
        changesFor(individual.statementId).find(
          (change) => change.field === "deductibleTotal",
        )?.newValue,
      ).toBe("0.40");
      expect(
        changesFor(householdStatement.statementId).find(
          (change) => change.field === "deductibleTotal",
        )?.newValue,
      ).toBe("1.00");
      expect(await snapshot()).toMatchObject({
        gifts: beforeGenerate.gifts,
      });

      await expect(
        publishIndividualContributionStatement({
          statementId: individual.statementId,
        }),
      ).rejects.toBeInstanceOf(IndividualStatementPublishError);
      await expect(
        publishIndividualContributionStatement({
          statementId: individual.statementId,
        }),
      ).rejects.toMatchObject({ code: "SAME_PERSON" });
      expect(
        (
          await setup.contributionStatement.findFirstOrThrow({
            where: { id: individual.statementId },
          })
        ).status,
      ).toBe(StatementStatus.GENERATED);

      actAs("data-entry");
      await expect(
        publishHouseholdContributionStatement({
          statementId: householdStatement.statementId,
        }),
      ).rejects.toBeInstanceOf(HouseholdStatementPublishError);
      await expect(
        publishHouseholdContributionStatement({
          statementId: householdStatement.statementId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      actAs("pat");
      expect(
        await authorizePortalStatementPdf(individual.statementId, "download"),
      ).toMatchObject({ status: "NOT_AVAILABLE" });
      expect(await setup.statementAccessEvent.count({
        where: { organizationId: org.id },
      })).toBe(0);

      actAs("org-admin");
      await publishIndividualContributionStatement({
        statementId: individual.statementId,
      });
      await publishHouseholdContributionStatement({
        statementId: householdStatement.statementId,
      });
      const publishAudits = await setup.auditEvent.findMany({
        where: {
          organizationId: org.id,
          action: "PUBLISH_CONTRIBUTION_STATEMENT",
        },
      });
      expect(publishAudits).toHaveLength(2);
      expect(publishAudits.every((row) => row.actorUserAccountId === orgAdmin.id)).toBe(
        true,
      );

      const endedStatement = await setup.contributionStatement.create({
        data: {
          organizationId: org.id,
          statementType: StatementType.HOUSEHOLD,
          donorId: null,
          householdId: endedHousehold.id,
          periodStart: day("2026-01-01"),
          periodEnd: day("2026-12-31"),
          taxYear: 2026,
          deductibleTotal: "0.00",
          statementIdentifier: `HH-${seedKey}`.slice(0, 40),
          pdfStorageKey: `private/statements/${org.id}/${randomUUID()}/ended.pdf`,
          status: StatementStatus.PUBLISHED,
          generatedByUserAccountId: treasurer.id,
        },
      });

      actAs("lee");
      expect(
        await authorizePortalStatementPdf(individual.statementId, "download"),
      ).toMatchObject({ status: "NOT_AVAILABLE" });
      expect(
        await authorizePortalStatementPdf(householdStatement.statementId, "download"),
      ).toMatchObject({ status: "NOT_AVAILABLE" });
      expect(
        await authorizePortalStatementPdf(endedStatement.id, "download"),
      ).toMatchObject({ status: "NOT_AVAILABLE" });
      session.userId = "";
      expect(
        await authorizePortalStatementPdf(individual.statementId, "download"),
      ).toMatchObject({ status: "SIGNED_OUT" });
      expect(await setup.statementAccessEvent.count({
        where: { organizationId: org.id },
      })).toBe(0);

      async function download(statementId: string) {
        const authorized = await authorizePortalStatementPdf(statementId, "download");
        expect(authorized.status).toBe("AUTHORIZED");
        if (authorized.status !== "AUTHORIZED") return;
        const opened = await openAuthorizedStatementPdf({
          organizationId: authorized.organizationId,
          statementId: authorized.statementId,
          storageKey: authorized.pdfStorageKey,
          checksum: authorized.pdfChecksum,
        });
        expect(opened.ok).toBe(true);
        if (opened.ok) opened.stream.destroy();
        await recordPortalStatementAccess({
          organizationId: authorized.organizationId,
          statementId: authorized.statementId,
          userAccountId: authorized.userAccountId,
          mode: authorized.mode,
        });
      }

      actAs("pat");
      await download(individual.statementId);
      expect(
        await authorizePortalStatementPdf(householdStatement.statementId, "download"),
      ).toMatchObject({ status: "NOT_AVAILABLE" });
      actAs("kim");
      await download(householdStatement.statementId);

      const access = await setup.statementAccessEvent.findMany({
        where: { organizationId: org.id },
      });
      expect(access).toHaveLength(2);
      expect(access).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            statementId: individual.statementId,
            userAccountId: patUser.id,
            action: "DOWNLOADED",
          }),
          expect.objectContaining({
            statementId: householdStatement.statementId,
            userAccountId: kimUser.id,
            action: "DOWNLOADED",
          }),
        ]),
      );
      expect(
        (
          await setup.contributionStatement.findMany({
            where: {
              id: { in: [individual.statementId, householdStatement.statementId] },
            },
            orderBy: { statementType: "asc" },
          })
        ).map((row) => row.status),
      ).toEqual([StatementStatus.PUBLISHED, StatementStatus.PUBLISHED]);
    });
  },
);
