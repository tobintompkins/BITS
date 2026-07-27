import {
  buildEmergencyContactAuditChanges,
  buildEmergencyContactAuditSnapshot,
  type EmergencyContactInput,
} from "@/lib/validation/emergency-contact";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  clearPrimaryEmergencyContacts,
  createEmergencyContact,
  deleteEmergencyContact,
  findEmergencyContactById,
  findEmergencyContactsByMemberId,
  setPrimaryEmergencyContact,
  updateEmergencyContact,
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

async function recordEmergencyContactAudit(
  organizationId: string,
  actor: { userAccountId: string | null; email: string | null },
  action: string,
  entityId: string,
  memberId: string,
  previous: Record<string, string | null> | null,
  next: Record<string, string | null> | null,
) {
  const changes =
    previous && next ? buildEmergencyContactAuditChanges(previous, next) : [];

  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action,
    entityType: "MemberEmergencyContact",
    entityId,
    changes:
      changes.length > 0
        ? [
            ...changes,
            {
              field: "memberId",
              oldValue: null,
              newValue: memberId,
            },
          ]
        : [
            {
              field: "memberId",
              oldValue: null,
              newValue: memberId,
            },
            {
              field: "actorEmail",
              oldValue: null,
              newValue: actor.email,
            },
          ],
  });
}

async function ensureMemberExists(organizationId: string, memberId: string) {
  const member = await findMemberById(organizationId, memberId);

  if (!member) {
    throw new Error("Member not found.");
  }

  return member;
}

export async function getEmergencyContacts(memberId: string) {
  const organizationId = await getOrganizationId();
  await ensureMemberExists(organizationId, memberId);
  return findEmergencyContactsByMemberId(organizationId, memberId);
}

export async function createEmergencyContactRecord(
  memberId: string,
  input: EmergencyContactInput,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  await ensureMemberExists(organizationId, memberId);

  if (input.isPrimary) {
    await clearPrimaryEmergencyContacts(memberId);
  }

  const contact = await createEmergencyContact({
    memberId,
    name: input.name,
    relationship: input.relationship,
    phone: input.phone,
    email: input.email ?? null,
    isPrimary: input.isPrimary ?? false,
    notes: input.notes ?? null,
  });

  await recordEmergencyContactAudit(
    organizationId,
    actor,
    "CREATE",
    contact.id,
    memberId,
    null,
    buildEmergencyContactAuditSnapshot(contact),
  );

  return contact;
}

export async function updateEmergencyContactRecord(
  memberId: string,
  contactId: string,
  input: EmergencyContactInput,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  await ensureMemberExists(organizationId, memberId);

  const existing = await findEmergencyContactById(organizationId, contactId);

  if (!existing || existing.memberId !== memberId) {
    throw new Error("Emergency contact not found.");
  }

  if (input.isPrimary) {
    await clearPrimaryEmergencyContacts(memberId);
  }

  const previousSnapshot = buildEmergencyContactAuditSnapshot(existing);
  const contact = await updateEmergencyContact(contactId, memberId, {
    name: input.name,
    relationship: input.relationship,
    phone: input.phone,
    email: input.email ?? null,
    isPrimary: input.isPrimary ?? false,
    notes: input.notes ?? null,
  });

  await recordEmergencyContactAudit(
    organizationId,
    actor,
    "UPDATE",
    contact.id,
    memberId,
    previousSnapshot,
    buildEmergencyContactAuditSnapshot(contact),
  );

  return contact;
}

export async function deleteEmergencyContactRecord(
  memberId: string,
  contactId: string,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const existing = await findEmergencyContactById(organizationId, contactId);

  if (!existing || existing.memberId !== memberId) {
    throw new Error("Emergency contact not found.");
  }

  const previousSnapshot = buildEmergencyContactAuditSnapshot(existing);
  await deleteEmergencyContact(contactId, memberId);

  await recordEmergencyContactAudit(
    organizationId,
    actor,
    "DELETE",
    contactId,
    memberId,
    previousSnapshot,
    null,
  );
}

export async function setPrimaryEmergencyContactRecord(
  memberId: string,
  contactId: string,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const existing = await findEmergencyContactById(organizationId, contactId);

  if (!existing || existing.memberId !== memberId) {
    throw new Error("Emergency contact not found.");
  }

  const contact = await setPrimaryEmergencyContact(contactId, memberId);

  await recordEmergencyContactAudit(
    organizationId,
    actor,
    "SET_PRIMARY",
    contactId,
    memberId,
    { isPrimary: String(existing.isPrimary) },
    { isPrimary: "true" },
  );

  return contact;
}
