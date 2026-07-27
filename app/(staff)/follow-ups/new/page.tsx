import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCareAccess,
  getStaffUserOptions,
} from "@/app/(staff)/care/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import {
  FollowUpForm,
  emptyFollowUpFormValues,
  visitorWelcomeFollowUpValues,
} from "@/components/care/follow-up-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type NewFollowUpPageProps = {
  searchParams: Promise<{ memberId?: string; visitorWelcome?: string }>;
};

export default async function NewFollowUpPage({ searchParams }: NewFollowUpPageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canManageFollowUps) {
    redirect("/dashboard");
  }

  const visitorWelcome = params.visitorWelcome === "true";

  const [members, staffUsers] = await Promise.all([
    getMemberSelectOptions(),
    getStaffUserOptions(),
  ]);

  const initialValues = {
    ...(visitorWelcome ? visitorWelcomeFollowUpValues : emptyFollowUpFormValues),
    memberId: params.memberId ?? "",
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/follow-ups"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Follow-Ups
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          {visitorWelcome ? "Create Visitor Follow-Up" : "Add Follow-Up"}
        </h1>
      </header>

      <FollowUpForm
        mode="create"
        members={members}
        staffUsers={staffUsers}
        initialValues={initialValues}
        canEdit
        lockMember={Boolean(params.memberId)}
        visitorWelcome={visitorWelcome}
      />
    </div>
  );
}
