import Link from "next/link";
import { DonorForm } from "@/components/donors/donor-form";
import { emptyDonor, type DonorFormValues } from "@/lib/validation/donor";
import { DonorManagementError, getDonor } from "@/server/services/donor-management.service";
export default async function DonorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try { data = await getDonor(id); }
  catch (e) { if (!(e instanceof DonorManagementError)) throw e; return <p role="alert">{e.message}</p>; }
  const { donor, canEdit, organization } = data;
  const values = Object.fromEntries(Object.keys(emptyDonor).map(key => [key, key === "deceasedDate" ? donor.deceasedDate?.toISOString().slice(0, 10) ?? "" : donor[key as keyof typeof donor] ?? ""])) as DonorFormValues;
  return <div className="space-y-5"><h1 className="text-3xl font-semibold text-[var(--bits-navy)]">{donor.firstName} {donor.lastName}</h1>
    <p>{donor.userAccountId ? "Connected to a portal account" : "No portal account connected"}</p>
    {canEdit ? <DonorForm organizationId={organization.id} id={donor.id} values={values} /> : <div className="rounded-xl border bg-white p-6"><p>{donor.email ?? "No email"}</p><p>{donor.phone ?? "No phone"}</p><p>{[donor.mailingAddressLine1, donor.mailingAddressLine2, donor.city, donor.state, donor.postalCode, donor.country].filter(Boolean).join(", ")}</p><p>{donor.active ? "Active" : "Inactive"}{donor.deceased ? " · Deceased" : ""}</p><Link className="underline" href="/donors">Back to donors</Link></div>}
  </div>;
}
