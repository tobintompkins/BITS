"use server";

import { revalidatePath } from "next/cache";

import type { StaffInvitationActionState } from "@/lib/validation/staff-invitation";
import { acceptStaffInvitation } from "@/server/services/staff-invitation-accept.service";

export async function acceptStaffInvitationAction(
  _previous: StaffInvitationActionState,
  form: FormData,
): Promise<StaffInvitationActionState> {
  const result = await acceptStaffInvitation({
    invitationId: form.get("invitationId"),
    confirm: form.get("confirm"),
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  revalidatePath("/dashboard");
  revalidatePath("/administration/staff-access");
  return { message: result.message, ok: true };
}
