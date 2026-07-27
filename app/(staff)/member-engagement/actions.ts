"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import {
  memberDocumentMetadataSchema,
  memberInterestSchema,
  memberMilestoneSchema,
  memberMinistrySchema,
  memberSkillSchema,
  memberSpiritualGiftSchema,
  ministrySchema,
  spiritualGiftSchema,
} from "@/lib/validation/member-engagement";
import {
  addMemberToMinistry,
  assignSpiritualGiftToMember,
  createMemberInterestRecord,
  createMemberMilestoneRecord,
  createMemberSkillRecord,
  createMinistryRecord,
  createSpiritualGiftRecord,
  deleteMemberDocumentRecord,
  deleteMemberInterestRecord,
  deleteMemberMilestoneRecord,
  deleteMemberSkillRecord,
  deleteMinistryRecord,
  deleteSpiritualGiftRecord,
  exportMinistryRosterCsv,
  exportSkillsDirectoryCsv,
  exportSpiritualGiftAssignmentsCsv,
  getEngagementDashboardWidgets,
  getMemberDocumentById,
  getMemberDocuments,
  getMemberEngagementAccess,
  getMemberEngagementProfileData,
  getMemberInterests,
  getMemberMilestoneById,
  getMemberMilestones,
  getMemberSkills,
  getMinistries,
  getMinistryById,
  getSpiritualGifts,
  removeMemberFromMinistry,
  removeMemberSpiritualGift,
  removeMilestoneDocument,
  replaceMemberDocument,
  searchMembersBySkillQuery,
  setMemberAsMinistryLeaderRecord,
  setPrimaryMemberSpiritualGiftRecord,
  toggleSpiritualGiftActive,
  updateMemberDocumentMetadata,
  updateMemberInterestRecord,
  updateMemberMilestoneRecord,
  updateMemberMinistryRecord,
  updateMemberSkillRecord,
  updateMemberSpiritualGiftRecord,
  updateMinistryRecord,
  updateSpiritualGiftRecord,
  uploadMemberDocumentRecord,
  uploadMilestoneDocument,
} from "@/server/services/member-engagement.service";

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

