import { prisma } from "@/lib/db/prisma";

export type MemberApprovedPickupWriteInput = {
  organizationId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  relationship: string;
  isActive?: boolean;
  deactivatedAt?: Date | null;
  deactivatedByUserId?: string | null;
};

const pickupSelect = {
  id: true,
  firstName: true,
  lastName: true,
  relationship: true,
  isActive: true,
} as const;

export async function findMemberIdInOrganization(
  organizationId: string,
  memberId: string,
) {
  return prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true },
  });
}

export async function findApprovedPickupsByMemberId(
  organizationId: string,
  memberId: string,
) {
  return prisma.memberApprovedPickup.findMany({
    where: { organizationId, memberId },
    select: pickupSelect,
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function findApprovedPickupById(
  organizationId: string,
  memberId: string,
  pickupId: string,
) {
  return prisma.memberApprovedPickup.findFirst({
    where: { id: pickupId, organizationId, memberId },
    select: {
      ...pickupSelect,
      organizationId: true,
      memberId: true,
    },
  });
}

export async function createApprovedPickup(data: MemberApprovedPickupWriteInput) {
  return prisma.memberApprovedPickup.create({
    data: {
      organizationId: data.organizationId,
      memberId: data.memberId,
      firstName: data.firstName,
      lastName: data.lastName,
      relationship: data.relationship,
      isActive: data.isActive ?? true,
    },
    select: pickupSelect,
  });
}

export async function updateApprovedPickup(
  organizationId: string,
  memberId: string,
  pickupId: string,
  data: Partial<
    Pick<
      MemberApprovedPickupWriteInput,
      | "firstName"
      | "lastName"
      | "relationship"
      | "isActive"
      | "deactivatedAt"
      | "deactivatedByUserId"
    >
  >,
) {
  const result = await prisma.memberApprovedPickup.updateMany({
    where: { id: pickupId, organizationId, memberId },
    data,
  });

  if (result.count === 0) {
    return null;
  }

  return prisma.memberApprovedPickup.findFirst({
    where: { id: pickupId, organizationId, memberId },
    select: pickupSelect,
  });
}

export async function deleteApprovedPickup(
  organizationId: string,
  memberId: string,
  pickupId: string,
) {
  const result = await prisma.memberApprovedPickup.deleteMany({
    where: { id: pickupId, organizationId, memberId },
  });

  return result.count > 0;
}
