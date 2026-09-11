"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  checkInAttendeeSchema,
  checkInSettingsSchema,
  checkOutSchema,
  correctAttendanceSchema,
  openStationSchema,
  partyCheckInSchema,
  resolveQrPassSchema,
  searchCheckInSchema,
  walkInSchema,
} from "@/lib/validation/event-check-in";
import {
  checkInAttendeeById,
  checkInParty,
  checkOutAttendance,
  closeCheckInStation,
  correctAttendance,
  createWalkInAndCheckIn,
  exportAttendanceCsv,
  finalizeNoShows,
  getCheckInOperationsBootstrap,
  getCheckInStations,
  getLiveAttendanceSummary,
  getOrCreateCheckInSettings,
  issueOrGetQrPass,
  listEventAttendance,
  openCheckInStation,
  resolveQrPassForStaff,
  searchCheckInAttendees,
  updateCheckInSettings,
} from "@/server/services/event-check-in.service";
import { getStaffCheckInPartyAttendees } from "@/server/services/staff-check-in.service";

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

function revalidateCheckIn(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/check-in`);
  revalidatePath(`/events/${eventId}/attendance`);
  revalidatePath(`/events/${eventId}/registrations`);
}

function parseBoolean(value: FormDataEntryValue | null) {
  return value === "true" || value === "on" || value === "1";
}

export async function getCheckInSettingsAction(eventId: string) {
  await requireAuth();
  return getOrCreateCheckInSettings(eventId);
}

export async function updateCheckInSettingsAction(formData: FormData) {
  await requireAuth();
  const parsed = checkInSettingsSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    checkInEnabled: parseBoolean(formData.get("checkInEnabled")),
    checkInOpensAt: String(formData.get("checkInOpensAt") ?? ""),
    checkInClosesAt: String(formData.get("checkInClosesAt") ?? ""),
    allowSelfCheckIn: parseBoolean(formData.get("allowSelfCheckIn")),
    allowWalkIns: parseBoolean(formData.get("allowWalkIns")),
    allowCheckOut: parseBoolean(formData.get("allowCheckOut")),
    allowReentry: parseBoolean(formData.get("allowReentry")),
    requireRegistration: parseBoolean(formData.get("requireRegistration")),
    qrPassEnabled: parseBoolean(formData.get("qrPassEnabled")),
    stationNameRequired: parseBoolean(formData.get("stationNameRequired")),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the check-in settings.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const actor = await getActor();
    const settings = await updateCheckInSettings(parsed.data, actor);
    revalidateCheckIn(parsed.data.eventId);
    return { status: "success" as const, message: "Check-in settings saved.", id: settings.id };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to save settings.",
    };
  }
}

export async function getCheckInBootstrapAction(eventId: string) {
  await requireAuth();
  return getCheckInOperationsBootstrap(eventId);
}

export async function openStationAction(formData: FormData) {
  await requireAuth();
  const parsed = openStationSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    name: String(formData.get("name") ?? ""),
    deviceLabel: String(formData.get("deviceLabel") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Station name is required." };
  }
  try {
    const actor = await getActor();
    const station = await openCheckInStation(parsed.data, actor);
    revalidateCheckIn(parsed.data.eventId);
    return {
      status: "success" as const,
      message: `Station “${station.name}” opened.`,
      station,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to open station.",
    };
  }
}

export async function closeStationAction(stationId: string, eventId: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    await closeCheckInStation(stationId, actor);
    revalidateCheckIn(eventId);
    return { status: "success" as const, message: "Station closed." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to close station.",
    };
  }
}

export async function searchCheckInAttendeesAction(formData: FormData) {
  await requireAuth();
  const parsed = searchCheckInSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    query: String(formData.get("query") ?? ""),
    page: String(formData.get("page") ?? "1"),
    pageSize: String(formData.get("pageSize") ?? "25"),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Invalid search.", items: [], total: 0 };
  }
  const result = await searchCheckInAttendees(
    parsed.data.eventId,
    parsed.data.query ?? "",
    parsed.data.page,
    parsed.data.pageSize,
  );
  return { status: "success" as const, ...result };
}

export async function checkInAttendeeAction(formData: FormData) {
  await requireAuth();
  const parsed = checkInAttendeeSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    attendeeId: String(formData.get("attendeeId") ?? ""),
    stationId: String(formData.get("stationId") ?? ""),
    source: String(formData.get("source") ?? "STAFF_SEARCH"),
    operationKey: String(formData.get("operationKey") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Invalid check-in request." };
  }
  try {
    const actor = await getActor();
    const result = await checkInAttendeeById(parsed.data, actor);
    revalidateCheckIn(parsed.data.eventId);
    return {
      status: "success" as const,
      message: result.alreadyPresent
        ? "Already checked in."
        : "Checked in successfully.",
      alreadyPresent: result.alreadyPresent,
      attendance: result.attendance,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to check in.",
    };
  }
}

export async function partyCheckInAction(formData: FormData) {
  await requireAuth();
  let attendeeIds: string[] = [];
  try {
    attendeeIds = JSON.parse(String(formData.get("attendeeIdsJson") ?? "[]")) as string[];
  } catch {
    attendeeIds = [];
  }
  const parsed = partyCheckInSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    registrationId: String(formData.get("registrationId") ?? ""),
    attendeeIds,
    stationId: String(formData.get("stationId") ?? ""),
    operationKey: String(formData.get("operationKey") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Select at least one attendee." };
  }
  try {
    const actor = await getActor();
    const results = await checkInParty(parsed.data, actor);
    revalidateCheckIn(parsed.data.eventId);
    return {
      status: "success" as const,
      message: `Checked in ${results.length} attendee(s).`,
      results,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to check in party.",
    };
  }
}

export async function resolveQrPassAction(formData: FormData) {
  await requireAuth();
  const parsed = resolveQrPassSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    tokenOrCode: String(formData.get("tokenOrCode") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Enter a QR pass or fallback code." };
  }
  try {
    const actor = await getActor();
    const result = await resolveQrPassForStaff(
      parsed.data.eventId,
      parsed.data.tokenOrCode,
      actor,
    );
    return { status: "success" as const, ...result };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to resolve QR pass.",
    };
  }
}

export async function walkInAction(formData: FormData) {
  await requireAuth();
  const parsed = walkInSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    memberId: String(formData.get("memberId") ?? ""),
    stationId: String(formData.get("stationId") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Walk-in name is required." };
  }
  try {
    const actor = await getActor();
    const result = await createWalkInAndCheckIn(parsed.data, actor);
    revalidateCheckIn(parsed.data.eventId);
    return {
      status: "success" as const,
      message: `Walk-in checked in (${result.registration.confirmationCode}).`,
      confirmationCode: result.registration.confirmationCode,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to create walk-in.",
    };
  }
}

export async function checkOutAction(formData: FormData) {
  await requireAuth();
  const parsed = checkOutSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    attendanceId: String(formData.get("attendanceId") ?? ""),
    stationId: String(formData.get("stationId") ?? ""),
    operationKey: String(formData.get("operationKey") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Invalid check-out request." };
  }
  try {
    const actor = await getActor();
    const result = await checkOutAttendance(
      parsed.data.eventId,
      parsed.data.attendanceId,
      actor,
      {
        stationId: parsed.data.stationId,
        operationKey: parsed.data.operationKey,
      },
    );
    revalidateCheckIn(parsed.data.eventId);
    return {
      status: "success" as const,
      message: result.alreadyCheckedOut ? "Already checked out." : "Checked out.",
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to check out.",
    };
  }
}

export async function correctAttendanceAction(formData: FormData) {
  await requireAuth();
  const parsed = correctAttendanceSchema.safeParse({
    eventId: String(formData.get("eventId") ?? ""),
    attendanceId: String(formData.get("attendanceId") ?? ""),
    status: String(formData.get("status") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Correction requires a valid status and reason.",
    };
  }
  try {
    const actor = await getActor();
    await correctAttendance(parsed.data, actor);
    revalidateCheckIn(parsed.data.eventId);
    return { status: "success" as const, message: "Attendance corrected." };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to correct attendance.",
    };
  }
}

export async function finalizeNoShowsAction(eventId: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    const result = await finalizeNoShows(eventId, actor);
    revalidateCheckIn(eventId);
    return {
      status: "success" as const,
      message: `Marked ${result.marked} no-show(s).`,
      marked: result.marked,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to finalize no-shows.",
    };
  }
}

export async function getLiveSummaryAction(eventId: string) {
  await requireAuth();
  return getLiveAttendanceSummary(eventId);
}

export async function listAttendanceAction(formData: FormData) {
  await requireAuth();
  const eventId = String(formData.get("eventId") ?? "");
  const result = await listEventAttendance(eventId, {
    query: String(formData.get("query") ?? ""),
    status: (String(formData.get("status") ?? "") || undefined) as never,
    source: (String(formData.get("source") ?? "") || undefined) as never,
    page: Number(formData.get("page") ?? 1),
    pageSize: Number(formData.get("pageSize") ?? 25),
  });
  return { status: "success" as const, ...result };
}

export async function exportAttendanceAction(eventId: string) {
  await requireAuth();
  try {
    const actor = await getActor();
    const result = await exportAttendanceCsv(eventId, actor);
    return { status: "success" as const, ...result };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to export attendance.",
    };
  }
}

export async function issueQrPassAction(registrationId: string, rotate = false) {
  await requireAuth();
  try {
    const actor = await getActor();
    const pass = await issueOrGetQrPass(registrationId, actor, { rotate });
    if (pass.eventId) revalidateCheckIn(pass.eventId);
    return { status: "success" as const, ...pass };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to issue QR pass.",
    };
  }
}

export async function listStationsAction(eventId: string) {
  await requireAuth();
  return getCheckInStations(eventId);
}

/**
 * Blueprint 7.3H — load one event registration's attendees for selected-party UI.
 * Permission and tenant scoping enforced inside getStaffCheckInPartyAttendees.
 */
export async function getStaffCheckInPartyAttendeesAction(
  eventId: string,
  registrationId: string,
) {
  await requireAuth();
  try {
    const party = await getStaffCheckInPartyAttendees(eventId, registrationId);
    return { status: "success" as const, party };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof Error
          ? error.message
          : "Unable to load registration attendees.",
      code:
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : undefined,
    };
  }
}
