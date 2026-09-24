"use server";

import { revalidatePath } from "next/cache";

import {
  createMemberProfileActionState,
  toMemberProfileFormValues,
  type MemberProfileActionState,
  type MemberProfileFormValues,
} from "@/lib/validation/member-profile-preferences";
import { updateMemberProfilePreferences } from "@/server/services/member-profile-preferences.service";

function getFormValues(formData: FormData): MemberProfileFormValues {
  return {
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    preferredCommunicationMethod: String(
      formData.get("preferredCommunicationMethod") ?? "",
    ),
  };
}

export async function updateMemberProfileAction(
  _previousState: MemberProfileActionState,
  formData: FormData,
): Promise<MemberProfileActionState> {
  const values = getFormValues(formData);
  const result = await updateMemberProfilePreferences(values);

  if (result.status === "SIGNED_OUT") {
    return {
      ...createMemberProfileActionState(values),
      status: "error",
      message: "You must be signed in to update your profile.",
    };
  }

  if (result.status === "NO_ORGANIZATION") {
    return {
      ...createMemberProfileActionState(values),
      status: "error",
      message: "The church organization has not been configured.",
    };
  }

  if (result.status === "CONNECTION_PENDING") {
    return {
      ...createMemberProfileActionState(values),
      status: "error",
      message:
        "Your account must be connected to your donor record before profile details can be changed.",
    };
  }

  if (result.status === "INVALID") {
    return {
      ...createMemberProfileActionState(values),
      status: "error",
      message: "Please correct the highlighted fields and try again.",
      fieldErrors: result.fieldErrors,
    };
  }

  revalidatePath("/portal");
  revalidatePath("/portal/profile");

  return {
    ...createMemberProfileActionState(toMemberProfileFormValues(result.profile)),
    status: "success",
    message: result.unchanged
      ? "Your profile is already up to date."
      : "Your contact preferences were saved.",
  };
}
