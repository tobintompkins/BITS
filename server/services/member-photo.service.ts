import {
  getMemberPhotoPublicUrl,
  removeMemberPhotoFile,
  saveMemberPhoto,
} from "@/lib/storage/member-photo";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  findMemberPhotoFields,
  updateMemberPhoto,
} from "@/server/repositories/emergency-contact.repository";
import { findMemberById } from "@/server/repositories/member.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    throw new Error("Organization not found. Configure organization settings first.");
  }

  return organization.id;
}

async function recordPhotoAudit(
  organizationId: string,
  actor: { userAccountId: string | null; email: string | null },
  action: string,
  memberId: string,
  previous: Record<string, string | null>,
  next: Record<string, string | null>,
) {
  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action,
    entityType: "Member",
    entityId: memberId,
    changes: [
      {
        field: "profilePhotoUrl",
        oldValue: previous.profilePhotoUrl,
        newValue: next.profilePhotoUrl,
      },
      {
        field: "profilePhotoKey",
        oldValue: previous.profilePhotoKey,
        newValue: next.profilePhotoKey,
      },
      {
        field: "actorEmail",
        oldValue: null,
        newValue: actor.email,
      },
    ],
  });
}

export function resolveMemberPhotoUrl(member: {
  profilePhotoUrl: string | null;
  profilePhotoKey: string | null;
}) {
  return getMemberPhotoPublicUrl(member.profilePhotoKey, member.profilePhotoUrl);
}

export async function uploadMemberPhoto(
  memberId: string,
  file: File,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const member = await findMemberPhotoFields(organizationId, memberId);

  if (!member) {
    throw new Error("Member not found.");
  }

  const previous = {
    profilePhotoUrl: member.profilePhotoUrl,
    profilePhotoKey: member.profilePhotoKey,
  };

  await removeMemberPhotoFile(member.profilePhotoKey);

  const saved = await saveMemberPhoto(organizationId, memberId, file);

  await updateMemberPhoto(memberId, organizationId, {
    profilePhotoUrl: saved.publicUrl,
    profilePhotoKey: saved.storageKey,
  });

  const next = {
    profilePhotoUrl: saved.publicUrl,
    profilePhotoKey: saved.storageKey,
  };

  await recordPhotoAudit(organizationId, actor, "PHOTO_UPLOAD", memberId, previous, next);

  return saved.publicUrl;
}

export async function removeMemberPhoto(
  memberId: string,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const member = await findMemberPhotoFields(organizationId, memberId);

  if (!member) {
    throw new Error("Member not found.");
  }

  const previous = {
    profilePhotoUrl: member.profilePhotoUrl,
    profilePhotoKey: member.profilePhotoKey,
  };

  await removeMemberPhotoFile(member.profilePhotoKey);
  await updateMemberPhoto(memberId, organizationId, {
    profilePhotoUrl: null,
    profilePhotoKey: null,
  });

  await recordPhotoAudit(
    organizationId,
    actor,
    "PHOTO_REMOVE",
    memberId,
    previous,
    { profilePhotoUrl: null, profilePhotoKey: null },
  );
}

export async function getMemberWithPhoto(memberId: string) {
  const organizationId = await getOrganizationId();
  const member = await findMemberById(organizationId, memberId);

  if (!member) {
    return null;
  }

  return {
    ...member,
    photoUrl: resolveMemberPhotoUrl(member),
  };
}
