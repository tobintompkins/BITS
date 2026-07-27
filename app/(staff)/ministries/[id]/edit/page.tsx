import { notFound, redirect } from "next/navigation";

import { MinistryForm } from "@/components/ministries/ministry-form";
import {
  getMemberEngagementAccess,
  getMinistryById,
} from "@/app/(staff)/member-engagement/actions";
import { getStaffUserOptions } from "@/app/(staff)/care/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type EditMinistryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditMinistryPage({ params }: EditMinistryPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canManageMinistries) {
    redirect(`/ministries/${id}`);
  }

  const [ministry, staffUsers] = await Promise.all([
    getMinistryById(id),
    getStaffUserOptions(),
  ]);

  if (!ministry) notFound();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Edit Ministry
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Update ministry details and staff leadership.
        </p>
      </header>
      <MinistryForm
        mode="edit"
        ministryId={ministry.id}
        staffUsers={staffUsers}
        initialValues={{
          name: ministry.name,
          description: ministry.description ?? "",
          ministryType: ministry.ministryType,
          leaderUserId: ministry.leader?.id ?? "",
          isActive: ministry.isActive,
          meetingSchedule: ministry.meetingSchedule ?? "",
          location: ministry.location ?? "",
        }}
      />
    </div>
  );
}
