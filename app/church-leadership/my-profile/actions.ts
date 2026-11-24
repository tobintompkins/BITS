"use server";

import { revalidatePath } from "next/cache";

import {
  claimOwnChurchProfile,
  createOwnPersonalProfile,
} from "@/server/services/church-person-profile.service";

function refresh() {
  revalidatePath("/church-leadership");
  revalidatePath("/church-leadership/my-profile");
  revalidatePath("/portal/profile");
}

async function finish(result: Promise<{ ok: boolean; message: string }>) {
  try {
    const saved = await result;
    if (saved.ok) refresh();
    return { ok: saved.ok, message: saved.message };
  } catch {
    return { ok: false, message: "Your profile could not be saved. Please try again." };
  }
}

export async function claimOwnChurchProfileAction(
  _state: { ok: boolean; message: string },
  formData: FormData,
) {
  return finish(claimOwnChurchProfile(formData));
}

export async function createOwnPersonalProfileAction(
  state: { ok: boolean; message: string },
) {
  void state;
  return finish(createOwnPersonalProfile());
}
