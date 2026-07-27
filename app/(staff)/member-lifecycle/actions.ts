"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import type { DuplicateCandidateStatus } from "@/app/generated/prisma/client";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { actionError, actionSuccess } from "@/lib/actions/action-result";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import {
  archiveMemberSchema,
  communicationPreferencesSchema,
  executeMergeSchema,
  markDeceasedSchema,
  markInactiveSchema,
  restoreMemberSchema,
} from "@/lib/validation/member-lifecycle";
import {
  confirmDuplicateCandidate,
  dismissDuplicateCandidate,
  getDuplicateCandidateById,
  getDuplicateCandidates,
  getDuplicateReviewSummary,
  getMemberLifecycleAccessForOrg,
  markCandidateNotDuplicate,
  reopenDuplicateCandidate,
  runMemberDuplicateScan,
} from "@/server/services/member-duplicate.service";
import {
  archiveMember,
  getArchivedMembers,
  getDeceasedMembers,
  getLifecycleDashboardWidgets,
  getMemberCommunicationPreferences,
  getMemberConsentHistory,
  getMemberLifecycleSummary,
  markMemberActive,
  markMemberDeceased,
  markMemberInactive,
  restoreMember,
  updateMemberCommunicationPreferences,
} from "@/server/services/member-lifecycle.service";
import {
  executeMemberMerge,
  getMemberMergeHistory,
  getMergedMemberRedirect,
  prepareMemberMerge,
  validateMemberMerge,
} from "@/server/services/member-merge.service";

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

function revalidateLifecycle(memberId?: string) {
  revalidatePath("/members");
  revalidatePath("/members/duplicates");
  revalidatePath("/members/merge");
  revalidatePath("/dashboard");
  if (memberId) {
    revalidatePath(`/member/${memberId}`);
  }
}

export async function archiveMemberAction(formData: FormData) {
  await requireAuth();
  const parsed = archiveMemberSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    archiveReason: String(formData.get("archiveReason") ?? ""),
    archiveDate: String(formData.get("archiveDate") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const actor = await getActor();
  await archiveMember(parsed.data, actor);
  revalidateLifecycle(parsed.data.memberId);
  return { status: "success" as const, message: "Member archived." };
}

export async function restoreMemberAction(formData: FormData) {
  await requireAuth();
  const parsed = restoreMemberSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    restoreToStatus: String(formData.get("restoreToStatus") ?? "ACTIVE"),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const actor = await getActor();
  await restoreMember(parsed.data, actor);
  revalidateLifecycle(parsed.data.memberId);
  return { status: "success" as const, message: "Member restored." };
}

export async function markMemberInactiveAction(formData: FormData) {
  await requireAuth();
  const parsed = markInactiveSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const actor = await getActor();
  await markMemberInactive(parsed.data, actor);
  revalidateLifecycle(parsed.data.memberId);
  return { status: "success" as const, message: "Member marked inactive." };
}

export async function markMemberActiveAction(formData: FormData) {
  await requireAuth();
  const memberId = String(formData.get("memberId") ?? "");
  if (!memberId) {
    return { status: "error" as const, message: "Member is required." };
  }
  const actor = await getActor();
  await markMemberActive(memberId, actor);
  revalidateLifecycle(memberId);
  return { status: "success" as const, message: "Member marked active." };
}

export async function markMemberDeceasedAction(formData: FormData) {
  await requireAuth();
  const parsed = markDeceasedSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    deceasedDate: String(formData.get("deceasedDate") ?? ""),
    deceasedNotes: String(formData.get("deceasedNotes") ?? ""),
    confirmCommunicationRemoval:
      formData.get("confirmCommunicationRemoval") === "on" ||
      formData.get("confirmCommunicationRemoval") === "true",
    confirmDirectoryRemoval:
      formData.get("confirmDirectoryRemoval") === "on" ||
      formData.get("confirmDirectoryRemoval") === "true",
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const actor = await getActor();
  await markMemberDeceased(parsed.data, actor);
  revalidateLifecycle(parsed.data.memberId);
  return { status: "success" as const, message: "Member marked deceased." };
}

export async function updateCommunicationPreferencesAction(formData: FormData) {
  await requireAuth();
  const parsed = communicationPreferencesSchema.safeParse({
    memberId: String(formData.get("memberId") ?? ""),
    preferredContactMethod: String(formData.get("preferredContactMethod") ?? "") || null,
    allowEmail: formData.get("allowEmail") === "on" || formData.get("allowEmail") === "true",
    allowSms: formData.get("allowSms") === "on" || formData.get("allowSms") === "true",
    allowPhoneCalls:
      formData.get("allowPhoneCalls") === "on" ||
      formData.get("allowPhoneCalls") === "true",
    allowPostalMail:
      formData.get("allowPostalMail") === "on" ||
      formData.get("allowPostalMail") === "true",
    allowDirectoryListing:
      formData.get("allowDirectoryListing") === "on" ||
      formData.get("allowDirectoryListing") === "true",
    allowPhotoUse:
      formData.get("allowPhotoUse") === "on" ||
      formData.get("allowPhotoUse") === "true",
    source: String(formData.get("source") ?? "STAFF_UPDATE"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error" as const,
      message: "Please correct the form.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const actor = await getActor();
  await updateMemberCommunicationPreferences(parsed.data, actor);
  revalidateLifecycle(parsed.data.memberId);
  return { status: "success" as const, message: "Preferences saved." };
}

export async function runDuplicateScanAction(formData?: FormData) {
  await requireAuth();
  const { userId } = await auth();
  await assertActionAllowed("member.duplicate_scan", userId);
  const includeArchived =
    formData?.get("includeArchived") === "on" ||
    formData?.get("includeArchived") === "true";
  const actor = await getActor();
  const result = await runMemberDuplicateScan(actor, { includeArchived });
  revalidateLifecycle();
  return actionSuccess(result.message ?? "Scan complete.", result);
}

export async function confirmDuplicateAction(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("candidateId") ?? "");
  const actor = await getActor();
  await confirmDuplicateCandidate(id, actor);
  revalidateLifecycle();
  revalidatePath(`/members/duplicates/${id}`);
  return { status: "success" as const, message: "Marked as confirmed duplicate." };
}

export async function dismissDuplicateAction(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("candidateId") ?? "");
  const actor = await getActor();
  await dismissDuplicateCandidate(id, actor);
  revalidateLifecycle();
  revalidatePath(`/members/duplicates/${id}`);
  return { status: "success" as const, message: "Candidate dismissed." };
}

export async function markNotDuplicateAction(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("candidateId") ?? "");
  const actor = await getActor();
  await markCandidateNotDuplicate(id, actor);
  revalidateLifecycle();
  revalidatePath(`/members/duplicates/${id}`);
  return { status: "success" as const, message: "Marked as not a duplicate." };
}

export async function reopenDuplicateAction(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("candidateId") ?? "");
  const actor = await getActor();
  await reopenDuplicateCandidate(id, actor);
  revalidateLifecycle();
  revalidatePath(`/members/duplicates/${id}`);
  return { status: "success" as const, message: "Candidate reopened." };
}

