"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  VOLUNTEER_SCHEDULE_OVERLAP_CONFLICT_MESSAGE,
  VOLUNTEER_SCHEDULE_TIME_OFF_CONFLICT_MESSAGE,
} from "@/lib/validation/volunteer-service-schedule";
import {
  cancelVolunteerServiceAssignment,
  createVolunteerServiceAssignment,
} from "@/server/services/volunteer-service-schedule.service";

const PRESERVED_CREATE_FIELDS = [
  "eventId",
  "memberId",
  "ministryId",
  "roleLabel",
] as const;

function resultUrl(
  type: "success" | "error",
  message: string,
  formData?: FormData,
) {
  const params = new URLSearchParams({ [type]: message });
  if (type === "error" && formData) {
    for (const field of PRESERVED_CREATE_FIELDS) {
      const value = formData.get(field);
      if (typeof value === "string" && value.trim()) {
        params.set(field, value.trim());
      }
    }
  }
  return `/volunteer-schedules?${params.toString()}`;
}

const createMessages = {
  SIGNED_OUT: "You must be signed in.",
  NO_ORGANIZATION: "The church organization has not been configured.",
  UNAUTHORIZED: "You do not have permission to manage volunteer schedules.",
  INVALID: "Check the event, volunteer, and assignment label.",
  NOT_FOUND: "That event, volunteer, or ministry is not available.",
  MINISTRY_MISMATCH:
    "That volunteer is not on the selected ministry roster.",
  DUPLICATE: "That volunteer already has this assignment for the event.",
  TIME_OFF_CONFLICT: VOLUNTEER_SCHEDULE_TIME_OFF_CONFLICT_MESSAGE,
  OVERLAP_CONFLICT: VOLUNTEER_SCHEDULE_OVERLAP_CONFLICT_MESSAGE,
} as const;

const cancelMessages = {
  ...createMessages,
  NOT_FOUND: "That assignment is not available to cancel.",
  INVALID: "That assignment could not be cancelled.",
} as const;

export async function createVolunteerServiceAssignmentAction(
  formData: FormData,
) {
  const result = await createVolunteerServiceAssignment({
    eventId: formData.get("eventId"),
    memberId: formData.get("memberId"),
    ministryId: formData.get("ministryId"),
    roleLabel: formData.get("roleLabel"),
    staffNote: formData.get("staffNote"),
  });

  if (result.status === "CREATED") {
    revalidatePath("/volunteer-schedules");
    revalidatePath("/portal/volunteer-schedule");
    redirect(resultUrl("success", "Volunteer assignment scheduled."));
  }

  redirect(
    resultUrl(
      "error",
      createMessages[result.status as keyof typeof createMessages] ??
        "Unable to schedule that assignment.",
      formData,
    ),
  );
}

export async function cancelVolunteerServiceAssignmentAction(
  formData: FormData,
) {
  const result = await cancelVolunteerServiceAssignment({
    assignmentId: formData.get("assignmentId"),
    cancellationNote: formData.get("cancellationNote"),
  });

  if (result.status === "CANCELLED") {
    revalidatePath("/volunteer-schedules");
    revalidatePath("/portal/volunteer-schedule");
    redirect(resultUrl("success", "Volunteer assignment cancelled."));
  }

  redirect(
    resultUrl(
      "error",
      cancelMessages[result.status as keyof typeof cancelMessages] ??
        "Unable to cancel that assignment.",
    ),
  );
}
