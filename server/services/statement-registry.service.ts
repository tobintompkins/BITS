import {
  StatementStatus,
  StatementType,
} from "@/app/generated/prisma/client";
import { requireStatementViewAccess } from "@/lib/auth/giving-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { parseStatementRegistryQuery } from "@/lib/validation/statement-registry";
import { statementYearDateRange } from "@/lib/validation/statement-readiness";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export class StatementRegistryError extends Error {
  constructor(
    public readonly code: "SIGNED_OUT" | "FORBIDDEN" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "StatementRegistryError";
  }
}

function displayName(row: { firstName: string; lastName: string }) {
  return `${row.firstName} ${row.lastName}`.trim();
}

function generatorLabel(row: {
  displayName: string | null;
  primaryEmail: string;
}) {
  return row.displayName?.trim() || row.primaryEmail;
}

function matchesSearch(
  row: {
    statementIdentifier: string;
    recipientLabel: string;
  },
  query?: string,
) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    row.statementIdentifier.toLowerCase().includes(needle) ||
    row.recipientLabel.toLowerCase().includes(needle)
  );
}

function typeFromFilter(value: "all" | "individual" | "household") {
  if (value === "individual") return StatementType.INDIVIDUAL;
  if (value === "household") return StatementType.HOUSEHOLD;
  return null;
}

function statusFromFilter(value: "all" | "generated" | "published" | "voided") {
  if (value === "generated") return StatementStatus.GENERATED;
  if (value === "published") return StatementStatus.PUBLISHED;
  if (value === "voided") return StatementStatus.VOIDED;
  return null;
}

function yearWhere(organizationId: string, year: number) {
  const { start, end } = statementYearDateRange(year);
  return {
    organizationId,
    OR: [
      { taxYear: year },
      { taxYear: null, periodStart: { gte: start, lt: end } },
    ],
  };
}

async function requireRegistryContext() {
  const [actor, organization] = await Promise.all([
    getOrCreateUserAccount(),
    findPrimaryOrganization(),
  ]);
  if (!actor) {
    throw new StatementRegistryError("SIGNED_OUT", "You must be signed in.");
  }
  if (!organization) {
    throw new StatementRegistryError(
      "NOT_FOUND",
      "Church organization not found.",
    );
  }
  let access;
  try {
    access = await requireStatementViewAccess(organization.id);
  } catch {
    throw new StatementRegistryError(
      "FORBIDDEN",
      "You do not have permission to view contribution statements.",
    );
  }
  return { organization, access };
}

/**
 * Read-only registry of generated, published, and voided statements for
 * authorized staff. Does not mutate, publish, email, or expose private files.
 */
export async function getStatementRegistry(
  rawQuery: Record<string, string | string[] | undefined> = {},
  now = new Date(),
) {
  const { organization, access } = await requireRegistryContext();
  const query = parseStatementRegistryQuery(rawQuery, now);
  const type = typeFromFilter(query.type);
  const status = statusFromFilter(query.status);
  const scopedYear = yearWhere(organization.id, query.year);

  const [rows, statusGroups] = await Promise.all([
    prisma.contributionStatement.findMany({
      where: {
        ...scopedYear,
        ...(type ? { statementType: type } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        statementIdentifier: true,
        statementType: true,
        status: true,
        taxYear: true,
        periodStart: true,
        periodEnd: true,
        deductibleTotal: true,
        generatedAt: true,
        donorId: true,
        householdId: true,
        generatedBy: {
          select: { displayName: true, primaryEmail: true },
        },
        donor: {
          select: {
            id: true,
            organizationId: true,
            firstName: true,
            lastName: true,
          },
        },
        household: {
          select: {
            id: true,
            organizationId: true,
            displayName: true,
          },
        },
      },
    }),
    prisma.contributionStatement.groupBy({
      by: ["status"],
      where: scopedYear,
      _count: { _all: true },
    }),
  ]);

  const mapped = rows.flatMap((row) => {
    const individual =
      row.statementType === StatementType.INDIVIDUAL &&
      row.householdId == null &&
      row.donor &&
      row.donor.organizationId === organization.id &&
      row.donor.id === row.donorId;
    const household =
      row.statementType === StatementType.HOUSEHOLD &&
      row.donorId == null &&
      row.household &&
      row.household.organizationId === organization.id &&
      row.household.id === row.householdId;
    if (!individual && !household) return [];

    const recipientLabel = individual
      ? displayName(row.donor!)
      : row.household!.displayName;
    const recipientId = individual ? row.donor!.id : row.household!.id;

    return [
      {
        id: row.id,
        statementIdentifier: row.statementIdentifier,
        statementType: row.statementType,
        status: row.status,
        taxYear: row.taxYear,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        deductibleTotal: row.deductibleTotal.toString(),
        generatedAt: row.generatedAt,
        generatedByLabel: generatorLabel(row.generatedBy),
        recipientLabel,
        recipientId,
      },
    ];
  });

  const searched = mapped.filter((row) => matchesSearch(row, query.q));
  const pageCount = Math.max(1, Math.ceil(searched.length / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const statements = searched.slice(
    (page - 1) * query.pageSize,
    page * query.pageSize,
  );

  const counts = {
    generated: 0,
    published: 0,
    voided: 0,
  };
  for (const group of statusGroups) {
    if (group.status === StatementStatus.GENERATED) {
      counts.generated = group._count._all;
    }
    if (group.status === StatementStatus.PUBLISHED) {
      counts.published = group._count._all;
    }
    if (group.status === StatementStatus.VOIDED) {
      counts.voided = group._count._all;
    }
  }

  return {
    year: query.year,
    q: query.q ?? "",
    type: query.type,
    status: query.status,
    page,
    pageSize: query.pageSize,
    pageCount,
    totalCount: searched.length,
    organizationName: organization.displayName?.trim() || organization.name,
    canManageStatements: access.canManageStatements,
    counts,
    statements,
  };
}
