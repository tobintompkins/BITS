import { DonorForm } from "@/components/donors/donor-form";
import { DonorManagementError, requireDonorAccess } from "@/server/services/donor-management.service";
export default async function NewDonorPage() {
  let access;
  try { access = await requireDonorAccess(true); }
  catch (e) { if (!(e instanceof DonorManagementError)) throw e; return <p role="alert">{e.message}</p>; }
  return <div className="space-y-5"><h1 className="text-3xl font-semibold text-[var(--bits-navy)]">Add donor</h1><DonorForm organizationId={access.organization.id} /></div>;
}