function formBool(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function revalidateEngagement(memberId?: string) {
  revalidatePath("/ministries");
  revalidatePath("/members/skills");
  revalidatePath("/settings/spiritual-gifts");
  revalidatePath("/dashboard");
  if (memberId) {
    revalidatePath(`/member/${memberId}`);
  }
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function createMemberMilestoneAction(formData: FormData) {
  await requireAuth();
  const parsed = memberMilestoneSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    milestoneType: String(formData.get("milestoneType") ?? ""),
    title: String(formData.get("title") ?? ""),
    milestoneDate: String(formData.get("milestoneDate") ?? ""),
    location: String(formData.get("location") ?? ""),
    officiant: String(formData.get("officiant") ?? ""),
    certificateNumber: String(formData.get("certificateNumber") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    syncMemberDates: formBool(formData, "syncMemberDates"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const record = await createMemberMilestoneRecord(parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Milestone saved.", id: record.id };
}

export async function updateMemberMilestoneAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = memberMilestoneSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    milestoneType: String(formData.get("milestoneType") ?? ""),
    title: String(formData.get("title") ?? ""),
    milestoneDate: String(formData.get("milestoneDate") ?? ""),
    location: String(formData.get("location") ?? ""),
    officiant: String(formData.get("officiant") ?? ""),
    certificateNumber: String(formData.get("certificateNumber") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    syncMemberDates: formBool(formData, "syncMemberDates"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  await updateMemberMilestoneRecord(id, parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Milestone updated." };
}

export async function deleteMemberMilestoneAction(id: string, memberId?: string) {
  await requireAuth();
  await deleteMemberMilestoneRecord(id, await getActor());
  revalidateEngagement(memberId);
}

export async function uploadMilestoneDocumentAction(id: string, formData: FormData) {
  await requireAuth();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error" as const, message: "A document file is required." };
  }
  const memberId = String(formData.get("memberId") ?? "");
  await uploadMilestoneDocument(id, file, await getActor());
  revalidateEngagement(memberId || undefined);
  return { status: "success" as const, message: "Document attached." };
}

export async function removeMilestoneDocumentAction(id: string, memberId?: string) {
  await requireAuth();
  await removeMilestoneDocument(id, await getActor());
  revalidateEngagement(memberId);
}

// ---------------------------------------------------------------------------
// Spiritual gifts
// ---------------------------------------------------------------------------

export async function createSpiritualGiftAction(formData: FormData) {
  await requireAuth();
  const parsed = spiritualGiftSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    isActive: formData.has("isActive") ? formBool(formData, "isActive") : true,
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const record = await createSpiritualGiftRecord(parsed.data, await getActor());
  revalidateEngagement();
  return { status: "success" as const, message: "Gift created.", id: record.id };
}

export async function updateSpiritualGiftAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = spiritualGiftSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    isActive: formBool(formData, "isActive"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  await updateSpiritualGiftRecord(id, parsed.data, await getActor());
  revalidateEngagement();
  return { status: "success" as const, message: "Gift updated." };
}

export async function deleteSpiritualGiftAction(id: string) {
  await requireAuth();
  await deleteSpiritualGiftRecord(id, await getActor());
  revalidateEngagement();
}

export async function toggleSpiritualGiftActiveAction(id: string, isActive: boolean) {
  await requireAuth();
  await toggleSpiritualGiftActive(id, isActive, await getActor());
  revalidateEngagement();
}

export async function assignSpiritualGiftAction(formData: FormData) {
  await requireAuth();
  const parsed = memberSpiritualGiftSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    spiritualGiftId: String(formData.get("spiritualGiftId") ?? ""),
    proficiencyLevel: String(formData.get("proficiencyLevel") ?? "DISCOVERING"),
    isPrimary: formBool(formData, "isPrimary"),
    notes: String(formData.get("notes") ?? ""),
    identifiedDate: String(formData.get("identifiedDate") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const record = await assignSpiritualGiftToMember(parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Gift assigned.", id: record.id };
}

export async function updateMemberSpiritualGiftAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = memberSpiritualGiftSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    spiritualGiftId: String(formData.get("spiritualGiftId") ?? ""),
    proficiencyLevel: String(formData.get("proficiencyLevel") ?? "DISCOVERING"),
    isPrimary: formBool(formData, "isPrimary"),
    notes: String(formData.get("notes") ?? ""),
    identifiedDate: String(formData.get("identifiedDate") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  await updateMemberSpiritualGiftRecord(id, parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Gift assignment updated." };
}

export async function removeMemberSpiritualGiftAction(id: string, memberId?: string) {
  await requireAuth();
  await removeMemberSpiritualGift(id, await getActor());
  revalidateEngagement(memberId);
}

export async function setPrimaryMemberSpiritualGiftAction(
  id: string,
  memberId?: string,
) {
  await requireAuth();
  await setPrimaryMemberSpiritualGiftRecord(id, await getActor());
  revalidateEngagement(memberId);
}

// ---------------------------------------------------------------------------
// Ministries
// ---------------------------------------------------------------------------

export async function createMinistryAction(formData: FormData) {
  await requireAuth();
  const parsed = ministrySchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    ministryType: String(formData.get("ministryType") ?? ""),
    leaderUserId: String(formData.get("leaderUserId") ?? ""),
    isActive: formData.get("isActive") === null ? true : formBool(formData, "isActive"),
    meetingSchedule: String(formData.get("meetingSchedule") ?? ""),
    location: String(formData.get("location") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const record = await createMinistryRecord(parsed.data, await getActor());
  revalidateEngagement();
  return { status: "success" as const, message: "Ministry created.", id: record.id };
}

export async function updateMinistryAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = ministrySchema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    ministryType: String(formData.get("ministryType") ?? ""),
    leaderUserId: String(formData.get("leaderUserId") ?? ""),
    isActive: formBool(formData, "isActive"),
    meetingSchedule: String(formData.get("meetingSchedule") ?? ""),
    location: String(formData.get("location") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  await updateMinistryRecord(id, parsed.data, await getActor());
  revalidateEngagement();
  revalidatePath(`/ministries/${id}`);
  return { status: "success" as const, message: "Ministry updated." };
}

export async function deleteMinistryAction(
  id: string,
  options?: { forceArchive?: boolean; deactivate?: boolean },
) {
  await requireAuth();
  const result = await deleteMinistryRecord(id, await getActor(), options);
  revalidateEngagement();
  return result;
}

export async function addMemberToMinistryAction(formData: FormData) {
  await requireAuth();
  const parsed = memberMinistrySchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    ministryId: String(formData.get("ministryId") ?? ""),
    role: String(formData.get("role") ?? "VOLUNTEER"),
    status: String(formData.get("status") ?? "ACTIVE"),
    joinedDate: String(formData.get("joinedDate") ?? ""),
    endedDate: String(formData.get("endedDate") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    isLeader: formBool(formData, "isLeader"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const record = await addMemberToMinistry(parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  revalidatePath(`/ministries/${parsed.data.ministryId}`);
  return { status: "success" as const, message: "Member added to ministry.", id: record.id };
}

export async function updateMemberMinistryAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = memberMinistrySchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    ministryId: String(formData.get("ministryId") ?? ""),
    role: String(formData.get("role") ?? "VOLUNTEER"),
    status: String(formData.get("status") ?? "ACTIVE"),
    joinedDate: String(formData.get("joinedDate") ?? ""),
    endedDate: String(formData.get("endedDate") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    isLeader: formBool(formData, "isLeader"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  await updateMemberMinistryRecord(id, parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  revalidatePath(`/ministries/${parsed.data.ministryId}`);
  return { status: "success" as const, message: "Ministry assignment updated." };
}

export async function removeMemberFromMinistryAction(
  id: string,
  memberId?: string,
  ministryId?: string,
) {
  await requireAuth();
  await removeMemberFromMinistry(id, await getActor());
  revalidateEngagement(memberId);
  if (ministryId) revalidatePath(`/ministries/${ministryId}`);
}

export async function setMemberAsMinistryLeaderAction(
  id: string,
  memberId?: string,
  ministryId?: string,
) {
  await requireAuth();
  await setMemberAsMinistryLeaderRecord(id, await getActor());
  revalidateEngagement(memberId);
  if (ministryId) revalidatePath(`/ministries/${ministryId}`);
}

// ---------------------------------------------------------------------------
// Skills & interests
// ---------------------------------------------------------------------------

export async function createMemberSkillAction(formData: FormData) {
  await requireAuth();
  const parsed = memberSkillSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    skillName: String(formData.get("skillName") ?? ""),
    skillCategory: String(formData.get("skillCategory") ?? ""),
    proficiencyLevel: String(formData.get("proficiencyLevel") ?? "BEGINNER"),
    yearsExperience: String(formData.get("yearsExperience") ?? ""),
    isAvailableToServe: formBool(formData, "isAvailableToServe"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const record = await createMemberSkillRecord(parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Skill saved.", id: record.id };
}

export async function updateMemberSkillAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = memberSkillSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    skillName: String(formData.get("skillName") ?? ""),
    skillCategory: String(formData.get("skillCategory") ?? ""),
    proficiencyLevel: String(formData.get("proficiencyLevel") ?? "BEGINNER"),
    yearsExperience: String(formData.get("yearsExperience") ?? ""),
    isAvailableToServe: formBool(formData, "isAvailableToServe"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  await updateMemberSkillRecord(id, parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Skill updated." };
}

export async function deleteMemberSkillAction(id: string, memberId?: string) {
  await requireAuth();
  await deleteMemberSkillRecord(id, await getActor());
  revalidateEngagement(memberId);
}

export async function createMemberInterestAction(formData: FormData) {
  await requireAuth();
  const parsed = memberInterestSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    interestName: String(formData.get("interestName") ?? ""),
    interestCategory: String(formData.get("interestCategory") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const record = await createMemberInterestRecord(parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Interest saved.", id: record.id };
}

export async function updateMemberInterestAction(id: string, formData: FormData) {
  await requireAuth();
  const parsed = memberInterestSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    interestName: String(formData.get("interestName") ?? ""),
    interestCategory: String(formData.get("interestCategory") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  await updateMemberInterestRecord(id, parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Interest updated." };
}

export async function deleteMemberInterestAction(id: string, memberId?: string) {
  await requireAuth();
  await deleteMemberInterestRecord(id, await getActor());
  revalidateEngagement(memberId);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadMemberDocumentAction(formData: FormData) {
  await requireAuth();
  const { userId } = await auth();
  await assertActionAllowed("member.document_upload", userId);
  const parsed = memberDocumentMetadataSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    documentType: String(formData.get("documentType") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    isConfidential: formBool(formData, "isConfidential"),
    expirationDate: String(formData.get("expirationDate") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error" as const, message: "A document file is required." };
  }
  const record = await uploadMemberDocumentRecord(
    parsed.data,
    file,
    await getActor(),
  );
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Document uploaded.", id: record.id };
}

export async function updateMemberDocumentMetadataAction(
  id: string,
  formData: FormData,
) {
  await requireAuth();
  const parsed = memberDocumentMetadataSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    documentType: String(formData.get("documentType") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    isConfidential: formBool(formData, "isConfidential"),
    expirationDate: String(formData.get("expirationDate") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  await updateMemberDocumentMetadata(id, parsed.data, await getActor());
  revalidateEngagement(parsed.data.memberId);
  return { status: "success" as const, message: "Document updated." };
}

export async function replaceMemberDocumentAction(id: string, formData: FormData) {
  await requireAuth();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error" as const, message: "A document file is required." };
  }
  const memberId = String(formData.get("memberId") ?? "");
  await replaceMemberDocument(id, file, await getActor());
  revalidateEngagement(memberId || undefined);
  return { status: "success" as const, message: "Document replaced." };
}

export async function deleteMemberDocumentAction(id: string, memberId?: string) {
  await requireAuth();
  await deleteMemberDocumentRecord(id, await getActor());
  revalidateEngagement(memberId);
}

// ---------------------------------------------------------------------------
// Query re-exports for pages
// ---------------------------------------------------------------------------

export async function exportMinistryRosterCsvAction(ministryId: string) {
  await requireAuth();
  return exportMinistryRosterCsv(ministryId);
}

export async function exportSkillsDirectoryCsvAction(filters?: {
  skillName?: string;
  availableToServeOnly?: boolean;
}) {
  await requireAuth();
  return exportSkillsDirectoryCsv(filters);
}

export async function exportSpiritualGiftAssignmentsCsvAction() {
  await requireAuth();
  return exportSpiritualGiftAssignmentsCsv();
}

export {
  exportMinistryRosterCsv,
  exportSkillsDirectoryCsv,
  exportSpiritualGiftAssignmentsCsv,
  getEngagementDashboardWidgets,
  getMemberDocumentById,
  getMemberDocuments,
  getMemberEngagementAccess,
  getMemberEngagementProfileData,
  getMemberInterests,
  getMemberMilestoneById,
  getMemberMilestones,
  getMemberSkills,
  getMinistries,
  getMinistryById,
  getSpiritualGifts,
  searchMembersBySkillQuery,
};
