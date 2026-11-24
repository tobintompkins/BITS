"use server";

import { revalidatePath } from "next/cache";

import { saveOwnChurchProfile } from "@/server/services/church-person-profile.service";

export async function saveOwnChurchProfileAction(
  _state: { ok: boolean; message: string },
  formData: FormData,
) {
  try {
    const result = await saveOwnChurchProfile(formData);
    if (result.ok) {
      revalidatePath("/church-leadership");
      revalidatePath("/church-leadership/my-profile");
      revalidatePath("/portal/profile");
    }
    return {
      ok: result.ok,
      message: result.message,
    };
  } catch {
    return { ok: false, message: "Your profile could not be saved. Please try again." };
  }
}
