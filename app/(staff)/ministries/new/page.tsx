import { redirect } from "next/navigation";

import { MinistryForm } from "@/components/ministries/ministry-form";
import { getMemberEngagementAccess } from "@/app/(staff)/member-engagement/actions";
import { getStaffUserOptions } from "@/app/(staff)/care/actions";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export default async function NewMinistryPage() {
  const organization = await findPrimaryOrganization();
  if (!organization) redirect("/settings/organization");

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canManageMinistries) {
    redirect("/ministries");
  }

  const staffUsers = await getStaffUserOptions();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          New Ministry
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Create a ministry team and assign a staff leader.
        </p>
      </header>
      <MinistryForm
        mode="create"
        staffUsers={staffUsers}
        initialValues={{
          name: "",
          description: "",
          ministryType: "OTHER",
          leaderUserId: "",
          isActive: true,
          meetingSchedule: "",
          location: "",
        }}
      />
    </div>
  );
}
