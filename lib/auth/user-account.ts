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

  return prisma.userAccount.create({
    data: {
      clerkUserId: userId,
      primaryEmail,
      displayName,
    },
  });
}
