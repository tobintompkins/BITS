import type { DuplicateCandidateStatus } from "@/app/generated/prisma/client";
import {
  getMemberLifecycleAccess,
  requireLifecyclePermission,
} from "@/lib/auth/member-lifecycle-permissions";
import {
  DUPLICATE_SCAN_MEMBER_CAP,
  runDuplicateScanJob,
} from "@/lib/members/duplicate-scan-runner";
import { buildSafeAuditChanges } from "@/lib/validation/member-lifecycle";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  createDuplicateCandidate,
  findDuplicateCandidateById,
  findDuplicateCandidates,
  findExistingDuplicatePairKeys,
  findMemberSafeComparison,
  findMembersForDuplicateScan,
  getLifecycleDashboardCounts,
  updateDuplicateCandidateStatus,
} from "@/server/repositories/member-lifecycle.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import type { DuplicateScoreInput } from "@/lib/members/duplicate-scoring";

type Actor = { userAccountId: string | null; email: string | null };

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new Error("Organization not found.");
  return organization.id;
}

async function audit(
  organizationId: string,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
) {
  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action,
    entityType,
    entityId,
    changes:
      changes.length > 0
        ? changes
        : [{ field: "actorEmail", oldValue: null, newValue: actor.email }],
  });
}

function toScoreInput(
  member: Awaited<ReturnType<typeof findMembersForDuplicateScan>>[number],
): DuplicateScoreInput {
  return {
    id: member.id,
    firstName: member.firstName,
    lastName: member.lastName,
    preferredName: member.preferredName,
    email: member.email,
    phone: member.phone,
    alternatePhone: member.alternatePhone,
    dateOfBirth: member.dateOfBirth,
    addressLine1: member.addressLine1,
    city: member.city,
    state: member.state,
    postalCode: member.postalCode,
    recordStatus: member.recordStatus,
    householdIds: member.householdLinks.map((link) => link.householdId),
  };
}

export async function runMemberDuplicateScan(
  actor: Actor,
  options?: { includeArchived?: boolean },
) {
  const organizationId = await getOrganizationId();
  const access = await requireLifecyclePermission(
    organizationId,
    (a) => a.canRunDuplicateScan,
    "You do not have permission to run duplicate scans.",
  );

  await audit(
    organizationId,
    actor,
    "DUPLICATE_SCAN_STARTED",
    "MemberDuplicateCandidate",
    organizationId,
    buildSafeAuditChanges({
      includeArchived: Boolean(options?.includeArchived),
      actorEmail: actor.email,
    }),
  );

  // Fetch one extra row to detect truncation without a separate count query.
  const rawMembers = await findMembersForDuplicateScan(organizationId, {
    includeArchived: Boolean(options?.includeArchived && access.canViewArchived),
    take: DUPLICATE_SCAN_MEMBER_CAP + 1,
  });

  const existingPairKeys = await findExistingDuplicatePairKeys(organizationId);
  const scoreInputs = rawMembers.map(toScoreInput);

  const jobResult = runDuplicateScanJob({
    members: scoreInputs,
    existingPairKeys,
    memberCap: DUPLICATE_SCAN_MEMBER_CAP,
  });

  let created = 0;
  for (const candidate of jobResult.candidates) {
    await createDuplicateCandidate({
      organizationId,
      memberAId: candidate.memberAId,
      memberBId: candidate.memberBId,
      matchScore: candidate.matchScore,
      matchReasons: candidate.matchReasons,
    });
    created += 1;
  }

  await audit(
    organizationId,
    actor,
    "DUPLICATE_SCAN_COMPLETED",
    "MemberDuplicateCandidate",
    organizationId,
    buildSafeAuditChanges({
      created,
      skippedExisting: jobResult.skippedExisting,
      membersScanned: jobResult.membersScanned,
      truncated: jobResult.truncated,
    }),
  );

  return {
    created,
    skippedExisting: jobResult.skippedExisting,
    belowThreshold: jobResult.belowThreshold,
    membersScanned: jobResult.membersScanned,
    truncated: jobResult.truncated,
    message: jobResult.message,
  };
}

export async function getDuplicateCandidates(filters: {
  status?: DuplicateCandidateStatus;
  search?: string;
  highConfidenceOnly?: boolean;
  page?: number;
}) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canReviewDuplicates,
    "You do not have permission to review duplicates.",
  );

  const page = filters.page ?? 1;
  const take = 25;
  return findDuplicateCandidates({
    organizationId,
    status: filters.status,
    search: filters.search,
    highConfidenceOnly: filters.highConfidenceOnly,
    take,
    skip: (page - 1) * take,
  });
}

export async function getDuplicateCandidateById(id: string) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canReviewDuplicates,
    "You do not have permission to review duplicates.",
  );

  const candidate = await findDuplicateCandidateById(organizationId, id);
  if (!candidate) return null;

  const [sideA, sideB] = await Promise.all([
    findMemberSafeComparison(organizationId, candidate.memberAId),
    findMemberSafeComparison(organizationId, candidate.memberBId),
  ]);

  return {
    candidate: {
      id: candidate.id,
      matchScore: candidate.matchScore,
      matchReasons: candidate.matchReasons as string[],
      status: candidate.status,
      createdAt: candidate.createdAt,
      reviewedAt: candidate.reviewedAt,
      reviewedBy: candidate.reviewedBy,
    },
    memberA: sideA,
    memberB: sideB,
  };
}

async function setCandidateStatus(
  id: string,
  status: DuplicateCandidateStatus,
  actor: Actor,
  auditAction: string,
) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canReviewDuplicates,
    "You do not have permission to review duplicates.",
  );

  const updated = await updateDuplicateCandidateStatus(id, organizationId, {
    status,
    reviewedByUserId: actor.userAccountId,
    reviewedAt: new Date(),
  });

  await audit(
    organizationId,
    actor,
    auditAction,
    "MemberDuplicateCandidate",
    id,
    buildSafeAuditChanges({ status, actorEmail: actor.email }),
  );

  return updated;
}

export async function confirmDuplicateCandidate(id: string, actor: Actor) {
  return setCandidateStatus(id, "CONFIRMED_DUPLICATE", actor, "DUPLICATE_CONFIRMED");
}

export async function markCandidateNotDuplicate(id: string, actor: Actor) {
  return setCandidateStatus(id, "NOT_DUPLICATE", actor, "DUPLICATE_NOT_DUPLICATE");
}

export async function dismissDuplicateCandidate(id: string, actor: Actor) {
  return setCandidateStatus(id, "DISMISSED", actor, "DUPLICATE_DISMISSED");
}

export async function reopenDuplicateCandidate(id: string, actor: Actor) {
  return setCandidateStatus(id, "PENDING", actor, "DUPLICATE_REOPENED");
}

export async function getDuplicateReviewSummary() {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canReviewDuplicates,
    "You do not have permission to review duplicates.",
  );
  return getLifecycleDashboardCounts(organizationId);
}

export async function getMemberLifecycleAccessForOrg() {
  const organizationId = await getOrganizationId();
  return getMemberLifecycleAccess(organizationId);
}
