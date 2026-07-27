"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  cancelRegistrationSchema,
  registrationSettingsSchema,
  submitRegistrationSchema,
} from "@/lib/validation/event-registration";
import {
  cancelRegistration,
  checkInAttendee,
  checkInByToken,
  exportEventRegistrationsCsv,
  getAttendeeQrPayload,
  getEventRegistrations,
  getOrCreateRegistrationSettings,
  getRegistrationById,
  getRegistrationSummary,
  promoteWaitlistRegistration,
  staffAddRegistration,
  updateRegistrationSettings,
} from "@/server/services/event-registration.service";

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

function revalidateRegistrationPaths(eventId?: string, code?: string) {
  revalidatePath("/events");
  revalidatePath("/dashboard");
  if (eventId) {
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/edit`);
    revalidatePath(`/events/${eventId}/registrations`);
  }
  if (code) {
    revalidatePath(`/register/confirmation/${code}`);
  }
}

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "true" || value === "on" || value === "1";
}

function parseAttendeesJson(formData: FormData) {
  const raw = String(formData.get("attendeesJson") ?? "[]");
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getRegistrationSettingsAction(eventId: string) {
  await requireAuth();
  return getOrCreateRegistrationSettings(eventId);
}

export async function updateRegistrationSettingsAction(formData: FormData) {
  await requireAuth();
  const parsed = registrationSettingsSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    isEnabled: parseBoolean(formData.get("isEnabled")),
    visibility: String(formData.get("visibility") ?? "PUBLIC"),
    opensAt: String(formData.get("opensAt") ?? ""),
    closesAt: String(formData.get("closesAt") ?? ""),
    capacity: String(formData.get("capacity") ?? ""),
    waitlistEnabled: parseBoolean(formData.get("waitlistEnabled")),
    waitlistCapacity: String(formData.get("waitlistCapacity") ?? ""),
    promotionMode: String(formData.get("promotionMode") ?? "AUTOMATIC"),
    maxAttendeesPerRegistration: String(
      formData.get("maxAttendeesPerRegistration") ?? "1",
    ),
    allowHouseholdRegistration: parseBoolean(
      formData.get("allowHouseholdRegistration"),
    ),
    allowGuestRegistration: parseBoolean(formData.get("allowGuestRegistration")),
    requireAuthentication: parseBoolean(formData.get("requireAuthentication")),
    requireEmail: parseBoolean(formData.get("requireEmail")),
    requirePhone: parseBoolean(formData.get("requirePhone")),
    requireDateOfBirth: parseBoolean(formData.get("requireDateOfBirth")),
    requireEmergencyContact: parseBoolean(
      formData.get("requireEmergencyContact"),
    ),
    requireGuardianForMinors: parseBoolean(
      formData.get("requireGuardianForMinors"),
    ),
    allowCancellation: parseBoolean(formData.get("allowCancellation")),
    cancellationDeadline: String(formData.get("cancellationDeadline") ?? ""),
    confirmationMessage: String(formData.get("confirmationMessage") ?? ""),
    instructions: String(formData.get("instructions") ?? ""),
    checkInEnabled: parseBoolean(formData.get("checkInEnabled")),
    qrCheckInEnabled: parseBoolean(formData.get("qrCheckInEnabled")),
    showCapacityPublicly: parseBoolean(formData.get("showCapacityPublicly")),
    showWaitlistPublicly: parseBoolean(formData.get("showWaitlistPublicly")),
    confirmationRequired: parseBoolean(formData.get("confirmationRequired")),
    promotionOfferTtlMinutes: String(
      formData.get("promotionOfferTtlMinutes") ?? "1440",
    ),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the registration settings.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    const settings = await updateRegistrationSettings(parsed.data, actor);
    revalidateRegistrationPaths(parsed.data.eventId);
    return {
      status: "success" as const,
      message: "Registration settings saved.",
      id: settings.id,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save registration settings.",
    };
  }
}

export async function getEventRegistrationsAction(eventId: string) {
  await requireAuth();
  return getEventRegistrations(eventId);
}

export async function getRegistrationByIdAction(registrationId: string) {
  await requireAuth();
  return getRegistrationById(registrationId);
}

export async function getRegistrationSummaryAction(eventId: string) {
  await requireAuth();
  return getRegistrationSummary(eventId);
}

export async function staffAddRegistrationAction(formData: FormData) {
  await requireAuth();
  const parsed = submitRegistrationSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    memberId: String(formData.get("memberId") ?? ""),
    householdId: String(formData.get("householdId") ?? ""),
    primaryContactName: String(formData.get("primaryContactName") ?? ""),
    primaryContactEmail: String(formData.get("primaryContactEmail") ?? ""),
    primaryContactPhone: String(formData.get("primaryContactPhone") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    attendees: parseAttendeesJson(formData),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the registration form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    const registration = await staffAddRegistration(parsed.data, actor);
    revalidateRegistrationPaths(
      parsed.data.eventId,
      registration.confirmationCode,
    );
    return {
      status: "success" as const,
      message: `Registration ${registration.confirmationCode} added (${registration.status}).`,
      id: registration.id,
      confirmationCode: registration.confirmationCode,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error ? error.message : "Unable to add registration.",
    };
  }
}

export async function staffCancelRegistrationAction(formData: FormData) {
  await requireAuth();
  const parsed = cancelRegistrationSchema.safeParse({
    confirmationCode: String(formData.get("confirmationCode") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    email: String(formData.get("email") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please provide a valid confirmation code.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const actor = await getActor();
    const registration = await cancelRegistration(parsed.data, actor, {
      isStaff: true,
    });
    revalidateRegistrationPaths(
      registration.eventId,
      registration.confirmationCode,
    );
    return {
      status: "success" as const,
      message: "Registration cancelled.",
      id: registration.id,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to cancel registration.",
    };
  }
}

export async function promoteWaitlistAction(registrationId: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    const registration = await promoteWaitlistRegistration(
      registrationId,
      actor,
    );
    revalidateRegistrationPaths(
      registration.eventId,
      registration.confirmationCode,
    );
    return {
      status: "success" as const,
      message: `Sent promotion offer for ${registration.confirmationCode}.`,
      id: registration.id,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to promote waitlist registration.",
    };
  }
}

export async function checkInAttendeeAction(attendeeId: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    const attendee = await checkInAttendee(attendeeId, actor);
    revalidateRegistrationPaths(attendee.eventId);
    return {
      status: "success" as const,
      message: `Checked in ${attendee.firstName} ${attendee.lastName}.`,
      id: attendee.id,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error ? error.message : "Unable to check in attendee.",
    };
  }
}

export async function checkInByTokenAction(formData: FormData) {
  await requireAuth();
  const eventId = String(formData.get("eventId") ?? "");
  const token = String(formData.get("token") ?? "");
  if (!eventId || !token) {
    return {
      status: "error" as const,
      message: "Event and check-in token are required.",
    };
  }

  try {
    const actor = await getActor();
    const attendee = await checkInByToken(eventId, token, actor);
    revalidateRegistrationPaths(eventId);
    return {
      status: "success" as const,
      message: `Checked in ${attendee.firstName} ${attendee.lastName}.`,
      id: attendee.id,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error ? error.message : "Unable to check in by token.",
    };
  }
}

export async function exportRegistrationsCsvAction(eventId: string) {
  await requireAuth();
  try {
    return {
      status: "success" as const,
      message: "Export ready.",
      ...(await exportEventRegistrationsCsv(eventId)),
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to export registrations.",
    };
  }
}

export async function getAttendeeQrPayloadAction(attendeeId: string) {
  await requireAuth();
  return getAttendeeQrPayload(attendeeId);
}
