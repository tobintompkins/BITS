"use server";
import { revalidatePath } from "next/cache";
import { DonorManagementError, saveDonor } from "@/server/services/donor-management.service";
import { emptyDonor, type DonorActionState } from "@/lib/validation/donor";

export async function saveDonorAction(organizationId: string, id: string | null, _previous: DonorActionState, form: FormData): Promise<DonorActionState> {
  const raw = Object.fromEntries(Object.keys(emptyDonor).map(key => [key,
    key === "active" || key === "deceased" ? form.get(key) === "on" : String(form.get(key) ?? "").trim(),
  ]));
  try {
    const donor = await saveDonor(organizationId, id, raw);
    revalidatePath("/donors");
    revalidatePath(`/donors/${donor.id}`);
    return { message: "Donor saved.", savedId: donor.id };
  } catch (error) {
    return { message: error instanceof DonorManagementError ? error.message : "Unable to save the donor. Please try again." };
  }
}
