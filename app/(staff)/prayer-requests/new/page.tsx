import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCareAccess,
  getStaffUserOptions,
} from "@/app/(staff)/care/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import {
  PrayerRequestForm,
  emptyPrayerRequestFormValues,
} from "@/components/care/prayer-request-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type NewPrayerRequestPageProps = {
  searchParams: Promise<{ memberId?: string }>;
};

export default async function NewPrayerRequestPage({
  searchParams,
}: NewPrayerRequestPageProps) {
  const params = await searchParams;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canManagePrayerRequests) {
    redirect("/dashboard");
  }

  const [members, staffUsers] = await Promise.all([
    getMemberSelectOptions(),
    getStaffUserOptions(),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/prayer-requests"
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Prayer Requests
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Add Prayer Request
        </h1>
      </header>

      <PrayerRequestForm
        mode="create"
        members={members}
        staffUsers={staffUsers}
        initialValues={{
          ...emptyPrayerRequestFormValues,
          memberId: params.memberId ?? "",
        }}
        canEdit
        lockMember={Boolean(params.memberId)}
      />
    </div>
  );
}
