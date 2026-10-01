import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

const listSelect = {
  id: true,
  name: true,
  code: true,
  description: true,
  defaultTaxDeductible: true,
  onlineGivingEnabled: true,
  displayOrder: true,
  active: true,
  updatedAt: true,
} as const;

export async function listOfferingTypes(input: {
  organizationId: string;
  query?: string;
  status?: string;
  skip: number;
  take: number;
}) {
  const q = input.query?.trim() ?? "";
  const where: Prisma.OfferingTypeWhereInput = {
    organizationId: input.organizationId,
    ...(input.status === "inactive"
      ? { active: false }
      : input.status === "all"
        ? {}
        : { active: true }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { code: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.offeringType.findMany({
      where,
      select: listSelect,
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      skip: input.skip,
      take: input.take,
    }),
    prisma.offeringType.count({ where }),
  ]);

  return { rows, total, where };
}

export async function findOfferingTypeInOrganization(
  organizationId: string,
  id: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.offeringType.findFirst({
    where: { id, organizationId },
  });
}

export async function findOfferingTypeByCode(
  organizationId: string,
  code: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.offeringType.findFirst({
    where: { organizationId, code },
    select: {
      id: true,
      name: true,
      code: true,
      active: true,
      onlineGivingEnabled: true,
    },
  });
}

export async function countOfferingTypeAllocations(
  organizationId: string,
  offeringTypeId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.donationAllocation.count({
    where: { organizationId, offeringTypeId },
  });
}
