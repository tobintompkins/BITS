"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  checkInAttendeeSchema,
  searchCheckInSchema,
} from "@/lib/validation/event-check-in";
import {
  kioskCheckInAttendee,
  searchKioskCheckInAttendees,
} from "@/server/services/check-in-kiosk.service";

async function getActor() {
  const userAccount = await getOrCreateUserAccount();
  const clerkUser = await currentUser();
  return {
    userAccountId: userAccount?.id ?? null,
    email:
      clerkUser?.primaryEmailAddress?.emailAddress ??
      userAccount?.primaryEmail ??
      null,
  };
}

async function requireAuth() {
  const { userId } = await auth();
  if (!userId) throw new Error("You must be signed in.");
}

function revalidateKiosk(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/check-in`);
  revalidatePath(`/events/${eventId}/attendance`);
  revalidatePath(`/events/${eventId}/kiosk`);
}

export async function searchKioskCheckInAttendeesAction(formData: FormData) {
  await requireAuth();
  const parsed = searchCheckInSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    query: String(formData.get("query") ?? ""),
    page: String(formData.get("page") ?? "1"),
    pageSize: String(formData.get("pageSize") ?? "8"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Enter a name or confirmation code.",
      items: [],
      total: 0,
    };
  }

  try {
    const result = await searchKioskCheckInAttendees(
      parsed.data.eventId,
      parsed.data.query ?? "",
      parsed.data.page,
      parsed.data.pageSize,
    );
    return { status: "success" as const, ...result };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to search registered guests.",
      items: [],
      total: 0,
    };
  }
}

export async function kioskCheckInAttendeeAction(formData: FormData) {
  await requireAuth();
  const parsed = checkInAttendeeSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    attendeeId: String(formData.get("attendeeId") ?? ""),
    source: "STAFF_SEARCH",
    operationKey: String(formData.get("operationKey") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Invalid check-in request." };
  }

  try {
    const actor = await getActor();
    const result = await kioskCheckInAttendee(
      {
        eventId: parsed.data.eventId,
        attendeeId: parsed.data.attendeeId,
        operationKey: parsed.data.operationKey,
      },
      actor,
    );
    revalidateKiosk(parsed.data.eventId);
    return {
      status: "success" as const,
      message: result.alreadyPresent
        ? "Already checked in."
        : "Checked in successfully.",
      alreadyPresent: result.alreadyPresent,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to check in.",
    };
  }
}
