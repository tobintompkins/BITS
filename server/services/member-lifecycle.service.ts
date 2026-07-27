import type {
  ConsentChangeSource,
  MemberConsentType,
  PreferredContactMethod,
} from "@/app/generated/prisma/client";
import {
  getMemberLifecycleAccess,
  requireLifecyclePermission,
} from "@/lib/auth/member-lifecycle-permissions";
import { buildSafeAuditChanges } from "@/lib/validation/member-lifecycle";
import type {
  ArchiveMemberInput,
  CommunicationPreferencesInput,
  MarkDeceasedInput,
  RestoreMemberInput,
} from "@/lib/validation/member-lifecycle";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  createConsentHistoryEntry,
  findConsentHistory,
  findMemberCommunicationPreferences,
  findMembersByRecordStatus,
  getLifecycleDashboardCounts,
  updateMemberLifecycleFields,
} from "@/server/repositories/member-lifecycle.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";
import { prisma } from "@/lib/db/prisma";

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

function parseDate(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function archiveMember(input: ArchiveMemberInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canArchive,
    "You do not have permission to archive members.",
  );

  const member = await updateMemberLifecycleFields(input.memberId, organizationId, {
    recordStatus: "ARCHIVED",
    archivedAt: parseDate(input.archiveDate) ?? new Date(),
    archivedByUserId: actor.userAccountId,
    archiveReason: input.archiveReason,
  });

  await audit(
    organizationId,
    actor,
    "MEMBER_ARCHIVED",
    "Member",
    input.memberId,
    buildSafeAuditChanges({
      archiveReason: input.archiveReason,
      notes: input.notes,
      actorEmail: actor.email,
    }),
  );

  return member;
}

export async function restoreMember(input: RestoreMemberInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canRestore,
    "You do not have permission to restore members.",
  );

  const member = await updateMemberLifecycleFields(input.memberId, organizationId, {
    recordStatus: input.restoreToStatus,
    archivedAt: null,
    archivedByUserId: null,
    archiveReason: null,
  });

  await audit(
    organizationId,
    actor,
    "MEMBER_RESTORED",
    "Member",
    input.memberId,
    buildSafeAuditChanges({
      restoreToStatus: input.restoreToStatus,
      actorEmail: actor.email,
    }),
  );

  return member;
}

export async function markMemberInactive(
  input: { memberId: string; reason?: string },
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canMarkInactive,
    "You do not have permission to mark members inactive.",
  );

  const member = await updateMemberLifecycleFields(input.memberId, organizationId, {
    recordStatus: "INACTIVE",
    membershipStatus: "INACTIVE",
  });

  await audit(
    organizationId,
    actor,
    "MEMBER_MARKED_INACTIVE",
    "Member",
    input.memberId,
    buildSafeAuditChanges({ reason: input.reason, actorEmail: actor.email }),
  );

  return member;
}

export async function markMemberActive(memberId: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canMarkInactive,
    "You do not have permission to mark members active.",
  );

  const member = await updateMemberLifecycleFields(memberId, organizationId, {
    recordStatus: "ACTIVE",
  });

  await audit(
    organizationId,
    actor,
    "MEMBER_RETURNED_ACTIVE",
    "Member",
    memberId,
    buildSafeAuditChanges({ actorEmail: actor.email }),
  );

  return member;
}

export async function markMemberDeceased(input: MarkDeceasedInput, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canMarkDeceased,
    "You do not have permission to mark members deceased.",
  );

  if (!input.confirmCommunicationRemoval || !input.confirmDirectoryRemoval) {
    throw new Error(
      "Confirm communication and directory removal before marking deceased.",
    );
  }

  const now = new Date();
  const member = await updateMemberLifecycleFields(input.memberId, organizationId, {
    recordStatus: "DECEASED",
    membershipStatus: "DECEASED",
    deceasedDate: parseDate(input.deceasedDate),
    deceasedNotes: input.deceasedNotes ?? null,
    allowEmail: false,
    allowSms: false,
    allowPhoneCalls: false,
    allowPostalMail: false,
    allowDirectoryListing: false,
    allowPhotoUse: false,
    preferredContactMethod: "DO_NOT_CONTACT",
    emailOptOutDate: now,
    smsOptOutDate: now,
    directoryOptOutDate: now,
    photoOptOutDate: now,
    consentUpdatedAt: now,
    consentUpdatedByUserId: actor.userAccountId,
  });

  const consentTypes: MemberConsentType[] = [
    "EMAIL",
    "SMS",
    "PHONE_CALLS",
    "POSTAL_MAIL",
    "DIRECTORY_LISTING",
    "PHOTO_USE",
    "GENERAL_COMMUNICATION",
  ];
  for (const consentType of consentTypes) {
    await createConsentHistoryEntry({
      memberId: input.memberId,
      consentType,
      previousValue: "true",
      newValue: "false",
      source: "ADMINISTRATIVE",
      notes: "Marked deceased — communications disabled",
      changedByUserId: actor.userAccountId,
    });
  }

  await audit(
    organizationId,
    actor,
    "MEMBER_MARKED_DECEASED",
    "Member",
    input.memberId,
    buildSafeAuditChanges({
      deceasedDate: input.deceasedDate,
      actorEmail: actor.email,
    }),
  );

  return member;
}

