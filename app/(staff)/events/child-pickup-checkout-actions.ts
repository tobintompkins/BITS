"use server";

import { revalidatePath } from "next/cache";

import {
  confirmVerifiedChildCheckOut,
  getVerifiedChildCheckOutPage,
  listActiveApprovalsForCheckedInChild,
  searchVerifiedChildCheckOut,
} from "@/server/services/child-pickup-checkout.service";

function denialMessage(status: string) {
  if (status === "SIGNED_OUT") return "You must be signed in.";
  if (status === "NO_ORGANIZATION") {
    return "The church organization has not been configured.";
  }
  if (status === "UNAUTHORIZED") {
    return "You do not have permission to view this page.";
  }
  if (status === "NOT_FOUND") return "That record was not found.";
  if (status === "NOT_PRESENT") {
    return "That child is not currently checked in.";
  }
  if (status === "CHECK_OUT_DISABLED") {
    return "Check-out is not enabled for this event.";
  }
  if (status === "NO_APPROVALS") {
    return "This member has no active approved pickup person. An authorized leader can update the private member profile.";
  }
  if (status === "APPROVAL_MISMATCH") {
    return "That person is not approved for this child.";
  }
  return "Unable to complete that request.";
}

function revalidateEventPaths(eventId: string) {
  revalidatePath(`/events/${eventId}/child-check-out`);
  revalidatePath(`/events/${eventId}/check-in`);
  revalidatePath(`/events/${eventId}/attendance`);
}

export async function getVerifiedChildCheckOutPageAction(eventId: string) {
  return getVerifiedChildCheckOutPage(eventId);
}

export async function searchVerifiedChildCheckOutAction(
  eventId: string,
  query: string,
) {
  return searchVerifiedChildCheckOut(eventId, query);
}

export async function listChildPickupApprovalsAction(
  eventId: string,
  attendanceId: string,
) {
  return listActiveApprovalsForCheckedInChild(eventId, attendanceId);
}

export async function confirmVerifiedChildCheckOutAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const result = await confirmVerifiedChildCheckOut({
    eventId,
    attendanceId: String(formData.get("attendanceId") ?? ""),
    approvedPickupId: String(formData.get("approvedPickupId") ?? ""),
  });

  if (result.status === "CHECKED_OUT") {
    revalidateEventPaths(eventId);
    return {
      status: "success" as const,
      displayLabel: result.displayLabel,
      alreadyCompleted: result.alreadyCompleted,
    };
  }

  if (result.status === "INVALID") {
    return { status: "error" as const, message: result.message };
  }

  return { status: "error" as const, message: denialMessage(result.status) };
}
