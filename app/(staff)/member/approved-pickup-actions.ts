"use server";

import { revalidatePath } from "next/cache";

import {
  type MemberApprovedPickupActionState,
} from "@/lib/validation/member-approved-pickups";
import {
  createMemberApprovedPickup,
  deactivateMemberApprovedPickup,
  deleteMemberApprovedPickup,
  getMemberApprovedPickups,
  reactivateMemberApprovedPickup,
  updateMemberApprovedPickup,
} from "@/server/services/member-approved-pickups.service";

function formValues(formData: FormData) {
  return {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    relationship: String(formData.get("relationship") ?? ""),
  };
}

function revalidateMemberPath(memberId: string) {
  revalidatePath(`/member/${memberId}`);
}

function denialMessage(status: string) {
  if (status === "SIGNED_OUT") return "You must be signed in.";
  if (status === "NO_ORGANIZATION") {
    return "The church organization has not been configured.";
  }
  if (status === "UNAUTHORIZED") {
    return "You do not have permission to edit members.";
  }
  if (status === "NOT_FOUND") return "That record was not found.";
  if (status === "DUPLICATE") {
    return "That approved person is already on this active list.";
  }
  return "Unable to save that record.";
}

function errorState(
  message: string,
  fieldErrors: MemberApprovedPickupActionState["fieldErrors"] = {},
): MemberApprovedPickupActionState {
  return {
    status: "error",
    message,
    fieldErrors,
  };
}

export async function getMemberApprovedPickupRows(memberId: string) {
  return getMemberApprovedPickups(memberId);
}

export async function createApprovedPickupAction(
  memberId: string,
  _previousState: MemberApprovedPickupActionState,
  formData: FormData,
): Promise<MemberApprovedPickupActionState> {
  const result = await createMemberApprovedPickup(memberId, formValues(formData));

  if (result.status === "CREATED") {
    revalidateMemberPath(memberId);
    return {
      status: "success",
      message: "Approved pickup person added.",
      pickupId: result.row.id,
      fieldErrors: {},
    };
  }

  if (result.status === "INVALID") {
    return errorState(result.message);
  }

  return errorState(denialMessage(result.status));
}

export async function updateApprovedPickupAction(
  memberId: string,
  pickupId: string,
  _previousState: MemberApprovedPickupActionState,
  formData: FormData,
): Promise<MemberApprovedPickupActionState> {
  const result = await updateMemberApprovedPickup(
    memberId,
    pickupId,
    formValues(formData),
  );

  if (result.status === "UPDATED") {
    revalidateMemberPath(memberId);
    return {
      status: "success",
      message: "Approved pickup person updated.",
      pickupId,
      fieldErrors: {},
    };
  }

  if (result.status === "INVALID") {
    return errorState(result.message);
  }

  return errorState(denialMessage(result.status));
}

export async function deactivateApprovedPickupAction(
  memberId: string,
  pickupId: string,
) {
  const result = await deactivateMemberApprovedPickup(memberId, pickupId);
  if (result.status === "DEACTIVATED") {
    revalidateMemberPath(memberId);
    return { status: "success" as const, message: "Approved pickup person deactivated." };
  }
  return {
    status: "error" as const,
    message:
      result.status === "INVALID" ? result.message : denialMessage(result.status),
  };
}

export async function reactivateApprovedPickupAction(
  memberId: string,
  pickupId: string,
) {
  const result = await reactivateMemberApprovedPickup(memberId, pickupId);
  if (result.status === "REACTIVATED") {
    revalidateMemberPath(memberId);
    return { status: "success" as const, message: "Approved pickup person reactivated." };
  }
  return {
    status: "error" as const,
    message:
      result.status === "INVALID" ? result.message : denialMessage(result.status),
  };
}

export async function deleteApprovedPickupAction(
  memberId: string,
  pickupId: string,
) {
  const result = await deleteMemberApprovedPickup(memberId, pickupId);
  if (result.status === "DELETED") {
    revalidateMemberPath(memberId);
    return { status: "success" as const, message: "Approved pickup person removed." };
  }
  return {
    status: "error" as const,
    message:
      result.status === "INVALID" ? result.message : denialMessage(result.status),
  };
}