export async function getMemberCommunicationPreferences(memberId: string) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canViewLifecycle || a.canManagePreferences,
    "You do not have permission to view communication preferences.",
  );
  return findMemberCommunicationPreferences(organizationId, memberId);
}

export async function updateMemberCommunicationPreferences(
  input: CommunicationPreferencesInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canManagePreferences,
    "You do not have permission to manage communication preferences.",
  );

  const existing = await findMemberCommunicationPreferences(
    organizationId,
    input.memberId,
  );
  if (!existing) throw new Error("Member not found.");

  const now = new Date();
  const isDoNotContact = input.preferredContactMethod === "DO_NOT_CONTACT";

  const next = {
    preferredContactMethod: (input.preferredContactMethod ??
      null) as PreferredContactMethod | null,
    allowEmail: isDoNotContact ? false : input.allowEmail,
    allowSms: isDoNotContact ? false : input.allowSms,
    allowPhoneCalls: isDoNotContact ? false : input.allowPhoneCalls,
    allowPostalMail: isDoNotContact ? false : input.allowPostalMail,
    allowDirectoryListing: isDoNotContact ? false : input.allowDirectoryListing,
    allowPhotoUse: isDoNotContact ? false : input.allowPhotoUse,
  };

  const flagMap: Array<{
    key: keyof typeof next;
    consentType: MemberConsentType;
    previous: boolean;
    next: boolean;
    optOutField?: "emailOptOutDate" | "smsOptOutDate" | "directoryOptOutDate" | "photoOptOutDate";
  }> = [
    {
      key: "allowEmail",
      consentType: "EMAIL",
      previous: existing.allowEmail,
      next: next.allowEmail,
      optOutField: "emailOptOutDate",
    },
    {
      key: "allowSms",
      consentType: "SMS",
      previous: existing.allowSms,
      next: next.allowSms,
      optOutField: "smsOptOutDate",
    },
    {
      key: "allowPhoneCalls",
      consentType: "PHONE_CALLS",
      previous: existing.allowPhoneCalls,
      next: next.allowPhoneCalls,
    },
    {
      key: "allowPostalMail",
      consentType: "POSTAL_MAIL",
      previous: existing.allowPostalMail,
      next: next.allowPostalMail,
    },
    {
      key: "allowDirectoryListing",
      consentType: "DIRECTORY_LISTING",
      previous: existing.allowDirectoryListing,
      next: next.allowDirectoryListing,
      optOutField: "directoryOptOutDate",
    },
    {
      key: "allowPhotoUse",
      consentType: "PHOTO_USE",
      previous: existing.allowPhotoUse,
      next: next.allowPhotoUse,
      optOutField: "photoOptOutDate",
    },
  ];

  const optOutUpdates: Record<string, Date | null> = {};
  for (const flag of flagMap) {
    if (flag.previous === flag.next) continue;
    await createConsentHistoryEntry({
      memberId: input.memberId,
      consentType: flag.consentType,
      previousValue: String(flag.previous),
      newValue: String(flag.next),
      source: (input.source ?? "STAFF_UPDATE") as ConsentChangeSource,
      notes: input.notes ?? null,
      changedByUserId: actor.userAccountId,
    });
    if (flag.optOutField) {
      optOutUpdates[flag.optOutField] = flag.next ? null : now;
    }
  }

  if (existing.preferredContactMethod !== next.preferredContactMethod) {
    await createConsentHistoryEntry({
      memberId: input.memberId,
      consentType: "GENERAL_COMMUNICATION",
      previousValue: existing.preferredContactMethod,
      newValue: next.preferredContactMethod ?? "NO_PREFERENCE",
      source: (input.source ?? "STAFF_UPDATE") as ConsentChangeSource,
      notes: input.notes ?? null,
      changedByUserId: actor.userAccountId,
    });
  }

  if (isDoNotContact) {
    optOutUpdates.emailOptOutDate = now;
    optOutUpdates.smsOptOutDate = now;
    optOutUpdates.directoryOptOutDate = now;
    optOutUpdates.photoOptOutDate = now;
  }

  const member = await updateMemberLifecycleFields(input.memberId, organizationId, {
    ...next,
    ...optOutUpdates,
    consentUpdatedAt: now,
    consentUpdatedByUserId: actor.userAccountId,
  });

  await audit(
    organizationId,
    actor,
    isDoNotContact ? "DO_NOT_CONTACT_SET" : "COMMUNICATION_PREFERENCE_CHANGED",
    "Member",
    input.memberId,
    buildSafeAuditChanges({
      preferredContactMethod: next.preferredContactMethod,
      allowEmail: next.allowEmail,
      allowSms: next.allowSms,
      allowPhoneCalls: next.allowPhoneCalls,
      allowPostalMail: next.allowPostalMail,
      allowDirectoryListing: next.allowDirectoryListing,
      allowPhotoUse: next.allowPhotoUse,
      actorEmail: actor.email,
    }),
  );

  return member;
}

