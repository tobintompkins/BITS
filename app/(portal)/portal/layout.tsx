import {
  describeChurchPortalBlock,
  findMemberPortalOrganization,
} from "@/server/repositories/organization.repository";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountMenu } from "@/components/account/account-menu";
import { DisplayOptions } from "@/components/accessibility/display-options";
import { MemberPortalNav } from "@/components/portal/member-portal-nav";
import { memberHasLeadershipPortalAccess } from "@/server/services/member-portal.service";
import { ensureOwnPersonalProfile } from "@/server/services/church-person-profile.service";

export default async function MemberPortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const block = await describeChurchPortalBlock();
  if (block) {
    const title = block.churchAccess === "REMOVED" ? "Removed" : "Suspended";
    const detail =
      block.churchAccess === "REMOVED"
        ? `${block.organizationName} has removed your access to this church. Your sign-in remains, and another church is not affected.`
        : `${block.organizationName} has suspended your access. You can still sign in, and this church stays closed until an administrator restores it.`;
    return (
      <div className="min-h-screen bg-[var(--bits-page)]">
        <main className="mx-auto w-full max-w-xl px-4 py-16">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">{title}</p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--bits-navy)]">{block.organizationName}</h1>
          <p className="mt-4 text-sm text-[var(--bits-navy)]">{detail}</p>
        </main>
      </div>
    );
  }
  const organization = await findMemberPortalOrganization();
  if (!organization) redirect("/select-organization");
  await ensureOwnPersonalProfile();
  const showLeadershipPortal = await memberHasLeadershipPortalAccess();

  return (
    <div className="min-h-screen bg-[var(--bits-page)]">
      <header className="portal-app-header border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-6">
          <Link href="/portal" className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--bits-gold)] text-xl text-[var(--bits-gold)]"
            >
              ✝
            </span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
                Member Portal
              </span>
              <span className="block font-semibold">{organization.displayName || organization.name}</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <DisplayOptions />
            <MemberPortalNav showLeadershipPortal={showLeadershipPortal} />
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
