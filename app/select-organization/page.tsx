import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { prisma } from "@/lib/db/prisma";
import { ChurchSelection } from "@/components/auth/church-selection";

export default async function SelectOrganizationPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const account = await prisma.userAccount.findUnique({ where: { clerkUserId: userId } });
  const memberships = account?.active ? await prisma.organizationMembership.findMany({
    where: { userAccountId: account.id, active: true, organization: { active: true, clerkOrganizationId: { not: null } } },
    include: { organization: true },
    orderBy: { organization: { name: "asc" } },
  }) : [];
  return <main className="mx-auto max-w-xl space-y-6 p-8 text-[var(--bits-navy)]">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Choose your church</h1><UserButton /></div>
    <p>Select the church you want to open. Your access is checked for that church.</p>
    <ChurchSelection churches={memberships.map(({ organization }) => ({
      name: organization.displayName || organization.name,
      clerkId: organization.clerkOrganizationId!,
    }))} />
  </main>;
}