export async function executeMergeAction(formData: FormData) {
  await requireAuth();
  const { userId } = await auth();
  await assertActionAllowed("member.merge", userId);
  let fieldSelections: Record<string, string> = {};
  try {
    fieldSelections = JSON.parse(String(formData.get("fieldSelections") ?? "{}"));
  } catch {
    return actionError("Invalid field selections.");
  }

  const parsed = executeMergeSchema.safeParse({
    primaryMemberId: String(formData.get("primaryMemberId") ?? ""),
    duplicateMemberId: String(formData.get("duplicateMemberId") ?? ""),
    fieldSelections,
    confirmationPhrase: String(formData.get("confirmationPhrase") ?? ""),
    mergeReason: String(formData.get("mergeReason") ?? ""),
    confirmArchivedPrimary:
      formData.get("confirmArchivedPrimary") === "on" ||
      formData.get("confirmArchivedPrimary") === "true",
  });
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Please correct the form.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const actor = await getActor();
  const result = await executeMemberMerge(parsed.data, actor);
  revalidateLifecycle(parsed.data.primaryMemberId);
  revalidateLifecycle(parsed.data.duplicateMemberId);
  return actionSuccess("Members merged successfully.", {
    mergeId: result.mergeRecord.id,
    primaryMemberId: result.primaryId,
  });
}

export {
  getArchivedMembers,
  getDeceasedMembers,
  getDuplicateCandidateById,
  getDuplicateCandidates,
  getDuplicateReviewSummary,
  getLifecycleDashboardWidgets,
  getMemberCommunicationPreferences,
  getMemberConsentHistory,
  getMemberLifecycleAccessForOrg,
  getMemberLifecycleSummary,
  getMemberMergeHistory,
  getMergedMemberRedirect,
  prepareMemberMerge,
  validateMemberMerge,
};

export async function getDuplicateCandidatesForPage(filters: {
  status?: string;
  search?: string;
  highConfidenceOnly?: boolean;
  page?: number;
}) {
  const status = filters.status as DuplicateCandidateStatus | undefined;
  return getDuplicateCandidates({
    status: status || undefined,
    search: filters.search,
    highConfidenceOnly: filters.highConfidenceOnly,
    page: filters.page,
  });
}
