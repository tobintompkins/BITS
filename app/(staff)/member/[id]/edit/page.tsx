import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MemberForm } from "@/components/members/member-form";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import { toMemberFormValues } from "@/lib/validation/member";
import {
  getMemberById,
  getMemberHouseholdOptions,
  requireMemberViewAccess,
} from "@/app/(staff)/member/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { resolveMemberPhotoUrl } from "@/server/services/member-photo.service";

type EditMemberPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditMemberPage({ params }: EditMemberPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  await requireMemberViewAccess(organization.id);
  const access = await getMemberAccess(organization.id);

  if (!access.canEdit) {
    redirect(`/member/${id}`);
  }

  const [member, households] = await Promise.all([
    getMemberById(id),
    getMemberHouseholdOptions(),
  ]);

  if (!member) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/member/${member.id}`}
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Member
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Edit Member
        </h1>
      </header>

      <MemberForm
        mode="edit"
        memberId={member.id}
        member={member}
        photoUrl={resolveMemberPhotoUrl(member)}
        initialValues={toMemberFormValues(member)}
        households={households}
        canEdit={access.canEdit}
      />
    </div>
  );
}
