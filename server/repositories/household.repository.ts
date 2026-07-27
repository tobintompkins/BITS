import type { HouseholdRelationship, Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type HouseholdWriteInput = {
  organizationId: string;
  householdName: string;
  primaryContactId?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export type HouseholdListFilters = {
  organizationId: string;
  search?: string;
};

const memberSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  email: true,
  phone: true,
  membershipStatus: true,
} satisfies Prisma.MemberSelect;

const householdDetailInclude = {
  primaryContact: {
    select: memberSummarySelect,
  },
  memberLinks: {
    include: {
      member: {
        select: memberSummarySelect,
      },
    },
    orderBy: [{ isPrimaryContact: "desc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.MemberHouseholdUnitInclude;

const householdListInclude = {
  primaryContact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
    },
  },
  _count: {
    select: { memberLinks: true },
  },
} satisfies Prisma.MemberHouseholdUnitInclude;

export async function findHouseholds(filters: HouseholdListFilters) {
  const where: Prisma.MemberHouseholdUnitWhereInput = {
    organizationId: filters.organizationId,
    ...(filters.search
      ? {
          OR: [
            { householdName: { contains: filters.search, mode: "insensitive" } },
            { city: { contains: filters.search, mode: "insensitive" } },
            { state: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  return prisma.memberHouseholdUnit.findMany({
    where,
    include: householdListInclude,
    orderBy: { householdName: "asc" },
  });
}

export async function findHouseholdById(organizationId: string, id: string) {
  return prisma.memberHouseholdUnit.findFirst({
    where: { id, organizationId },
    include: householdDetailInclude,
  });
}

export async function createHousehold(data: HouseholdWriteInput) {
  return prisma.memberHouseholdUnit.create({ data });
}

export async function updateHousehold(
  id: string,
  organizationId: string,
  data: Omit<HouseholdWriteInput, "organizationId">,
) {
  const result = await prisma.memberHouseholdUnit.updateMany({
    where: { id, organizationId },
    data,
  });

  if (result.count === 0) {
    throw new Error("Household not found.");
  }

  return findHouseholdById(organizationId, id);
}

export async function deleteHousehold(id: string, organizationId: string) {
  const result = await prisma.memberHouseholdUnit.deleteMany({
    where: { id, organizationId },
  });

  if (result.count === 0) {
    throw new Error("Household not found.");
  }
}

export async function findMemberByIdForHousehold(
  organizationId: string,
  memberId: string,
) {
  return prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true },
  });
}

export async function findMemberHouseholdLink(
  organizationId: string,
  memberId: string,
  householdId: string,
) {
  return prisma.memberHousehold.findFirst({
    where: { organizationId, memberId, householdId },
    include: {
      member: { select: memberSummarySelect },
      household: { select: { id: true, householdName: true, primaryContactId: true } },
    },
  });
}

export async function clearOtherMemberHouseholdLinks(
  organizationId: string,
  memberId: string,
  householdId: string,
) {
  return prisma.memberHousehold.deleteMany({
    where: {
      organizationId,
      memberId,
      householdId: { not: householdId },
    },
  });
}

export async function linkMemberToHouseholdRecord(input: {
  organizationId: string;
  memberId: string;
  householdId: string;
  relationshipToHousehold: HouseholdRelationship;
}) {
  return prisma.memberHousehold.upsert({
    where: {
      memberId_householdId: {
        memberId: input.memberId,
        householdId: input.householdId,
      },
    },
    update: {
      relationshipToHousehold: input.relationshipToHousehold,
    },
    create: {
      organizationId: input.organizationId,
      memberId: input.memberId,
      householdId: input.householdId,
      relationshipToHousehold: input.relationshipToHousehold,
    },
  });
}

export async function removeMemberFromHouseholdRecord(
  organizationId: string,
  memberId: string,
  householdId: string,
) {
  const result = await prisma.memberHousehold.deleteMany({
    where: { organizationId, memberId, householdId },
  });

  if (result.count === 0) {
    throw new Error("Household link not found.");
  }
}

export async function updateMemberHouseholdRelationshipRecord(input: {
  organizationId: string;
  memberId: string;
  householdId: string;
  relationshipToHousehold: HouseholdRelationship;
}) {
  const result = await prisma.memberHousehold.updateMany({
    where: {
      organizationId: input.organizationId,
      memberId: input.memberId,
      householdId: input.householdId,
    },
    data: { relationshipToHousehold: input.relationshipToHousehold },
  });

  if (result.count === 0) {
    throw new Error("Household link not found.");
  }

  return findMemberHouseholdLink(
    input.organizationId,
    input.memberId,
    input.householdId,
  );
}

export async function setHouseholdPrimaryContactRecord(
  organizationId: string,
  householdId: string,
  memberId: string,
) {
  await prisma.$transaction([
    prisma.memberHousehold.updateMany({
      where: { organizationId, householdId },
      data: { isPrimaryContact: false },
    }),
    prisma.memberHousehold.updateMany({
      where: { organizationId, householdId, memberId },
      data: { isPrimaryContact: true },
    }),
    prisma.memberHouseholdUnit.updateMany({
      where: { id: householdId, organizationId },
      data: { primaryContactId: memberId },
    }),
  ]);

  return findHouseholdById(organizationId, householdId);
}

export async function clearPrimaryContactIfMember(
  organizationId: string,
  householdId: string,
  memberId: string,
) {
  await prisma.memberHouseholdUnit.updateMany({
    where: { id: householdId, organizationId, primaryContactId: memberId },
    data: { primaryContactId: null },
  });
}
