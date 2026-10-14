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
        ? "Invitation authorized and submitted to the identity provider. Provider acceptance is not proof the email arrived."
        : result.status === "UNKNOWN"
          ? "Invitation authorized, but the provider result is unknown. Reconcile before retrying."
          : "Invitation authorized, but the provider did not accept it as sent.",
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
