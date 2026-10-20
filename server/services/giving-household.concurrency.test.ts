import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  PaymentMethod,
  PrismaClient,
  RoleCode,
} from "@/app/generated/prisma/client";
import { attributeGiftToHousehold } from "@/lib/reports/household-attribution";
import {
  isolatedConnectionString,
  isolatedDatabaseRunEnabled,
} from "@/lib/testing/isolated-database";
import { loadOriginalV1AcceptanceEnvFiles } from "@/lib/testing/original-v1-acceptance-env";
import {
  READY_GIVING_HOUSEHOLD_INDEX_SHAPE,
  assertGivingHouseholdSchemaReady,
  classifyGivingHouseholdSchema,
  inspectGivingHouseholdSchema,
  givingHouseholdSchemaReadinessMessage,
} from "@/lib/testing/giving-household-schema-readiness";
import { emptyGivingHousehold } from "@/lib/validation/giving-household";
import {
  runWithGivingHouseholdPrisma,
  runWithGivingHouseholdSeams,
  type GivingHouseholdTx,
} from "@/server/services/giving-household-runtime";
import {
  endGivingHouseholdMembership,
  linkGivingHouseholdDonor,
  moveGivingHouseholdDonor,
  saveGivingHousehold,
} from "@/server/services/giving-household.service";

const actorStore = new AsyncLocalStorage<{
  userId: string | null;
  orgId: string | null;
}>();

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => actorStore.getStore() ?? { userId: null, orgId: null },
}));

loadOriginalV1AcceptanceEnvFiles();

const canUseIsolatedDb = isolatedDatabaseRunEnabled();
const runId = `core12a-${randomUUID().slice(0, 8)}`;
const NOW = new Date("2026-10-19T20:00:00.000Z");
const MOVE_DAY = "2026-10-19";
const CLOSE_DAY = "2026-10-18";
const FROZEN_MS = Date.parse("2026-10-19T20:00:00.123Z");
const LOCK_WAIT_MS = 5_000;

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: isolatedConnectionString(),
      max: 2,
    }),
  });
}

function householdInput(displayName: string, overrides: Record<string, unknown> = {}) {
  return {
    ...emptyGivingHousehold,
    displayName,
    mailingAddressLine1: "1 Test Lane",
    city: "Testville",
    state: "TN",
    postalCode: "37201",
    country: "US",
    active: true,
    ...overrides,
  };
}

function settledMessages(results: PromiseSettledResult<unknown>[]) {
  return results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) =>
      result.reason instanceof Error ? result.reason.message : String(result.reason),
    );
}

function dateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

