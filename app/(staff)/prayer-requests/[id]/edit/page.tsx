import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCareAccess,
  getPrayerRequestById,
  getStaffUserOptions,
} from "@/app/(staff)/care/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import {
  PrayerRequestForm,
  mapPrayerRequestToFormValues,
} from "@/components/care/prayer-request-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type EditPrayerRequestPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPrayerRequestPage({
  params,
}: EditPrayerRequestPageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewPrayerRequests) {
    redirect("/dashboard");
  }

  let request;
  try {
    request = await getPrayerRequestById(id);
  } catch {
    redirect("/prayer-requests");
  }

  const [members, staffUsers] = await Promise.all([
    getMemberSelectOptions(),
    getStaffUserOptions(),
  ]);

  if (!request) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/prayer-requests/${id}`}
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Prayer Request
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Edit Prayer Request
        </h1>
      </header>

      <PrayerRequestForm
        mode="edit"
        prayerRequestId={id}
        members={members}
        staffUsers={staffUsers}
        initialValues={mapPrayerRequestToFormValues(request)}
        canEdit={access.canManagePrayerRequests}
      />
    </div>
  );
}
