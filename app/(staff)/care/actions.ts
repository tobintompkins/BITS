"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  attendanceSchema,
  communicationSchema,
  followUpSchema,
  pastoralCareSchema,
  prayerRequestSchema,
} from "@/lib/validation/care-engagement";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import {
  archivePrayerRequest,
  createAttendanceRecord,
  createFollowUpFromCommunication,
  createFollowUpRecord,
  createMemberCommunicationRecord,
  createPastoralCareNoteRecord,
  createPrayerRequestRecord,
  deleteAttendanceRecord,
  deleteFollowUpRecord,
  deleteMemberCommunicationRecord,
  deletePastoralCareNoteRecord,
  deletePrayerRequestRecord,
  getAttendanceRecordById,
  getAttendanceRecords,
  getCareAccess,
  getCareDashboardWidgets,
  getFollowUpById,
  getFollowUpDashboardCounts,
  getFollowUps,
  getMemberActivityTimeline,
  getMemberAttendanceSummary,
  getMemberCommunicationById,
  getMemberCommunications,
  getPastoralCareNoteById,
  getPastoralCareNotes,
  getPrayerRequestById,
  getPrayerRequests,
  getStaffUserOptions,
  markFollowUpComplete,
  markFollowUpInProgress,
  markPrayerRequestAnswered,
  markPrayerRequestInPrayer,
  reopenFollowUp,
  reopenPastoralCareNote,
  resolvePastoralCareNote,
  setPrayerRequestPublicVisibilityRecord,
  updateAttendanceRecord,
  updateFollowUpRecord,
  updateMemberCommunicationRecord,
  updatePastoralCareNoteRecord,
  updatePrayerRequestRecord,
} from "@/server/services/care-engagement.service";

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

function revalidateCare(memberId?: string) {
  revalidatePath("/attendance");
  revalidatePath("/follow-ups");
  revalidatePath("/pastoral-care");
  revalidatePath("/prayer-requests");
  revalidatePath("/dashboard");
  if (memberId) {
    revalidatePath(`/member/${memberId}`);
  }
}

