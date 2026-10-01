"use client";
import Link from "next/link";
import { useActionState } from "react";
import { saveDonorAction } from "@/app/(staff)/donors/actions";
import { emptyDonor, type DonorFormValues } from "@/lib/validation/donor";
const labels = { firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone", mailingAddressLine1: "Mailing address", mailingAddressLine2: "Address line 2", city: "City", state: "State / province", postalCode: "Postal code", country: "Country", preferredCommunicationMethod: "Preferred contact method", deceasedDate: "Date of death" } as const;
export function DonorForm({ organizationId, id = null, values = emptyDonor }: { organizationId: string; id?: string | null; values?: DonorFormValues }) {
  const [state, action, pending] = useActionState(saveDonorAction.bind(null, organizationId, id), { message: "" });
  return <form action={action} className="space-y-5 rounded-2xl border bg-white p-6">
    <p className="text-sm">A donor does not need a BITS login. Inactive donors and their giving history remain on record.</p>
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
      <legend className="sr-only">Donor details</legend>
      {Object.entries(labels).map(([key, label]) => <label key={key} className="block text-sm font-medium">{label}
        <input name={key} type={key === "email" ? "email" : key === "deceasedDate" ? "date" : "text"} required={key === "firstName" || key === "lastName"} defaultValue={String(values[key as keyof DonorFormValues])} maxLength={key === "email" ? 254 : 200} className="mt-1 block w-full rounded border p-2" />
      </label>)}
      <label className="sm:col-span-2">Internal notes<textarea name="internalNotes" defaultValue={values.internalNotes} maxLength={4000} className="mt-1 block w-full rounded border p-2" rows={4} /></label>
      <label><input type="checkbox" name="active" defaultChecked={values.active} /> Active donor</label>
      <label><input type="checkbox" name="deceased" defaultChecked={values.deceased} /> Deceased</label>
    </fieldset>
    <p role="status" aria-live="polite">{state.message}</p>
    {state.savedId && <Link href={`/donors/${state.savedId}`} className="block underline">View saved donor</Link>}
    <button disabled={pending || (!id && Boolean(state.savedId))} className="rounded bg-[var(--bits-navy)] px-4 py-2 text-white disabled:opacity-50">{pending ? "Saving…" : "Save donor"}</button>
    <Link href="/donors" className="ml-4 underline">Back to donors</Link>
  </form>;
}
