"use server";

import { revalidatePath } from "next/cache";

import {
  VOLUNTEER_WEEKDAYS,
  collectVolunteerAvailabilityFieldErrors,
  createMemberVolunteerAvailabilityActionState,
  memberVolunteerAvailabilitySchema,
  parseVolunteerAvailabilityFlag,
  type MemberVolunteerAvailabilityActionState,
  type MemberVolunteerAvailabilityInput,
} from "@/lib/validation/member-volunteer-availability";
import { updateMemberVolunteerAvailability } from "@/server/services/member-volunteer-availability.service";

function getFormValues(formData: FormData): MemberVolunteerAvailabilityInput {
  return {
    days: VOLUNTEER_WEEKDAYS.map((weekday) => ({
      weekday,
      isAvailable: parseVolunteerAvailabilityFlag(
        formData.get(`${weekday}.isAvailable`),
      ),
      startTime: String(formData.get(`${weekday}.startTime`) ?? "").trim() || null,
      endTime: String(formData.get(`${weekday}.endTime`) ?? "").trim() || null,
      note: String(formData.get(`${weekday}.note`) ?? "").trim() || null,
    })),
  };
}

export async function updateMemberVolunteerAvailabilityAction(
  _previousState: MemberVolunteerAvailabilityActionState,
  formData: FormData,
): Promise<MemberVolunteerAvailabilityActionState> {
  const values = getFormValues(formData);
  const parsed = memberVolunteerAvailabilitySchema.safeParse(values);
  if (!parsed.success) {
    return {
      ...createMemberVolunteerAvailabilityActionState(values),
      status: "error",
      message: "Check the highlighted days and try again.",
      fieldErrors: collectVolunteerAvailabilityFieldErrors(parsed.error),
    };
  }

  const result = await updateMemberVolunteerAvailability(parsed.data);

  if (result.status === "SIGNED_OUT") {
    return {
      ...createMemberVolunteerAvailabilityActionState(values),
      status: "error",
      message: "You must be signed in to update volunteer availability.",
    };
  }

  if (result.status === "NO_ORGANIZATION") {
    return {
      ...createMemberVolunteerAvailabilityActionState(values),
      status: "error",
      message: "The church organization has not been configured.",
    };
  }

  if (result.status === "CONNECTION_PENDING") {
    return {
      ...createMemberVolunteerAvailabilityActionState(values),
      status: "error",
      message:
        "Your account must be connected to your church membership record before availability can be saved.",
    };
  }

  if (result.status === "INVALID") {
    return {
      ...createMemberVolunteerAvailabilityActionState(values),
      status: "error",
      message: "Check the highlighted days and try again.",
    };
  }

  revalidatePath("/portal");
  revalidatePath("/portal/volunteer-availability");

  return {
    ...createMemberVolunteerAvailabilityActionState({ days: result.days }),
    status: "success",
    message: result.unchanged
      ? "Your volunteer availability is already up to date."
      : "Your volunteer availability was saved.",
  };
}
