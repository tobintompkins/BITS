"use server";

import { revalidatePath } from "next/cache";

import {
  createMemberCommunicationPreferencesActionState,
  parseCommunicationPreferenceFlag,
  type MemberCommunicationPreferences,
  type MemberCommunicationPreferencesActionState,
} from "@/lib/validation/member-communication-preferences";
import { updateMemberCommunicationPreferences } from "@/server/services/member-communication-preferences.service";

function getFormValues(formData: FormData): MemberCommunicationPreferences {
  return {
    allowEmail: parseCommunicationPreferenceFlag(formData.get("allowEmail")),
    allowSms: parseCommunicationPreferenceFlag(formData.get("allowSms")),
    allowPhoneCalls: parseCommunicationPreferenceFlag(
      formData.get("allowPhoneCalls"),
    ),
    allowPostalMail: parseCommunicationPreferenceFlag(
      formData.get("allowPostalMail"),
    ),
  };
}

export async function updateMemberCommunicationPreferencesAction(
  _previousState: MemberCommunicationPreferencesActionState,
  formData: FormData,
): Promise<MemberCommunicationPreferencesActionState> {
  const values = getFormValues(formData);
  const result = await updateMemberCommunicationPreferences(values);

  if (result.status === "SIGNED_OUT") {
    return {
      ...createMemberCommunicationPreferencesActionState(values),
      status: "error",
      message: "You must be signed in to update communication preferences.",
    };
  }

  if (result.status === "NO_ORGANIZATION") {
    return {
      ...createMemberCommunicationPreferencesActionState(values),
      status: "error",
      message: "The church organization has not been configured.",
    };
  }

  if (result.status === "CONNECTION_PENDING") {
    return {
      ...createMemberCommunicationPreferencesActionState(values),
      status: "error",
      message:
        "Your account must be connected to your church membership record before these preferences can be changed.",
    };
  }

  if (result.status === "INVALID") {
    return {
      ...createMemberCommunicationPreferencesActionState(values),
      status: "error",
      message: "Only email, text, phone, and postal-mail permissions can be saved.",
    };
  }

  revalidatePath("/portal");
  revalidatePath("/portal/communication-preferences");
  revalidatePath("/portal/profile");

  return {
    ...createMemberCommunicationPreferencesActionState(result.preferences),
    status: "success",
    message: result.unchanged
      ? "Your communication preferences are already up to date."
      : "Your communication preferences were saved.",
  };
}
