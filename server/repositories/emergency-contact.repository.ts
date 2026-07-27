import { prisma } from "@/lib/db/prisma";

export type EmergencyContactWriteInput = {
  memberId: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
};

export async function findEmergencyContactsByMemberId(
  organizationId: string,
  memberId: string,
) {
  return prisma.memberEmergencyContact.findMany({
    where: {
      memberId,
      member: { organizationId },
    },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  });
}

export async function findEmergencyContactById(
  organizationId: string,
  contactId: string,
) {
  return prisma.memberEmergencyContact.findFirst({
    where: {
      id: contactId,
      member: { organizationId },
    },
  });
}

export async function createEmergencyContact(data: EmergencyContactWriteInput) {
  return prisma.memberEmergencyContact.create({ data });
}

export async function updateEmergencyContact(
  contactId: string,
  memberId: string,
  data: Omit<EmergencyContactWriteInput, "memberId">,
) {
  const result = await prisma.memberEmergencyContact.updateMany({
    where: { id: contactId, memberId },
    data,
  });

  if (result.count === 0) {
    throw new Error("Emergency contact not found.");
  }

  return prisma.memberEmergencyContact.findFirstOrThrow({
    where: { id: contactId },
  });
}

export async function deleteEmergencyContact(contactId: string, memberId: string) {
  const result = await prisma.memberEmergencyContact.deleteMany({
    where: { id: contactId, memberId },
  });

  if (result.count === 0) {
    throw new Error("Emergency contact not found.");
  }
}

export async function clearPrimaryEmergencyContacts(memberId: string) {
  return prisma.memberEmergencyContact.updateMany({
    where: { memberId },
    data: { isPrimary: false },
  });
}

export async function setPrimaryEmergencyContact(contactId: string, memberId: string) {
  await prisma.$transaction([
    prisma.memberEmergencyContact.updateMany({
      where: { memberId },
      data: { isPrimary: false },
    }),
    prisma.memberEmergencyContact.updateMany({
      where: { id: contactId, memberId },
      data: { isPrimary: true },
    }),
  ]);

  return prisma.memberEmergencyContact.findFirstOrThrow({
    where: { id: contactId },
  });
}

export async function findMemberEmails(organizationId: string) {
  const members = await prisma.member.findMany({
    where: { organizationId, email: { not: null } },
    select: { email: true },
  });

  return new Set(
    members
      .map((member) => member.email?.toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
}

export async function updateMemberPhoto(
  memberId: string,
  organizationId: string,
  photo: { profilePhotoUrl: string | null; profilePhotoKey: string | null },
) {
  const result = await prisma.member.updateMany({
    where: { id: memberId, organizationId },
    data: photo,
  });

  if (result.count === 0) {
    throw new Error("Member not found.");
  }
}

export async function findMemberPhotoFields(
  organizationId: string,
  memberId: string,
) {
  return prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: {
      id: true,
      profilePhotoUrl: true,
      profilePhotoKey: true,
    },
  });
}