describe.skipIf(!canUseIsolatedDb)(
  "giving household concurrency (isolated bits_e2e)",
  () => {
    const clients: PrismaClient[] = [];
    const owned = {
      organizationIds: [] as string[],
      userAccountIds: [] as string[],
    };
    const control = { organizationId: "", userAccountId: "" };

    beforeAll(async () => {
      const setup = createClient();
      clients.push(setup);
      const key = `${runId}-control`;
      const org = await setup.organization.create({
        data: {
          name: `${key} Control`,
          slug: key,
          clerkOrganizationId: key,
          mailingAddressLine1: "9 Control Way",
          city: "Control",
          state: "TN",
          postalCode: "37201",
          country: "US",
        },
      });
      const user = await setup.userAccount.create({
        data: {
          clerkUserId: `${key}-user`,
          primaryEmail: `${key}@control.test`,
          displayName: "Isolation control",
        },
      });
      control.organizationId = org.id;
      control.userAccountId = user.id;
    });

    afterAll(async () => {
      const prisma = clients[0] ?? createClient();
      if (!clients.includes(prisma)) clients.push(prisma);
      try {
        if (owned.organizationIds.length) {
          await prisma.auditEvent.deleteMany({
            where: { organizationId: { in: owned.organizationIds } },
          });
          await prisma.donation.deleteMany({
            where: { organizationId: { in: owned.organizationIds } },
          });
          await prisma.householdMembership.deleteMany({
            where: { organizationId: { in: owned.organizationIds } },
          });
          await prisma.household.deleteMany({
            where: { organizationId: { in: owned.organizationIds } },
          });
          await prisma.donor.deleteMany({
            where: { organizationId: { in: owned.organizationIds } },
          });
          await prisma.organization.deleteMany({
            where: { id: { in: owned.organizationIds } },
          });
        }
        if (owned.userAccountIds.length) {
          await prisma.userAccount.deleteMany({
            where: { id: { in: owned.userAccountIds } },
          });
        }
        expect(
          await prisma.organization.count({
            where: { id: { in: owned.organizationIds } },
          }),
        ).toBe(0);
        expect(
          await prisma.organization.count({
            where: { id: control.organizationId },
          }),
        ).toBe(1);
        await prisma.organization.deleteMany({
          where: { id: control.organizationId },
        });
        await prisma.userAccount.deleteMany({
          where: { id: control.userAccountId },
        });
      } finally {
        await Promise.all(clients.map((client) => client.$disconnect()));
      }
    });

    async function asActor<T>(
      client: PrismaClient,
      actor: { clerkUserId: string; clerkOrgId: string | null },
      fn: () => Promise<T>,
    ) {
      return runWithGivingHouseholdPrisma(client, () =>
        actorStore.run({ userId: actor.clerkUserId, orgId: actor.clerkOrgId }, fn),
      );
    }

    async function backendPid(tx: GivingHouseholdTx) {
      const rows = await tx.$queryRaw<Array<{ pid: number | bigint }>>`
        SELECT pg_backend_pid() AS pid
      `;
      return Number(rows[0]?.pid);
    }

    async function waitUntilBlocked(
      observer: PrismaClient,
      waitingPid: number,
      blockingPid: number,
    ) {
      const deadline = Date.now() + LOCK_WAIT_MS;
      while (Date.now() < deadline) {
        const rows = await observer.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT ${blockingPid}::int = ANY (pg_blocking_pids(${waitingPid}::int)) AS blocked
        `;
        if (rows[0]?.blocked) return;
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      throw new Error(
        `Timed out waiting for backend ${waitingPid} to be blocked by ${blockingPid}. This fails if household/donor FOR UPDATE locks are removed.`,
      );
    }

    async function runWithObservedLockContention<T, U>(
      observer: PrismaClient,
      first: () => Promise<T>,
      second: () => Promise<U>,
    ) {
      let releaseFirst!: () => void;
      const firstMayFinish = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let firstEnteredCritical = false;
      const cancelWaiters: Array<() => void> = [];
      let firstLockResolve!: () => void;
      const firstLocked = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("first writer never acquired locks")),
          LOCK_WAIT_MS,
        );
        cancelWaiters.push(() => clearTimeout(timer));
        firstLockResolve = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      let firstPid = 0;
      let secondPid = 0;
      let sawFirstStart = false;
      let secondPidResolve!: (pid: number) => void;
      const secondPidReady = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("second writer never entered a transaction")),
          LOCK_WAIT_MS,
        );
        cancelWaiters.push(() => clearTimeout(timer));
        secondPidResolve = (pid: number) => {
          clearTimeout(timer);
          resolve(pid);
        };
      });

      return runWithGivingHouseholdSeams(
        {
          onTransactionStart: async (tx) => {
            const pid = await backendPid(tx);
            if (!sawFirstStart) {
              sawFirstStart = true;
              firstPid = pid;
              return;
            }
            if (!secondPid) {
              secondPid = pid;
              secondPidResolve(pid);
            }
          },
          afterLocks: async () => {
            if (firstEnteredCritical) return;
            firstEnteredCritical = true;
            firstLockResolve();
            await firstMayFinish;
          },
        },
        async () => {
          const firstP = first();
          await Promise.race([
            firstLocked,
            firstP.then(
              () => {
                throw new Error("first writer finished before after-locks hook");
              },
              (error: unknown) => {
                throw error;
              },
            ),
          ]);
          const secondP = second();
          let observeError: unknown;
          try {
            await waitUntilBlocked(observer, await secondPidReady, firstPid);
          } catch (error) {
            observeError = error;
          } finally {
            releaseFirst();
          }
          try {
            const results = await Promise.allSettled([firstP, secondP]);
            if (observeError) throw observeError;
            return results;
          } finally {
            for (const cancel of cancelWaiters) cancel();
            releaseFirst();
          }
        },
      );
    }

    async function ensureRoles(db: PrismaClient) {
      for (const code of [
        RoleCode.ORG_ADMIN,
        RoleCode.TREASURER,
        RoleCode.DATA_ENTRY,
        RoleCode.REPORT_VIEWER,
        RoleCode.DONOR,
      ]) {
        await db.roleType.upsert({
          where: { code },
          update: {},
          create: { code, name: code },
        });
      }
    }

    async function seedChurch(label: string) {
      const setup = createClient();
      clients.push(setup);
      const schema = await inspectGivingHouseholdSchema(setup);
      if (schema.status !== "ready") {
        throw new Error(
          `${givingHouseholdSchemaReadinessMessage(schema)} Isolated household tests refuse to ALTER TABLE or use the working database.`,
        );
      }
      assertGivingHouseholdSchemaReady(schema);
      await ensureRoles(setup);

      const key = `${runId}-${label}-${randomUUID().slice(0, 8)}`;
      const org = await setup.organization.create({
        data: {
          name: `${key} Chapel`,
          slug: key,
          clerkOrganizationId: key,
          mailingAddressLine1: "1 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
          timeZone: "America/New_York",
        },
      });
      owned.organizationIds.push(org.id);

      async function staff(role: RoleCode, suffix: string) {
        const user = await setup.userAccount.create({
          data: {
            clerkUserId: `${key}-${suffix}`,
            primaryEmail: `${key}-${suffix}@church.test`,
            displayName: `${label} ${suffix}`,
          },
        });
        owned.userAccountIds.push(user.id);
        const roleType = await setup.roleType.findUniqueOrThrow({
          where: { code: role },
        });
        await setup.organizationMembership.create({
          data: {
            organizationId: org.id,
            userAccountId: user.id,
            roleTypeId: roleType.id,
            active: true,
          },
        });
        return {
          ...user,
          clerkUserId: user.clerkUserId,
          clerkOrgId: key,
        };
      }

      return {
        setup,
        org,
        clerkOrgId: key,
        admin: await staff(RoleCode.ORG_ADMIN, "admin"),
        treasurer: await staff(RoleCode.TREASURER, "treasurer"),
        dataEntry: await staff(RoleCode.DATA_ENTRY, "data"),
        reportViewer: await staff(RoleCode.REPORT_VIEWER, "report"),
        donorUser: await staff(RoleCode.DONOR, "donor"),
      };
    }

    async function createDonor(
      db: PrismaClient,
      organizationId: string,
      firstName: string,
    ) {
      return db.donor.create({
        data: { organizationId, firstName, lastName: runId },
      });
    }

    async function createHousehold(
      db: PrismaClient,
      organizationId: string,
      displayName: string,
      contacts: { primaryDonorId?: string; preferredStatementRecipientId?: string } = {},
    ) {
      return db.household.create({
        data: {
          organizationId,
          displayName,
          mailingAddressLine1: "1 Test Lane",
          city: "Testville",
          state: "TN",
          postalCode: "37201",
          country: "US",
          active: true,
          ...contacts,
        },
      });
    }

    async function openMembership(
      db: PrismaClient,
      organizationId: string,
      householdId: string,
      donorId: string,
      startDate = new Date("2026-01-01T00:00:00.000Z"),
    ) {
      return db.householdMembership.create({
        data: { organizationId, householdId, donorId, startDate },
      });
    }

    async function twoSessions() {
      const clientA = createClient();
      const clientB = createClient();
      clients.push(clientA, clientB);
      return { clientA, clientB };
    }

    async function auditActions(db: PrismaClient, organizationId: string) {
      const rows = await db.auditEvent.findMany({
        where: { organizationId },
        select: { action: true },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => row.action);
    }

    async function snapshotOrg(db: PrismaClient, organizationId: string) {
      return {
        households: await db.household.findMany({
          where: { organizationId },
          orderBy: { id: "asc" },
          select: {
            id: true,
            active: true,
            city: true,
            primaryDonorId: true,
            preferredStatementRecipientId: true,
            updatedAt: true,
          },
        }),
        memberships: await db.householdMembership.findMany({
          where: { organizationId },
          orderBy: [{ startDate: "asc" }, { id: "asc" }],
          select: {
            id: true,
            householdId: true,
            donorId: true,
            startDate: true,
            endDate: true,
            updatedAt: true,
          },
        }),
        audits: await auditActions(db, organizationId),
      };
    }

    it("inspects the bits_e2e open-membership index shape without mutating schema", async () => {
      const setup = createClient();
      clients.push(setup);
      const state = await inspectGivingHouseholdSchema(setup);
      expect(state).toEqual({ status: "ready" });
      expect(
        classifyGivingHouseholdSchema({
          index: READY_GIVING_HOUSEHOLD_INDEX_SHAPE,
          migrationFinishedAt: new Date(),
          migrationRolledBackAt: null,
        }),
      ).toEqual({ status: "ready" });
    });

    it("allows at most one open membership when two households link the same donor", async () => {
      const church = await seedChurch("link");
      const donor = await createDonor(church.setup, church.org.id, "Pat");
      const householdA = await createHousehold(church.setup, church.org.id, "Alpha");
      const householdB = await createHousehold(church.setup, church.org.id, "Beta");
      const { clientA, clientB } = await twoSessions();

      const results = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.treasurer, () =>
            linkGivingHouseholdDonor(church.org.id, {
              householdId: householdA.id,
              donorId: donor.id,
              startDate: MOVE_DAY,
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.admin, () =>
            linkGivingHouseholdDonor(church.org.id, {
              householdId: householdB.id,
              donorId: donor.id,
              startDate: MOVE_DAY,
              now: NOW,
            }),
          ),
      );

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(settledMessages(results).join(" ")).toMatch(
        /already has an open|overlaps those dates/i,
      );
      const open = await church.setup.householdMembership.findMany({
        where: { organizationId: church.org.id, donorId: donor.id, endDate: null },
      });
      expect(open).toHaveLength(1);
      expect(await auditActions(church.setup, church.org.id)).toEqual([
        "GIVING_HOUSEHOLD_MEMBER_LINKED",
      ]);
    });

    it("keeps exactly one valid move when two targets race from the same membership", async () => {
      const church = await seedChurch("move-race");
      const donor = await createDonor(church.setup, church.org.id, "Morgan");
      const source = await createHousehold(church.setup, church.org.id, "Source");
      const targetA = await createHousehold(church.setup, church.org.id, "Target A");
      const targetB = await createHousehold(church.setup, church.org.id, "Target B");
      const membership = await openMembership(
        church.setup,
        church.org.id,
        source.id,
        donor.id,
      );
      const { clientA, clientB } = await twoSessions();

      const results = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.treasurer, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: membership.id,
              toHouseholdId: targetA.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.admin, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: membership.id,
              toHouseholdId: targetB.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
      );

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rows = await church.setup.householdMembership.findMany({
        where: { organizationId: church.org.id, donorId: donor.id },
        orderBy: { startDate: "asc" },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].householdId).toBe(source.id);
      expect(dateOnly(rows[0].endDate)).toBe(CLOSE_DAY);
      expect(rows[1].endDate).toBeNull();
      expect(dateOnly(rows[1].startDate)).toBe(MOVE_DAY);
      expect([targetA.id, targetB.id]).toContain(rows[1].householdId);
      expect(await auditActions(church.setup, church.org.id)).toEqual([
        "GIVING_HOUSEHOLD_MEMBER_MOVED",
      ]);
    });

    it("serializes move-then-end and end-then-move without a stale recipient pointer", async () => {
      const church = await seedChurch("move-end");
      async function seededMembership(label: string) {
        const donor = await createDonor(church.setup, church.org.id, label);
        const source = await createHousehold(church.setup, church.org.id, `${label} source`, {
          primaryDonorId: donor.id,
          preferredStatementRecipientId: donor.id,
        });
        const target = await createHousehold(church.setup, church.org.id, `${label} target`);
        const membership = await openMembership(
          church.setup,
          church.org.id,
          source.id,
          donor.id,
        );
        return { donor, source, target, membership };
      }
      const moveFirst = await seededMembership("MoveFirst");
      const endFirst = await seededMembership("EndFirst");
      const { clientA, clientB } = await twoSessions();

      const moveThenEnd = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.treasurer, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: moveFirst.membership.id,
              toHouseholdId: moveFirst.target.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.admin, () =>
            endGivingHouseholdMembership(church.org.id, {
              membershipId: moveFirst.membership.id,
              endDate: MOVE_DAY,
              expectedUpdatedAt: moveFirst.membership.updatedAt.toISOString(),
              now: NOW,
            }),
          ),
      );
      expect(moveThenEnd[0].status).toBe("fulfilled");
      expect(moveThenEnd[1].status).toBe("rejected");
      const movedSource = await church.setup.household.findUniqueOrThrow({
        where: { id: moveFirst.source.id },
      });
      expect(movedSource.primaryDonorId).toBeNull();
      expect(movedSource.preferredStatementRecipientId).toBeNull();
      expect(
        await church.setup.householdMembership.count({
          where: { donorId: moveFirst.donor.id, endDate: null, householdId: moveFirst.target.id },
        }),
      ).toBe(1);

      const endThenMove = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.admin, () =>
            endGivingHouseholdMembership(church.org.id, {
              membershipId: endFirst.membership.id,
              endDate: MOVE_DAY,
              expectedUpdatedAt: endFirst.membership.updatedAt.toISOString(),
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.treasurer, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: endFirst.membership.id,
              toHouseholdId: endFirst.target.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
      );
      expect(endThenMove[0].status).toBe("fulfilled");
      expect(endThenMove[1].status).toBe("rejected");
      const ended = await church.setup.householdMembership.findUniqueOrThrow({
        where: { id: endFirst.membership.id },
      });
      expect(dateOnly(ended.endDate)).toBe(MOVE_DAY);
      expect(
        await church.setup.householdMembership.count({
          where: { householdId: endFirst.target.id },
        }),
      ).toBe(0);
      const endedSource = await church.setup.household.findUniqueOrThrow({
        where: { id: endFirst.source.id },
      });
      expect(endedSource.primaryDonorId).toBeNull();
      expect(endedSource.preferredStatementRecipientId).toBeNull();
      expect(await auditActions(church.setup, church.org.id)).toEqual([
        "GIVING_HOUSEHOLD_MEMBER_MOVED",
        "GIVING_HOUSEHOLD_MEMBER_ENDED",
      ]);
    });

    it("clears ineligible contacts for settings-then-move and move-then-settings", async () => {
      const church = await seedChurch("settings");
      const donor = await createDonor(church.setup, church.org.id, "Casey");
      const other = await createDonor(church.setup, church.org.id, "Drew");
      const source = await createHousehold(church.setup, church.org.id, "Source");
      const target = await createHousehold(church.setup, church.org.id, "Target");
      await openMembership(church.setup, church.org.id, source.id, donor.id);
      await openMembership(church.setup, church.org.id, source.id, other.id);
      const membership = await church.setup.householdMembership.findFirstOrThrow({
        where: { organizationId: church.org.id, donorId: donor.id, endDate: null },
      });
      const { clientA, clientB } = await twoSessions();

      const settingsThenMove = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.treasurer, () =>
            saveGivingHousehold(
              church.org.id,
              source.id,
              householdInput("Source", {
                primaryDonorId: donor.id,
                preferredStatementRecipientId: donor.id,
              }),
              source.updatedAt.toISOString(),
            ),
          ),
        () =>
          asActor(clientB, church.admin, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: membership.id,
              toHouseholdId: target.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
      );
      expect(settingsThenMove.every((result) => result.status === "fulfilled")).toBe(true);
      const afterFirst = await church.setup.household.findUniqueOrThrow({
        where: { id: source.id },
      });
      expect(afterFirst.primaryDonorId).not.toBe(donor.id);
      expect(afterFirst.preferredStatementRecipientId).not.toBe(donor.id);

      const donor2 = await createDonor(church.setup, church.org.id, "Quinn");
      const secondSource = await createHousehold(
        church.setup,
        church.org.id,
        "Source 2",
        { primaryDonorId: donor2.id, preferredStatementRecipientId: donor2.id },
      );
      const secondTarget = await createHousehold(church.setup, church.org.id, "Target 2");
      const membership2 = await openMembership(
        church.setup,
        church.org.id,
        secondSource.id,
        donor2.id,
      );

      const moveThenSettings = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.admin, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: membership2.id,
              toHouseholdId: secondTarget.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.treasurer, () =>
            saveGivingHousehold(
              church.org.id,
              secondSource.id,
              householdInput("Source 2", {
                primaryDonorId: donor2.id,
                preferredStatementRecipientId: donor2.id,
              }),
              secondSource.updatedAt.toISOString(),
            ),
          ),
      );
      expect(moveThenSettings[0].status).toBe("fulfilled");
      expect(moveThenSettings[1].status).toBe("rejected");
      const afterSecond = await church.setup.household.findUniqueOrThrow({
        where: { id: secondSource.id },
      });
      expect(afterSecond.primaryDonorId).toBeNull();
      expect(afterSecond.preferredStatementRecipientId).toBeNull();
      expect(await auditActions(church.setup, church.org.id)).toEqual([
        "GIVING_HOUSEHOLD_UPDATED",
        "GIVING_HOUSEHOLD_MEMBER_MOVED",
        "GIVING_HOUSEHOLD_MEMBER_MOVED",
      ]);
    });

    it("does not let a DATA_ENTRY basic save restore contacts cleared by move or end", async () => {
      const church = await seedChurch("data-entry-race");
      async function seeded(label: string) {
        const donor = await createDonor(church.setup, church.org.id, label);
        const source = await createHousehold(church.setup, church.org.id, `${label} source`, {
          primaryDonorId: donor.id,
          preferredStatementRecipientId: donor.id,
        });
        const target = await createHousehold(church.setup, church.org.id, `${label} target`);
        const membership = await openMembership(
          church.setup,
          church.org.id,
          source.id,
          donor.id,
        );
        return { donor, source, target, membership };
      }
      const saveFirst = await seeded("SaveFirst");
      const moveFirst = await seeded("MoveFirst");
      const endFirst = await seeded("EndFirst");
      const { clientA, clientB } = await twoSessions();

      const basicThenMove = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.dataEntry, () =>
            saveGivingHousehold(
              church.org.id,
              saveFirst.source.id,
              householdInput(`${saveFirst.source.displayName}`, { city: "Memphis" }),
              saveFirst.source.updatedAt.toISOString(),
            ),
          ),
        () =>
          asActor(clientB, church.treasurer, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: saveFirst.membership.id,
              toHouseholdId: saveFirst.target.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
      );
      expect(basicThenMove.every((result) => result.status === "fulfilled")).toBe(true);

      const moveThenBasic = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.treasurer, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: moveFirst.membership.id,
              toHouseholdId: moveFirst.target.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.dataEntry, () =>
            saveGivingHousehold(
              church.org.id,
              moveFirst.source.id,
              householdInput(moveFirst.source.displayName, { city: "Knoxville" }),
              moveFirst.source.updatedAt.toISOString(),
            ),
          ),
      );
      expect(moveThenBasic[0].status).toBe("fulfilled");
      expect(
        moveThenBasic[1].status === "fulfilled" ||
          settledMessages(moveThenBasic).join(" ").match(/updated by someone else/i),
      ).toBeTruthy();

      const endThenBasic = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.admin, () =>
            endGivingHouseholdMembership(church.org.id, {
              membershipId: endFirst.membership.id,
              endDate: MOVE_DAY,
              expectedUpdatedAt: endFirst.membership.updatedAt.toISOString(),
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.dataEntry, () =>
            saveGivingHousehold(
              church.org.id,
              endFirst.source.id,
              householdInput(endFirst.source.displayName, { city: "Chattanooga" }),
              endFirst.source.updatedAt.toISOString(),
            ),
          ),
      );
      expect(endThenBasic[0].status).toBe("fulfilled");

      for (const row of [saveFirst, moveFirst, endFirst]) {
        const household = await church.setup.household.findUniqueOrThrow({
          where: { id: row.source.id },
        });
        expect(household.primaryDonorId).toBeNull();
        expect(household.preferredStatementRecipientId).toBeNull();
      }
      expect(
        (await auditActions(church.setup, church.org.id)).filter(
          (action) => action === "GIVING_HOUSEHOLD_MEMBER_MOVED",
        ),
      ).toHaveLength(2);
      expect(
        (await auditActions(church.setup, church.org.id)).filter(
          (action) => action === "GIVING_HOUSEHOLD_MEMBER_ENDED",
        ),
      ).toHaveLength(1);
    });

    it("forces same-millisecond settings writes to stay distinguishable and rejects stale expectedUpdatedAt", async () => {
      const church = await seedChurch("same-ms");
      const household = await createHousehold(church.setup, church.org.id, "Contacts");
      const { clientA } = await twoSessions();
      const auditsBefore = await auditActions(church.setup, church.org.id);

      await runWithGivingHouseholdSeams({ now: () => FROZEN_MS }, async () => {
        await asActor(clientA, church.treasurer, () =>
          saveGivingHousehold(
            church.org.id,
            household.id,
            householdInput("Contacts", { statementDeliveryMethod: "EMAIL" }),
            household.updatedAt.toISOString(),
          ),
        );
        const first = await church.setup.household.findUniqueOrThrow({
          where: { id: household.id },
        });
        await asActor(clientA, church.treasurer, () =>
          saveGivingHousehold(
            church.org.id,
            household.id,
            householdInput("Contacts", {
              statementDeliveryMethod: "EMAIL",
              city: "Nashville",
            }),
            first.updatedAt.toISOString(),
          ),
        );
        const second = await church.setup.household.findUniqueOrThrow({
          where: { id: household.id },
        });
        expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
        await expect(
          asActor(clientA, church.admin, () =>
            saveGivingHousehold(
              church.org.id,
              household.id,
              householdInput("Contacts", { city: "Saco" }),
              first.updatedAt.toISOString(),
            ),
          ),
        ).rejects.toThrow(/updated by someone else/i);
        expect(second.city).toBe("Nashville");
        expect(await auditActions(church.setup, church.org.id)).toEqual([
          ...auditsBefore,
          "GIVING_HOUSEHOLD_UPDATED",
          "GIVING_HOUSEHOLD_UPDATED",
        ]);
      });
    });

    it("serializes opposite-direction moves after observing household-then-donor lock wait", async () => {
      const church = await seedChurch("swap");
      const donorA = await createDonor(church.setup, church.org.id, "North");
      const donorB = await createDonor(church.setup, church.org.id, "South");
      const householdA = await createHousehold(church.setup, church.org.id, "House A");
      const householdB = await createHousehold(church.setup, church.org.id, "House B");
      const membershipA = await openMembership(
        church.setup,
        church.org.id,
        householdA.id,
        donorA.id,
      );
      const membershipB = await openMembership(
        church.setup,
        church.org.id,
        householdB.id,
        donorB.id,
      );
      const { clientA, clientB } = await twoSessions();

      const results = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.treasurer, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: membershipA.id,
              toHouseholdId: householdB.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.admin, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: membershipB.id,
              toHouseholdId: householdA.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
      );

      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      const openA = await church.setup.householdMembership.findFirstOrThrow({
        where: { donorId: donorA.id, endDate: null },
      });
      const openB = await church.setup.householdMembership.findFirstOrThrow({
        where: { donorId: donorB.id, endDate: null },
      });
      expect(openA.householdId).toBe(householdB.id);
      expect(openB.householdId).toBe(householdA.id);
      expect(await auditActions(church.setup, church.org.id)).toEqual([
        "GIVING_HOUSEHOLD_MEMBER_MOVED",
        "GIVING_HOUSEHOLD_MEMBER_MOVED",
      ]);
    });

    it("rejects link and move into a target deactivated under lock, and keeps history after the reverse order", async () => {
      const church = await seedChurch("deactivate");
      const donor = await createDonor(church.setup, church.org.id, "Jamie");
      const source = await createHousehold(church.setup, church.org.id, "Source");
      const target = await createHousehold(church.setup, church.org.id, "Target");
      expect(target.active).toBe(true);
      const membership = await openMembership(
        church.setup,
        church.org.id,
        source.id,
        donor.id,
      );
      const { clientA, clientB } = await twoSessions();

      const moveVsDeactivate = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.admin, () =>
            saveGivingHousehold(
              church.org.id,
              target.id,
              householdInput("Target", { active: false }),
              target.updatedAt.toISOString(),
            ),
          ),
        () =>
          asActor(clientB, church.treasurer, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: membership.id,
              toHouseholdId: target.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
      );
      expect(moveVsDeactivate[0].status).toBe("fulfilled");
      expect(settledMessages(moveVsDeactivate).join(" ")).toMatch(/active giving household/i);
      expect(
        await church.setup.householdMembership.count({
          where: { householdId: target.id },
        }),
      ).toBe(0);

      const unassigned = await createDonor(church.setup, church.org.id, "Lee");
      const stillInactive = await church.setup.household.findUniqueOrThrow({
        where: { id: target.id },
      });
      await asActor(clientA, church.admin, () =>
        saveGivingHousehold(
          church.org.id,
          target.id,
          householdInput("Target", { active: true }),
          stillInactive.updatedAt.toISOString(),
        ),
      );
      const reactivated = await church.setup.household.findUniqueOrThrow({
        where: { id: target.id },
      });
      expect(reactivated.active).toBe(true);

      const linkVsDeactivate = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.admin, () =>
            saveGivingHousehold(
              church.org.id,
              target.id,
              householdInput("Target", { active: false }),
              reactivated.updatedAt.toISOString(),
            ),
          ),
        () =>
          asActor(clientB, church.treasurer, () =>
            linkGivingHouseholdDonor(church.org.id, {
              householdId: target.id,
              donorId: unassigned.id,
              startDate: MOVE_DAY,
              now: NOW,
            }),
          ),
      );
      expect(linkVsDeactivate[0].status).toBe("fulfilled");
      expect(settledMessages(linkVsDeactivate).join(" ")).toMatch(/active giving household/i);
      expect(
        await church.setup.householdMembership.count({
          where: { householdId: target.id },
        }),
      ).toBe(0);

      const reverseDonor = await createDonor(church.setup, church.org.id, "Remy");
      const reverseSource = await createHousehold(church.setup, church.org.id, "Reverse source");
      const reverseTarget = await createHousehold(church.setup, church.org.id, "Reverse target");
      const reverseMembership = await openMembership(
        church.setup,
        church.org.id,
        reverseSource.id,
        reverseDonor.id,
      );
      const moveThenDeactivate = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.treasurer, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: reverseMembership.id,
              toHouseholdId: reverseTarget.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.admin, () =>
            saveGivingHousehold(
              church.org.id,
              reverseTarget.id,
              householdInput("Reverse target", { active: false }),
              reverseTarget.updatedAt.toISOString(),
            ),
          ),
      );
      expect(moveThenDeactivate.every((result) => result.status === "fulfilled")).toBe(true);
      expect(
        await church.setup.householdMembership.count({
          where: { householdId: reverseTarget.id, donorId: reverseDonor.id, endDate: null },
        }),
      ).toBe(1);
      expect(
        (await church.setup.household.findUniqueOrThrow({ where: { id: reverseTarget.id } }))
          .active,
      ).toBe(false);
    });

    it("rejects overlapping backdated links under donor-lock contention and allows adjacent history", async () => {
      const church = await seedChurch("intervals");
      const donor = await createDonor(church.setup, church.org.id, "Harper");
      const closedHome = await createHousehold(church.setup, church.org.id, "Closed");
      const adjacentHome = await createHousehold(church.setup, church.org.id, "Adjacent");
      const overlapHome = await createHousehold(church.setup, church.org.id, "Overlap");
      await church.setup.householdMembership.create({
        data: {
          organizationId: church.org.id,
          householdId: closedHome.id,
          donorId: donor.id,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-06-30T00:00:00.000Z"),
        },
      });
      const { clientA, clientB } = await twoSessions();

      const adjacentThenOverlap = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.treasurer, () =>
            linkGivingHouseholdDonor(church.org.id, {
              householdId: adjacentHome.id,
              donorId: donor.id,
              startDate: "2026-07-01",
              confirmBackdate: true,
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.admin, () =>
            linkGivingHouseholdDonor(church.org.id, {
              householdId: overlapHome.id,
              donorId: donor.id,
              startDate: "2026-06-15",
              confirmBackdate: true,
              now: NOW,
            }),
          ),
      );
      expect(adjacentThenOverlap[0].status).toBe("fulfilled");
      expect(settledMessages(adjacentThenOverlap).join(" ")).toMatch(/overlaps those dates/i);

      const donor2 = await createDonor(church.setup, church.org.id, "Jordan");
      const closed2 = await createHousehold(church.setup, church.org.id, "Closed 2");
      const overlap2 = await createHousehold(church.setup, church.org.id, "Overlap 2");
      const adjacent2 = await createHousehold(church.setup, church.org.id, "Adjacent 2");
      await church.setup.householdMembership.create({
        data: {
          organizationId: church.org.id,
          householdId: closed2.id,
          donorId: donor2.id,
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2026-06-30T00:00:00.000Z"),
        },
      });
      const overlapThenAdjacent = await runWithObservedLockContention(
        church.setup,
        () =>
          asActor(clientA, church.admin, () =>
            linkGivingHouseholdDonor(church.org.id, {
              householdId: overlap2.id,
              donorId: donor2.id,
              startDate: "2026-06-15",
              confirmBackdate: true,
              now: NOW,
            }),
          ),
        () =>
          asActor(clientB, church.treasurer, () =>
            linkGivingHouseholdDonor(church.org.id, {
              householdId: adjacent2.id,
              donorId: donor2.id,
              startDate: "2026-07-01",
              confirmBackdate: true,
              now: NOW,
            }),
          ),
      );
      expect(overlapThenAdjacent[0].status).toBe("rejected");
      expect(overlapThenAdjacent[1].status).toBe("fulfilled");
      expect(
        await church.setup.householdMembership.count({
          where: { organizationId: church.org.id, endDate: null },
        }),
      ).toBe(2);
      expect(await auditActions(church.setup, church.org.id)).toEqual([
        "GIVING_HOUSEHOLD_MEMBER_LINKED",
        "GIVING_HOUSEHOLD_MEMBER_LINKED",
      ]);
    });

    it("rolls back link, move, end, and settings when audit fails, then accepts a clean retry", async () => {
      const church = await seedChurch("audit");
      const donor = await createDonor(church.setup, church.org.id, "Reese");
      const source = await createHousehold(church.setup, church.org.id, "Source", {
        primaryDonorId: donor.id,
        preferredStatementRecipientId: donor.id,
      });
      const target = await createHousehold(church.setup, church.org.id, "Target");
      const extra = await createHousehold(church.setup, church.org.id, "Extra");
      const membership = await openMembership(
        church.setup,
        church.org.id,
        source.id,
        donor.id,
      );
      const unassigned = await createDonor(church.setup, church.org.id, "Sam");
      const { clientA } = await twoSessions();

      async function expectUnchanged(work: () => Promise<unknown>) {
        const before = await snapshotOrg(church.setup, church.org.id);
        await expect(work()).rejects.toThrow(/injected giving-household audit failure/i);
        expect(await snapshotOrg(church.setup, church.org.id)).toEqual(before);
      }

      await expectUnchanged(() =>
        runWithGivingHouseholdSeams({ failAudit: true }, () =>
          asActor(clientA, church.treasurer, () =>
            linkGivingHouseholdDonor(church.org.id, {
              householdId: extra.id,
              donorId: unassigned.id,
              startDate: MOVE_DAY,
              now: NOW,
            }),
          ),
        ),
      );
      await asActor(clientA, church.treasurer, () =>
        linkGivingHouseholdDonor(church.org.id, {
          householdId: extra.id,
          donorId: unassigned.id,
          startDate: MOVE_DAY,
          now: NOW,
        }),
      );

      await expectUnchanged(() =>
        runWithGivingHouseholdSeams({ failAudit: true }, () =>
          asActor(clientA, church.treasurer, () =>
            moveGivingHouseholdDonor(church.org.id, {
              currentMembershipId: membership.id,
              toHouseholdId: target.id,
              effectiveDate: MOVE_DAY,
              now: NOW,
            }),
          ),
        ),
      );
      await asActor(clientA, church.treasurer, () =>
        moveGivingHouseholdDonor(church.org.id, {
          currentMembershipId: membership.id,
          toHouseholdId: target.id,
          effectiveDate: MOVE_DAY,
          now: NOW,
        }),
      );

      const opened = await church.setup.householdMembership.findFirstOrThrow({
        where: { householdId: extra.id, donorId: unassigned.id, endDate: null },
      });
      await expectUnchanged(() =>
        runWithGivingHouseholdSeams({ failAudit: true }, () =>
          asActor(clientA, church.admin, () =>
            endGivingHouseholdMembership(church.org.id, {
              membershipId: opened.id,
              endDate: MOVE_DAY,
              expectedUpdatedAt: opened.updatedAt.toISOString(),
              now: NOW,
            }),
          ),
        ),
      );
      const openedFresh = await church.setup.householdMembership.findUniqueOrThrow({
        where: { id: opened.id },
      });
      await asActor(clientA, church.admin, () =>
        endGivingHouseholdMembership(church.org.id, {
          membershipId: opened.id,
          endDate: MOVE_DAY,
          expectedUpdatedAt: openedFresh.updatedAt.toISOString(),
          now: NOW,
        }),
      );

      const extraFresh = await church.setup.household.findUniqueOrThrow({
        where: { id: extra.id },
      });
      await expectUnchanged(() =>
        runWithGivingHouseholdSeams({ failAudit: true }, () =>
          asActor(clientA, church.treasurer, () =>
            saveGivingHousehold(
              church.org.id,
              extra.id,
              householdInput("Extra", { city: "Franklin" }),
              extraFresh.updatedAt.toISOString(),
            ),
          ),
        ),
      );
      const extraRetry = await church.setup.household.findUniqueOrThrow({
        where: { id: extra.id },
      });
      await asActor(clientA, church.treasurer, () =>
        saveGivingHousehold(
          church.org.id,
          extra.id,
          householdInput("Extra", { city: "Franklin" }),
          extraRetry.updatedAt.toISOString(),
        ),
      );
      expect(
        (await church.setup.household.findUniqueOrThrow({ where: { id: extra.id } })).city,
      ).toBe("Franklin");
    });

    it("blocks cross-tenant and unauthorized writers without leaking history or audits", async () => {
      const churchA = await seedChurch("iso-a");
      const churchB = await seedChurch("iso-b");
      const donorA = await createDonor(churchA.setup, churchA.org.id, "Local");
      const donorB = await createDonor(churchB.setup, churchB.org.id, "Away");
      const householdA = await createHousehold(churchA.setup, churchA.org.id, "Alpha");
      const householdB = await createHousehold(churchB.setup, churchB.org.id, "Beta");
      const { clientA, clientB } = await twoSessions();
      const auditsBefore = await churchA.setup.auditEvent.count({
        where: { organizationId: churchA.org.id },
      });

      await expect(
        asActor(clientB, churchB.treasurer, () =>
          linkGivingHouseholdDonor(churchA.org.id, {
            householdId: householdA.id,
            donorId: donorA.id,
            startDate: MOVE_DAY,
            now: NOW,
          }),
        ),
      ).rejects.toThrow(/church selection changed/i);

      await expect(
        asActor(clientA, churchA.treasurer, () =>
          linkGivingHouseholdDonor(churchA.org.id, {
            householdId: householdA.id,
            donorId: donorB.id,
            startDate: MOVE_DAY,
            now: NOW,
          }),
        ),
      ).rejects.toThrow(/donor not found/i);

      await expect(
        asActor(clientB, churchB.treasurer, () =>
          linkGivingHouseholdDonor(churchB.org.id, {
            householdId: householdA.id,
            donorId: donorB.id,
            startDate: MOVE_DAY,
            now: NOW,
          }),
        ),
      ).rejects.toThrow(/giving household not found/i);

      await expect(
        asActor(clientA, churchA.reportViewer, () =>
          saveGivingHousehold(churchA.org.id, null, householdInput("Unauthorized")),
        ),
      ).rejects.toThrow(/do not have permission/i);

      await expect(
        asActor(clientA, churchA.donorUser, () =>
          linkGivingHouseholdDonor(churchA.org.id, {
            householdId: householdA.id,
            donorId: donorA.id,
            startDate: MOVE_DAY,
            now: NOW,
          }),
        ),
      ).rejects.toThrow(/do not have permission/i);

      await expect(
        asActor(clientA, { clerkUserId: "", clerkOrgId: null }, () =>
          linkGivingHouseholdDonor(churchA.org.id, {
            householdId: householdA.id,
            donorId: donorA.id,
            startDate: MOVE_DAY,
            now: NOW,
          }),
        ),
      ).rejects.toThrow("Sign in to access giving households.");

      expect(
        await churchA.setup.householdMembership.count({
          where: { organizationId: churchA.org.id },
        }),
      ).toBe(0);
      expect(
        await churchB.setup.householdMembership.count({
          where: { organizationId: churchB.org.id },
        }),
      ).toBe(0);
      expect(
        await churchA.setup.auditEvent.count({
          where: { organizationId: churchA.org.id },
        }),
      ).toBe(auditsBefore);
      expect(
        await churchA.setup.household.count({
          where: { organizationId: churchA.org.id, id: householdB.id },
        }),
      ).toBe(0);
    });

    it("attributes D-1 gifts to the old household and D gifts to the new household after a move", async () => {
      const church = await seedChurch("gifts");
      const donor = await createDonor(church.setup, church.org.id, "Taylor");
      const source = await createHousehold(church.setup, church.org.id, "Old House");
      const target = await createHousehold(church.setup, church.org.id, "New House");
      const membership = await openMembership(
        church.setup,
        church.org.id,
        source.id,
        donor.id,
      );
      const { clientA } = await twoSessions();
      await asActor(clientA, church.treasurer, () =>
        moveGivingHouseholdDonor(church.org.id, {
          currentMembershipId: membership.id,
          toHouseholdId: target.id,
          effectiveDate: MOVE_DAY,
          now: NOW,
        }),
      );

      const giftBefore = await church.setup.donation.create({
        data: {
          organizationId: church.org.id,
          donorId: donor.id,
          offeringDate: new Date(`${CLOSE_DAY}T00:00:00.000Z`),
          receivedDate: new Date(`${CLOSE_DAY}T00:00:00.000Z`),
          paymentMethod: PaymentMethod.CASH,
          totalAmount: "25.00",
          deductibleAmount: "25.00",
        },
      });
      const giftOnMove = await church.setup.donation.create({
        data: {
          organizationId: church.org.id,
          donorId: donor.id,
          offeringDate: new Date(`${MOVE_DAY}T00:00:00.000Z`),
          receivedDate: new Date(`${MOVE_DAY}T00:00:00.000Z`),
          paymentMethod: PaymentMethod.CASH,
          totalAmount: "40.00",
          deductibleAmount: "40.00",
        },
      });
      const memberships = await church.setup.householdMembership.findMany({
        where: { organizationId: church.org.id, donorId: donor.id },
        select: { householdId: true, startDate: true, endDate: true },
      });
      expect(
        attributeGiftToHousehold(
          {
            donorId: donor.id,
            anonymous: false,
            offeringDate: giftBefore.offeringDate,
          },
          memberships,
        ),
      ).toEqual({ bucket: "household", householdId: source.id });
      expect(
        attributeGiftToHousehold(
          {
            donorId: donor.id,
            anonymous: false,
            offeringDate: giftOnMove.offeringDate,
          },
          memberships,
        ),
      ).toEqual({ bucket: "household", householdId: target.id });
    });
  },
);
