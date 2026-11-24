"use server";

import { revalidatePath } from "next/cache";

import { saveChurchProfileAsAdmin } from "@/server/services/church-person-profile.service";

export async function saveChurchProfileAction(
  _state: { ok: boolean; message: string },
  formData: FormData,
) {
  const result = await saveChurchProfileAsAdmin(formData);
  if (result.ok) {
    revalidatePath("/church-leadership");
    revalidatePath("/administration/church-profiles");
  }
  return { ok: result.ok, message: result.message };
}
