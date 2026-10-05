import type { Prisma, StatementAccessAction } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/db/prisma";
import { STATEMENT_ACCESS_PICKER_SIZE } from "@/lib/validation/statement-access-report";

export type StatementAccessQuery = {
  organizationId: string;
  startUtc: Date;
  endExclusiveUtc: Date;
  statementId?: string | null;
  donorId?: string | null;
  householdId?: string | null;
  actorUserAccountId?: string | null;
  action?: StatementAccessAction | null;
};

function eventWhere(input: StatementAccessQuery): Prisma.StatementAccessEventWhereInput {
  return {
    organizationId: input.organizationId,
    occurredAt: { gte: input.startUtc, lt: input.endExclusiveUtc },
    ...(input.statementId ? { statementId: input.statementId } : {}),
    ...(input.actorUserAccountId
      ? { userAccountId: input.actorUserAccountId }
      : {}),
    ...(input.action ? { action: input.action } : {}),
    ...(input.donorId || input.householdId
      ? {
          statement: {
            organizationId: input.organizationId,
            ...(input.donorId ? { donorId: input.donorId } : {}),
            ...(input.householdId ? { householdId: input.householdId } : {}),
          },
        }
      : {}),
  };
}

const eventSelect = {
  id: true,
  occurredAt: true,
  action: true,
  statementId: true,
  userAccount: {
    select: { id: true, displayName: true, active: true },
  },
  statement: {
    select: {
      id: true,
      statementIdentifier: true,
      statementType: true,
      status: true,
      donorId: true,
      householdId: true,
      donor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          active: true,
          organizationId: true,
        },
      },
      household: {
        select: {
          id: true,
          displayName: true,
          active: true,
          organizationId: true,
        },
      },
    },
  },
} satisfies Prisma.StatementAccessEventSelect;

export async function countStatementAccessEvents(
  input: StatementAccessQuery,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.statementAccessEvent.count({ where: eventWhere(input) });
}

export async function listStatementAccessEvents(
  input: StatementAccessQuery,
  take: number,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.statementAccessEvent.findMany({
    where: eventWhere(input),
    select: eventSelect,
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take,
  });
}

export async function findStatementAccessFilterTargets(
  input: {
    organizationId: string;
    statementId: string | null;
    donorId: string | null;
    householdId: string | null;
    actorUserAccountId: string | null;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const [statement, donor, household, actorMembership, actorEvent] =
    await Promise.all([
      input.statementId
        ? tx.contributionStatement.findFirst({
            where: { id: input.statementId, organizationId: input.organizationId },
            select: { id: true },
          })
        : true,
      input.donorId
        ? tx.donor.findFirst({
            where: { id: input.donorId, organizationId: input.organizationId },
            select: { id: true },
          })
        : true,
      input.householdId
        ? tx.household.findFirst({
            where: {
              id: input.householdId,
              organizationId: input.organizationId,
            },
            select: { id: true },
          })
        : true,
      input.actorUserAccountId
        ? tx.organizationMembership.findFirst({
            where: {
              userAccountId: input.actorUserAccountId,
              organizationId: input.organizationId,
            },
            select: { id: true },
          })
        : true,
      input.actorUserAccountId
        ? tx.statementAccessEvent.findFirst({
            where: {
              userAccountId: input.actorUserAccountId,
              organizationId: input.organizationId,
            },
            select: { id: true },
          })
        : true,
    ]);
  return {
    statement: Boolean(statement),
    donor: Boolean(donor),
    household: Boolean(household),
    actor: Boolean(actorMembership || actorEvent),
  };
}

export async function listStatementAccessPickers(
  input: {
    organizationId: string;
    statementQuery: string;
    donorQuery: string;
    householdQuery: string;
    actorQuery: string;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const [statements, donors, households, actors] = await Promise.all([
    tx.contributionStatement.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.statementQuery
          ? {
              statementIdentifier: {
                contains: input.statementQuery,
                mode: "insensitive",
              },
            }
          : {}),
      },
      select: {
        id: true,
        statementIdentifier: true,
        statementType: true,
        status: true,
      },
      orderBy: [{ generatedAt: "desc" }, { id: "asc" }],
      take: STATEMENT_ACCESS_PICKER_SIZE,
    }),
    tx.donor.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.donorQuery
          ? {
              OR: [
                { firstName: { contains: input.donorQuery, mode: "insensitive" } },
                { lastName: { contains: input.donorQuery, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: STATEMENT_ACCESS_PICKER_SIZE,
    }),
    tx.household.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.householdQuery
          ? {
              displayName: {
                contains: input.householdQuery,
                mode: "insensitive",
              },
            }
          : {}),
      },
      select: { id: true, displayName: true, active: true },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: STATEMENT_ACCESS_PICKER_SIZE,
    }),
    tx.userAccount.findMany({
      where: {
        memberships: { some: { organizationId: input.organizationId } },
        ...(input.actorQuery
          ? {
              displayName: {
                contains: input.actorQuery,
                mode: "insensitive",
              },
            }
          : {}),
      },
      select: { id: true, displayName: true, active: true },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: STATEMENT_ACCESS_PICKER_SIZE,
    }),
  ]);
  return { statements, donors, households, actors };
}
