import {
  buildHouseholdAuditChanges,
  buildHouseholdAuditSnapshot,
  type HouseholdInput,
  linkMemberToHouseholdSchema,
  updateMemberHouseholdRelationshipSchema,
} from "@/lib/validation/household";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  clearPrimaryContactIfMember,
  clearOtherMemberHouseholdLinks,
  createHousehold,
  deleteHousehold,
  findHouseholdById,
  findHouseholds,
  findMemberByIdForHousehold,
  findMemberHouseholdLink,
  linkMemberToHouseholdRecord,
  removeMemberFromHouseholdRecord,
  setHouseholdPrimaryContactRecord,
  updateHousehold,
  updateMemberHouseholdRelationshipRecord,
} from "@/server/repositories/household.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();

  if (!organization) {
    throw new Error("Organization not found. Configure organization settings first.");
  }

  return organization.id;
}

function mapInputToPersistence(input: HouseholdInput, organizationId: string) {
  return {
    organizationId,
    householdName: input.householdName,
    primaryContactId: input.primaryContactId ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? "US",
  };
}

async function recordHouseholdAudit(
  organizationId: string,
  actor: { userAccountId: string | null; email: string | null },
  action: string,
  entityId: string,
  previous: Record<string, string | null> | null,
  next: Record<string, string | null> | null,
) {
  const changes =
    previous && next ? buildHouseholdAuditChanges(previous, next) : [];

  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action,
    entityType: "Household",
    entityId,
    changes:
      changes.length > 0
        ? changes
        : [
            {
              field: "actorEmail",
              oldValue: null,
              newValue: actor.email,
            },
          ],
  });
}

async function validatePrimaryContact(
  organizationId: string,
  primaryContactId?: string,
) {
  if (!primaryContactId) {
    return;
  }

  const member = await findMemberByIdForHousehold(organizationId, primaryContactId);

  if (!member) {
    throw new Error("Primary contact must be an existing member.");
  }
}

export async function getHouseholds(filters: { search?: string }) {
  const organizationId = await getOrganizationId();
  return findHouseholds({ organizationId, ...filters });
}

export async function getHouseholdById(id: string) {
  const organizationId = await getOrganizationId();
  return findHouseholdById(organizationId, id);
}

export async function createHouseholdRecord(
  input: HouseholdInput,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  await validatePrimaryContact(organizationId, input.primaryContactId);

  const data = mapInputToPersistence(input, organizationId);
  const household = await createHousehold(data);
  const saved = await findHouseholdById(organizationId, household.id);

  if (saved) {
    await recordHouseholdAudit(
      organizationId,
      actor,
      "CREATE",
      saved.id,
      null,
      buildHouseholdAuditSnapshot(saved),
    );
  }

  return saved ?? household;
}

export async function updateHouseholdRecord(
  id: string,
  input: HouseholdInput,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const existing = await findHouseholdById(organizationId, id);

  if (!existing) {
    throw new Error("Household not found.");
  }

  await validatePrimaryContact(organizationId, input.primaryContactId);

  const previousSnapshot = buildHouseholdAuditSnapshot(existing);
  const persistence = mapInputToPersistence(input, organizationId);
  const { organizationId: omittedOrganizationId, ...data } = persistence;
  void omittedOrganizationId;

  await updateHousehold(id, organizationId, data);
  const saved = await findHouseholdById(organizationId, id);

  if (saved) {
    await recordHouseholdAudit(
      organizationId,
      actor,
      "UPDATE",
      saved.id,
      previousSnapshot,
      buildHouseholdAuditSnapshot(saved),
    );
  }

  return saved;
}

export async function deleteHouseholdRecord(
  id: string,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const existing = await findHouseholdById(organizationId, id);

  if (!existing) {
    throw new Error("Household not found.");
  }

  const previousSnapshot = buildHouseholdAuditSnapshot(existing);
  await deleteHousehold(id, organizationId);

  await recordHouseholdAudit(
    organizationId,
    actor,
    "DELETE",
    id,
    previousSnapshot,
    null,
  );
}

export async function linkMemberToHousehold(
  input: unknown,
  actor: { userAccountId: string | null; email: string | null },
) {
  const parsed = linkMemberToHouseholdSchema.parse(input);
  const organizationId = await getOrganizationId();

  const member = await findMemberByIdForHousehold(organizationId, parsed.memberId);

  if (!member) {
    throw new Error("Member not found.");
  }

  const household = await findHouseholdById(organizationId, parsed.householdId);

  if (!household) {
    throw new Error("Household not found.");
  }

  await clearOtherMemberHouseholdLinks(
    organizationId,
    parsed.memberId,
    parsed.householdId,
  );

  const link = await linkMemberToHouseholdRecord({
    organizationId,
    ...parsed,
  });

  await recordHouseholdAudit(
    organizationId,
    actor,
    "LINK_MEMBER",
    parsed.householdId,
    null,
    {
      memberId: parsed.memberId,
      relationshipToHousehold: parsed.relationshipToHousehold,
      linkId: link.id,
    },
  );

  return link;
}

export async function removeMemberFromHousehold(
  memberId: string,
  householdId: string,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const existing = await findMemberHouseholdLink(organizationId, memberId, householdId);

  if (!existing) {
    throw new Error("Household link not found.");
  }

  await removeMemberFromHouseholdRecord(organizationId, memberId, householdId);
  await clearPrimaryContactIfMember(organizationId, householdId, memberId);

  await recordHouseholdAudit(
    organizationId,
    actor,
    "REMOVE_MEMBER",
    householdId,
    {
      memberId,
      relationshipToHousehold: existing.relationshipToHousehold,
    },
    null,
  );
}

export async function setHouseholdPrimaryContact(
  householdId: string,
  memberId: string,
  actor: { userAccountId: string | null; email: string | null },
) {
  const organizationId = await getOrganizationId();
  const household = await findHouseholdById(organizationId, householdId);

  if (!household) {
    throw new Error("Household not found.");
  }

  const link = await findMemberHouseholdLink(organizationId, memberId, householdId);

  if (!link) {
    throw new Error("Member is not linked to this household.");
  }

  const saved = await setHouseholdPrimaryContactRecord(
    organizationId,
    householdId,
    memberId,
  );

  await recordHouseholdAudit(
    organizationId,
    actor,
    "SET_PRIMARY_CONTACT",
    householdId,
    { primaryContactId: household.primaryContactId },
    { primaryContactId: memberId },
  );

  return saved;
}

export async function updateMemberHouseholdRelationship(
  input: unknown,
  actor: { userAccountId: string | null; email: string | null },
) {
  const parsed = updateMemberHouseholdRelationshipSchema.parse(input);
  const organizationId = await getOrganizationId();
  const existing = await findMemberHouseholdLink(
    organizationId,
    parsed.memberId,
    parsed.householdId,
  );

  if (!existing) {
    throw new Error("Household link not found.");
  }

  const link = await updateMemberHouseholdRelationshipRecord({
    organizationId,
    ...parsed,
  });

  await recordHouseholdAudit(
    organizationId,
    actor,
    "UPDATE_RELATIONSHIP",
    parsed.householdId,
    { relationshipToHousehold: existing.relationshipToHousehold },
    { relationshipToHousehold: parsed.relationshipToHousehold },
  );

  return link;
}
