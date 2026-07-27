import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCareAccess,
  getPastoralCareNoteById,
  getStaffUserOptions,
} from "@/app/(staff)/care/actions";
import { getMemberSelectOptions } from "@/app/(staff)/member/actions";
import {
  PastoralCareForm,
  mapPastoralCareToFormValues,
} from "@/components/care/pastoral-care-form";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type EditPastoralCarePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditPastoralCarePage({ params }: EditPastoralCarePageProps) {
  const { id } = await params;
  const organization = await findPrimaryOrganization();

  if (!organization) {
    redirect("/settings/organization");
  }

  const access = await getCareAccess(organization.id);

  if (!access.canViewPastoralCare) {
    redirect("/dashboard");
  }

  let note;
  try {
    note = await getPastoralCareNoteById(id);
  } catch {
    redirect("/pastoral-care");
  }

  const [members, staffUsers] = await Promise.all([
    getMemberSelectOptions(),
    getStaffUserOptions(),
  ]);

  if (!note) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/pastoral-care/${id}`}
          className="text-sm font-medium text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          ← Back to Note
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
          Edit Pastoral Care Note
        </h1>
      </header>

      <PastoralCareForm
        mode="edit"
        noteId={id}
        members={members}
        staffUsers={staffUsers}
        initialValues={mapPastoralCareToFormValues(note)}
        canEdit={access.canManagePastoralCare}
        canMarkConfidential={access.canViewConfidentialPastoralCare}
      />
    </div>
  );
}
