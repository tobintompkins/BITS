"use server";

import { revalidatePath } from "next/cache";

import type { StaffInvitationActionState } from "@/lib/validation/staff-invitation";
import type { StaffMembershipActionState } from "@/lib/validation/staff-membership-admin";
import {
  createStaffInvitation,
  retryStaffInvitation,
  revokeStaffInvitation,
} from "@/server/services/staff-invitation.service";
import { updateStaffMembership } from "@/server/services/staff-membership-admin.service";

function revalidateStaffMembershipViews() {
  revalidatePath("/administration/staff-access");
  revalidatePath("/administration/security-activity");
  revalidatePath("/dashboard");
}

export async function updateStaffMembershipAction(
  _previous: StaffMembershipActionState,
  form: FormData,
): Promise<StaffMembershipActionState> {
  const result = await updateStaffMembership({
    membershipId: form.get("membershipId"),
    expectedVersion: form.get("expectedVersion"),
    expectedUpdatedAt: form.get("expectedUpdatedAt"),
    roleCode: form.get("roleCode"),
    active: form.get("active"),
    confirm: form.get("confirm"),
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  if (result.changed) {
    revalidateStaffMembershipViews();
    return { message: "Staff membership updated.", ok: true };
  }

  return { message: "No membership change was needed.", ok: true };
}

export async function createStaffInvitationAction(
  _previous: StaffInvitationActionState,
  form: FormData,
): Promise<StaffInvitationActionState> {
  const result = await createStaffInvitation({
    email: form.get("email"),
    roleCode: form.get("roleCode"),
    confirm: form.get("confirm"),
    confirmAdmin: form.get("confirmAdmin"),
  });
  if (!result.ok) {
    return { message: result.message, ok: false };
  }
  revalidateStaffMembershipViews();
  return {
    message:
      result.status === "SENT"
        ? "Invitation saved in BITS. The person signs in with this email and accepts the link in the list. Church access is granted here."
        : result.status === "UNKNOWN"
          ? "Invitation saved in BITS, but delivery to the sign-in provider is not confirmed. The person can still accept the link in the list."
          : "Invitation saved in BITS. The person can accept the link in the list after signing in with this email.",
    ok: true,
  };
}

export async function retryStaffInvitationAction(
  _previous: StaffInvitationActionState,
  form: FormData,
): Promise<StaffInvitationActionState> {
  const result = await retryStaffInvitation({
    invitationId: form.get("invitationId"),
    expectedVersion: form.get("expectedVersion"),
    confirm: form.get("confirm"),
    reapprove: form.get("reapprove"),
  });
  if (!result.ok) {
    return { message: result.message, ok: false };
  }
  revalidateStaffMembershipViews();
  return { message: "Invitation retry recorded.", ok: true };
}

export async function revokeStaffInvitationAction(
  _previous: StaffInvitationActionState,
  form: FormData,
): Promise<StaffInvitationActionState> {
  const result = await revokeStaffInvitation({
    invitationId: form.get("invitationId"),
    expectedVersion: form.get("expectedVersion"),
    confirm: form.get("confirm"),
  });
  if (!result.ok) {
    return { message: result.message, ok: false };
  }
  revalidateStaffMembershipViews();
  return { message: "Invitation revoked. It can no longer grant a BITS role.", ok: true };
}