export async function createAttendanceAction(formData: FormData) {
  await requireAuth();
  const parsed = attendanceSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    attendanceDate: String(formData.get("attendanceDate") ?? ""),
    serviceName: String(formData.get("serviceName") ?? ""),
    attendanceType: String(formData.get("attendanceType") ?? "PRESENT"),
    checkInTime: String(formData.get("checkInTime") ?? ""),
    checkOutTime: String(formData.get("checkOutTime") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  const record = await createAttendanceRecord(parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Attendance saved.", id: record.id };
}

export async function updateAttendanceAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = attendanceSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    attendanceDate: String(formData.get("attendanceDate") ?? ""),
    serviceName: String(formData.get("serviceName") ?? ""),
    attendanceType: String(formData.get("attendanceType") ?? "PRESENT"),
    checkInTime: String(formData.get("checkInTime") ?? ""),
    checkOutTime: String(formData.get("checkOutTime") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  await updateAttendanceRecord(id, parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Attendance updated." };
}

export async function deleteAttendanceAction(id: string, memberId?: string) {
  await requireAuth();
  const actor = await getActor();
  await deleteAttendanceRecord(id, actor);
  revalidateCare(memberId);
}

export async function createFollowUpAction(formData: FormData) {
  await requireAuth();
  const parsed = followUpSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    followUpType: String(formData.get("followUpType") ?? "GENERAL"),
    status: String(formData.get("status") ?? "OPEN"),
    priority: String(formData.get("priority") ?? "NORMAL"),
    assignedToUserId: String(formData.get("assignedToUserId") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    outcome: String(formData.get("outcome") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  const record = await createFollowUpRecord(parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Follow-up created.", id: record.id };
}

export async function updateFollowUpAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = followUpSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    followUpType: String(formData.get("followUpType") ?? "GENERAL"),
    status: String(formData.get("status") ?? "OPEN"),
    priority: String(formData.get("priority") ?? "NORMAL"),
    assignedToUserId: String(formData.get("assignedToUserId") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    outcome: String(formData.get("outcome") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  await updateFollowUpRecord(id, parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Follow-up updated." };
}

export async function markFollowUpInProgressAction(id: string, memberId?: string) {
  await requireAuth();
  await markFollowUpInProgress(id, await getActor());
  revalidateCare(memberId);
}

export async function markFollowUpCompleteAction(id: string, memberId?: string) {
  await requireAuth();
  await markFollowUpComplete(id, await getActor());
  revalidateCare(memberId);
}

export async function reopenFollowUpAction(id: string, memberId?: string) {
  await requireAuth();
  await reopenFollowUp(id, await getActor());
  revalidateCare(memberId);
}

export async function deleteFollowUpAction(id: string, memberId?: string) {
  await requireAuth();
  await deleteFollowUpRecord(id, await getActor());
  revalidateCare(memberId);
}

export async function createPastoralCareAction(formData: FormData) {
  await requireAuth();
  const parsed = pastoralCareSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    category: String(formData.get("category") ?? "GENERAL"),
    title: String(formData.get("title") ?? ""),
    note: String(formData.get("note") ?? ""),
    isConfidential: formData.get("isConfidential") === "true",
    assignedPastorUserId: String(formData.get("assignedPastorUserId") ?? ""),
    followUpDate: String(formData.get("followUpDate") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  const record = await createPastoralCareNoteRecord(parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Pastoral care note created.", id: record.id };
}

export async function updatePastoralCareAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = pastoralCareSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    category: String(formData.get("category") ?? "GENERAL"),
    title: String(formData.get("title") ?? ""),
    note: String(formData.get("note") ?? ""),
    isConfidential: formData.get("isConfidential") === "true",
    assignedPastorUserId: String(formData.get("assignedPastorUserId") ?? ""),
    followUpDate: String(formData.get("followUpDate") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  await updatePastoralCareNoteRecord(id, parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Pastoral care note updated." };
}

export async function resolvePastoralCareAction(id: string, memberId?: string) {
  await requireAuth();
  await resolvePastoralCareNote(id, await getActor());
  revalidateCare(memberId);
}

export async function reopenPastoralCareAction(id: string, memberId?: string) {
  await requireAuth();
  await reopenPastoralCareNote(id, await getActor());
  revalidateCare(memberId);
}

export async function deletePastoralCareAction(id: string, memberId?: string) {
  await requireAuth();
  await deletePastoralCareNoteRecord(id, await getActor());
  revalidateCare(memberId);
}

export async function createPrayerRequestAction(formData: FormData) {
  await requireAuth();
  const parsed = prayerRequestSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    requesterName: String(formData.get("requesterName") ?? ""),
    request: String(formData.get("request") ?? ""),
    status: String(formData.get("status") ?? "ACTIVE"),
    privacyLevel: String(formData.get("privacyLevel") ?? "PRAYER_TEAM"),
    assignedToUserId: String(formData.get("assignedToUserId") ?? ""),
    answerNotes: String(formData.get("answerNotes") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  const record = await createPrayerRequestRecord(parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Prayer request created.", id: record.id };
}

export async function updatePrayerRequestAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = prayerRequestSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    requesterName: String(formData.get("requesterName") ?? ""),
    request: String(formData.get("request") ?? ""),
    status: String(formData.get("status") ?? "ACTIVE"),
    privacyLevel: String(formData.get("privacyLevel") ?? "PRAYER_TEAM"),
    assignedToUserId: String(formData.get("assignedToUserId") ?? ""),
    answerNotes: String(formData.get("answerNotes") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  await updatePrayerRequestRecord(id, parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Prayer request updated." };
}

export async function markPrayerInPrayerAction(id: string, memberId?: string) {
  await requireAuth();
  await markPrayerRequestInPrayer(id, await getActor());
  revalidateCare(memberId);
}

export async function markPrayerAnsweredAction(id: string, memberId?: string) {
  await requireAuth();
  await markPrayerRequestAnswered(id, await getActor());
  revalidateCare(memberId);
}

export async function archivePrayerRequestAction(id: string, memberId?: string) {
  await requireAuth();
  await archivePrayerRequest(id, await getActor());
  revalidateCare(memberId);
}

export async function setPrayerRequestPublicVisibilityAction(
  id: string,
  isPublic: boolean,
) {
  await requireAuth();
  await setPrayerRequestPublicVisibilityRecord(id, isPublic, await getActor());
  revalidatePath("/");
  revalidatePath("/prayer-requests");
  revalidatePath(`/prayer-requests/${id}`);
}

export async function deletePrayerRequestAction(id: string, memberId?: string) {
  await requireAuth();
  await deletePrayerRequestRecord(id, await getActor());
  revalidateCare(memberId);
}

export async function createCommunicationAction(formData: FormData) {
  await requireAuth();
  const parsed = communicationSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    communicationType: String(formData.get("communicationType") ?? "PHONE"),
    direction: String(formData.get("direction") ?? "OUTBOUND"),
    subject: String(formData.get("subject") ?? ""),
    messageSummary: String(formData.get("messageSummary") ?? ""),
    communicationDate: String(formData.get("communicationDate") ?? ""),
    outcome: String(formData.get("outcome") ?? ""),
    followUpRequired: formData.get("followUpRequired") === "true",
    followUpDate: String(formData.get("followUpDate") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  const record = await createMemberCommunicationRecord(parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Communication logged.", id: record.id };
}

export async function updateCommunicationAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = communicationSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    communicationType: String(formData.get("communicationType") ?? "PHONE"),
    direction: String(formData.get("direction") ?? "OUTBOUND"),
    subject: String(formData.get("subject") ?? ""),
    messageSummary: String(formData.get("messageSummary") ?? ""),
    communicationDate: String(formData.get("communicationDate") ?? ""),
    outcome: String(formData.get("outcome") ?? ""),
    followUpRequired: formData.get("followUpRequired") === "true",
    followUpDate: String(formData.get("followUpDate") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error" as const, message: "Please correct the form.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await getActor();
  await updateMemberCommunicationRecord(id, parsed.data, actor);
  revalidateCare(parsed.data.memberId);
  return { status: "success" as const, message: "Communication updated." };
}

export async function deleteCommunicationAction(id: string, memberId?: string) {
  await requireAuth();
  await deleteMemberCommunicationRecord(id, await getActor());
  revalidateCare(memberId);
}

export async function createFollowUpFromCommunicationAction(
  communicationId: string,
  memberId?: string,
) {
  await requireAuth();
  const followUp = await createFollowUpFromCommunication(
    communicationId,
    await getActor(),
  );
  revalidateCare(memberId);
  return followUp;
}

export {
  getAttendanceRecordById,
  getAttendanceRecords,
  getCareAccess,
  getCareDashboardWidgets,
  getFollowUpById,
  getFollowUpDashboardCounts,
  getFollowUps,
  getMemberActivityTimeline,
  getMemberAttendanceSummary,
  getMemberCommunicationById,
  getMemberCommunications,
  getPastoralCareNoteById,
  getPastoralCareNotes,
  getPrayerRequestById,
  getPrayerRequests,
  getStaffUserOptions,
};

export async function getOrganizationIdForCare() {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new Error("Organization not found.");
  return organization.id;
}
