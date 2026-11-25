import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db/prisma";

export async function getOrCreateUserAccount() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const existing = await prisma.userAccount.findUnique({
    where: { clerkUserId: userId },
  });

  if (existing) {
    return existing;
  }

  const clerkUser = await currentUser();
  const primaryEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) {
    return null;
  }

  const joinedName = [clerkUser?.firstName, clerkUser?.lastName]
    .filter(Boolean)
    .join(" ");
  const displayName = clerkUser?.fullName
    ? clerkUser.fullName
    : joinedName.length > 0
      ? joinedName
      : null;

  try {
    return await prisma.userAccount.create({
      data: {
        clerkUserId: userId,
        primaryEmail,
        displayName,
      },
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return prisma.userAccount.findUnique({
        where: { clerkUserId: userId },
      });
    }
    throw error;
  }
}
