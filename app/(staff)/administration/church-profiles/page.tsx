import { redirect } from "next/navigation";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { RoleCode } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { adminChurchProfiles } from "@/server/services/church-person-profile.service";

import { ChurchProfileAdminForm } from "./profile-form";
import { NewChurchProfileForm } from "./new-profile-form";

export default async function ChurchProfilesPage() {
  const account = await getOrCreateUserAccount();
  if (!account) redirect("/sign-in");
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      userAccountId: account.id,
      active: true,
      churchAccess: "ACTIVE",
      roleType: { code: RoleCode.ORG_ADMIN },
    },
  });
  if (!membership) {
    return (
      <p className="rounded-xl bg-white p-5 text-sm text-[var(--bits-navy)]">
        An active church administrator can manage church profiles.
      </p>
    );
  }
  const directory = await adminChurchProfiles(membership.organizationId);
  if (directory.status !== "READY") {
    return (
      <p className="rounded-xl bg-white p-5 text-sm text-[var(--bits-navy)]">
        Church profiles are not available until the local profile migration has been applied.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--bits-gold-dark)]">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold text-[var(--bits-navy)]">Church profiles</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--bits-muted)]">
          One profile can serve on more than one team. Saving a profile does not create a login, a member, or a donor. Public pages stay hidden until the person consents and you publish the profile.
        </p>
      </header>
      <div className="grid gap-4">
        {directory.profiles.map((profile) => (
          <ChurchProfileAdminForm key={profile.rosterKey} profile={profile} />
        ))}
      </div>
      <NewChurchProfileForm />
    </div>
  );
}
