import type {
  MemberRecordStatus,
  MembershipStatus,
} from "@/app/generated/prisma/client";
import {
  buildMemberAuditChanges,
  buildMemberAuditSnapshot,
  type MemberInput,
} from "@/lib/validation/member";
import {
  createAuditEvent,
  findEntityAuditEvents,
} from "@/server/repositories/audit-event.repository";
import {
  clearMemberHouseholdLinks,
  createMember,
  deleteMember,
  findMemberById,
  findMemberHouseholdUnits,
  findMemberOptions,
  findMembers,
  findMembersPage,
  updateMember,
  upsertMemberHouseholdLink,
} from "@/server/repositories/member.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

function parseDate(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function mapInputToPersistence(input: MemberInput, organizationId: string) {
  return {
    organizationId,
    firstName: input.firstName,
    middleName: input.middleName ?? null,
    lastName: input.lastName,
    preferredName: input.preferredName ?? null,
    suffix: input.suffix ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    alternatePhone: input.alternatePhone ?? null,
    dateOfBirth: parseDate(input.dateOfBirth),
    gender: input.gender ?? null,
    maritalStatus: input.maritalStatus ?? null,
    membershipStatus: input.membershipStatus,
    memberSince: parseDate(input.memberSince),
    baptismDate: parseDate(input.baptismDate),
    salvationDate: parseDate(input.salvationDate),
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? "US",
    notes: input.notes ?? null,
  };
}

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    throw new Error("Organization not found. Configure organization settings first.");
  }

  return organization.id;
}

async function syncHouseholdLink(
  organizationId: string,
  memberId: string,
  householdId?: string,
) {
  await clearMemberHouseholdLinks(memberId);

  if (householdId) {
    await upsertMemberHouseholdLink(organizationId, memberId, householdId);
  }
}

async function recordMemberAudit(
  organizationId: string,
  actorUserAccountId: string | null,
  actorEmail: string | null,
  action: string,
  entityId: string,
  previous: Record<string, string | null> | null,
  next: Record<string, string | null> | null,
) {
  const changes =
    previous && next ? buildMemberAuditChanges(previous, next) : [];

  await createAuditEvent({
    organizationId,
    actorUserAccountId,
    action,
    entityType: "Member",
    entityId,
    changes:
      changes.length > 0
        ? changes
        : [
            {
              field: "actorEmail",
              oldValue: null,
              newValue: actorEmail,
            },
          ],
  });
}

export async function getMembers(filters: {
  search?: string;
  membershipStatus?: MembershipStatus;
  householdId?: string;
  recordStatus?: MemberRecordStatus;
  includeArchived?: boolean;
  includeDeceased?: boolean;
  doNotContact?: boolean;
  directoryOptOut?: boolean;
  allowEmail?: boolean;
  allowSms?: boolean;
  allowPhoneCalls?: boolean;
  allowPostalMail?: boolean;
  page?: number;
  pageSize?: number;
  paginate?: boolean;
}) {
  const organizationId = await getOrganizationId();

  if (filters.paginate !== false && (filters.page != null || filters.pageSize != null || filters.paginate === true)) {
    return findMembersPage({
      organizationId,
      ...filters,
    });
  }

  // Unpaginated full rows — used by export and legacy callers.
  return findMembers({
    organizationId,
    ...filters,
  });
}

export async function getMembersDirectoryPage(filters: {
  search?: string;
  membershipStatus?: MembershipStatus;
  householdId?: string;
  recordStatus?: MemberRecordStatus;
  includeArchived?: boolean;
  includeDeceased?: boolean;
  doNotContact?: boolean;
  directoryOptOut?: boolean;
  allowEmail?: boolean;
  allowSms?: boolean;
  allowPhoneCalls?: boolean;
  allowPostalMail?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const organizationId = await getOrganizationId();
  return findMembersPage({ organizationId, ...filters });
}

export async function getMemberSelectOptions() {
  const organizationId = await getOrganizationId();
  return findMemberOptions(organizationId);
}

export async function getMemberById(id: string) {
  const organizationId = await getOrganizationId();
  return findMemberById(organizationId, id);
}

export async function getMemberHouseholdOptions() {
  const organizationId = await getOrganizationId();
  return findMemberHouseholdUnits(organizationId);
}

export async function createMemberRecord(
  input: MemberInput,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const data = mapInputToPersistence(input, organizationId);
  const member = await createMember(data);

  if (input.householdId) {
    await syncHouseholdLink(organizationId, member.id, input.householdId);
  }

  const saved = await findMemberById(organizationId, member.id);

  if (saved) {
    await recordMemberAudit(
      organizationId,
      actor.userAccountId,
      actor.email,
      "CREATE",
      saved.id,
      null,
      buildMemberAuditSnapshot(saved),
    );
  }

  return saved ?? member;
}

export async function updateMemberRecord(
  id: string,
  input: MemberInput,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const existing = await findMemberById(organizationId, id);

  if (!existing) {
    throw new Error("Member not found.");
  }

  const previousSnapshot = buildMemberAuditSnapshot(existing);
  const persistence = mapInputToPersistence(input, organizationId);
  const {
    organizationId: omittedOrganizationId,
    ...data
  } = persistence;
  void omittedOrganizationId;

  await updateMember(id, organizationId, data);
  await syncHouseholdLink(organizationId, id, input.householdId);

  const saved = await findMemberById(organizationId, id);

  if (saved) {
    await recordMemberAudit(
      organizationId,
      actor.userAccountId,
      actor.email,
      "UPDATE",
      saved.id,
      previousSnapshot,
      buildMemberAuditSnapshot(saved),
    );
  }

  return saved;
}

export async function getMemberAuditEvents(memberId: string) {
  const organizationId = await getOrganizationId();
  return findEntityAuditEvents(organizationId, "Member", memberId);
}

export async function deleteMemberRecord(
  id: string,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const existing = await findMemberById(organizationId, id);

  if (!existing) {
    throw new Error("Member not found.");
  }

  const previousSnapshot = buildMemberAuditSnapshot(existing);
  await deleteMember(id, organizationId);

  await recordMemberAudit(
    organizationId,
    actor.userAccountId,
    actor.email,
    "DELETE",
    id,
    previousSnapshot,
    null,
  );
}
