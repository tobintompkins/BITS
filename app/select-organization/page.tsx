import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { prisma } from "@/lib/db/prisma";
import { isDatabaseUnavailableError } from "@/lib/db/database-unavailable";
import { ChurchSelection } from "@/components/auth/church-selection";

export default async function SelectOrganizationPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  let churches: { name: string; clerkId: string }[] = [];
  let unavailable = false;
  try {
    const account = await prisma.userAccount.findUnique({ where: { clerkUserId: userId } });
    const memberships = account?.active ? await prisma.organizationMembership.findMany({
      where: { userAccountId: account.id, active: true, organization: { active: true, clerkOrganizationId: { not: null } } },
      include: { organization: true },
      orderBy: { organization: { name: "asc" } },
    }) : [];
    churches = memberships.flatMap(({ organization }) => organization.clerkOrganizationId ? [{
      name: organization.displayName || organization.name,
      clerkId: organization.clerkOrganizationId,
    }] : []);
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    unavailable = true;
  }
  return <main className="mx-auto max-w-xl space-y-6 p-8 text-[var(--bits-navy)]">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Choose your church</h1><UserButton /></div>
    {unavailable ? (
      <p role="alert">Church records are temporarily unavailable. Refresh this page to try again.</p>
    ) : (
      <>
        <p>Select the church you want to open. Your access is checked for that church.</p>
        <ChurchSelection churches={churches} />
      </>
    )}
  </main>;
}