export async function getMemberConsentHistory(memberId: string) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canViewConsentHistory,
    "You do not have permission to view consent history.",
  );

  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: { id: true },
  });
  if (!member) throw new Error("Member not found.");

  return findConsentHistory(memberId);
}

export async function recordMemberConsentChange(
  input: {
    memberId: string;
    consentType: MemberConsentType;
    previousValue: string | null;
    newValue: string;
    source: ConsentChangeSource;
    notes?: string;
  },
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canManagePreferences || a.canCorrectConsentHistory,
    "You do not have permission to record consent changes.",
  );

  const entry = await createConsentHistoryEntry({
    ...input,
    changedByUserId: actor.userAccountId,
  });

  await audit(
    organizationId,
    actor,
    "CONSENT_CHANGED",
    "MemberConsentHistory",
    entry.id,
    buildSafeAuditChanges({
      consentType: input.consentType,
      newValue: input.newValue,
      actorEmail: actor.email,
    }),
  );

  return entry;
}

export async function getArchivedMembers() {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canViewArchived,
    "You do not have permission to view archived members.",
  );
  return findMembersByRecordStatus(organizationId, "ARCHIVED");
}

export async function getDeceasedMembers() {
  const organizationId = await getOrganizationId();
  await requireLifecyclePermission(
    organizationId,
    (a) => a.canViewDeceased,
    "You do not have permission to view deceased members.",
  );
  return findMembersByRecordStatus(organizationId, "DECEASED");
}

export async function getMemberLifecycleSummary(memberId: string) {
  const organizationId = await getOrganizationId();
  const access = await getMemberLifecycleAccess(organizationId);

  const member = await prisma.member.findFirst({
    where: { id: memberId, organizationId },
    select: {
      id: true,
      recordStatus: true,
      archivedAt: true,
      archiveReason: true,
      deceasedDate: true,
      deceasedNotes: true,
      preferredContactMethod: true,
      allowEmail: true,
      allowSms: true,
      allowPhoneCalls: true,
      allowPostalMail: true,
      allowDirectoryListing: true,
      allowPhotoUse: true,
      mergedIntoMemberId: true,
      mergedAt: true,
      emailOptOutDate: true,
      smsOptOutDate: true,
      directoryOptOutDate: true,
    },
  });

  if (!member) return null;

  return { member, access };
}

export async function getLifecycleDashboardWidgets() {
  const organizationId = await getOrganizationId();
  const access = await getMemberLifecycleAccess(organizationId);
  const counts = await getLifecycleDashboardCounts(organizationId);

  return {
    access,
    widgets: [
      access.canReviewDuplicates
        ? {
            key: "pendingDuplicates",
            label: "Pending Duplicate Reviews",
            count: counts.pendingDuplicates,
            href: "/members/duplicates?status=PENDING",
          }
        : null,
      access.canReviewDuplicates
        ? {
            key: "highConfidenceDuplicates",
            label: "High-Confidence Duplicates",
            count: counts.highConfidenceDuplicates,
            href: "/members/duplicates?highConfidence=1",
          }
        : null,
      access.canViewArchived
        ? {
            key: "archivedMembers",
            label: "Archived Members",
            count: counts.archivedMembers,
            href: "/members?recordStatus=ARCHIVED",
          }
        : null,
      access.canViewLifecycle
        ? {
            key: "inactiveMembers",
            label: "Inactive Records",
            count: counts.inactiveMembers,
            href: "/members?recordStatus=INACTIVE",
          }
        : null,
      access.canManagePreferences
        ? {
            key: "directoryOptOuts",
            label: "Directory Opt-Outs",
            count: counts.directoryOptOuts,
            href: "/members?directoryOptOut=1",
          }
        : null,
      access.canManagePreferences
        ? {
            key: "emailOptOuts",
            label: "Email Opt-Outs",
            count: counts.emailOptOuts,
            href: "/members?allowEmail=0",
          }
        : null,
    ],
  };
}
