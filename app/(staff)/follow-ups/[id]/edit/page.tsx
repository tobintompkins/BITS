import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCareAccess,
  getFollowUpById,
  getStaffUserOptions,
} from "@/app/(staff)/care/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import {
  FollowUpForm,
  mapFollowUpToFormValues,
} from "@/components/care/follow-up-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type EditFollowUpPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditFollowUpPage({ params }: EditFollowUpPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewFollowUps) {
    redirect("/dashboard");
  }

  const [followUp, members, staffUsers] = await Promise.all([
    getFollowUpById(id),
    getMemberSelectOptions(),
    getStaffUserOptions(),
  ]);

  if (!followUp) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/follow-ups/${id}`}
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Follow-Up
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Edit Follow-Up
        </h1>
      </header>

      <FollowUpForm
        mode="edit"
        followUpId={id}
        members={members}
        staffUsers={staffUsers}
        initialValues={mapFollowUpToFormValues(followUp)}
        canEdit={access.canManageFollowUps}
        visitorWelcome={followUp.followUpType === "VISITOR_WELCOME"}
      />
    </div>
  );
}
