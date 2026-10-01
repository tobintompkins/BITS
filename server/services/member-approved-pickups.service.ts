import { getEventAccess } from "@/lib/auth/event-permissions";
import { getMemberAccess } from "@/lib/auth/member-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import {
  MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS,
  approvedPickupIdSchema,
  approvedPickupIdentityKey,
  approvedPickupMemberIdSchema,
  approvedPickupWriteSchema,
  buildApprovedPickupAuditChanges,
  canAccessMemberApprovedPickups,
  toMemberApprovedPickupRow,
  type MemberApprovedPickupRow,
} from "@/lib/validation/member-approved-pickups";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  createApprovedPickup,
  deleteApprovedPickup,
  findApprovedPickupById,
  findApprovedPickupsByMemberId,
  findMemberIdInOrganization,
  updateApprovedPickup,
} from "@/server/repositories/member-approved-pickup.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberApprovedPickupsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "READY"; rows: MemberApprovedPickupRow[] };

export type MemberApprovedPickupMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID"; message: string }
  | { status: "NOT_FOUND" }
  | { status: "DUPLICATE" }
  | { status: "CREATED"; row: MemberApprovedPickupRow }
  | { status: "UPDATED"; row: MemberApprovedPickupRow }
  | { status: "DEACTIVATED"; row: MemberApprovedPickupRow }
  | { status: "REACTIVATED"; row: MemberApprovedPickupRow }
  | { status: "DELETED" };

function isUniqueConstraintError(error: unknown) {
  return (error as { code?: string }).code === "P2002";
}

async function requireApprovedPickupAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const [memberAccess, eventAccess] = await Promise.all([
    getMemberAccess(organization.id),
    getEventAccess(organization.id),
  ]);

  if (
    !canAccessMemberApprovedPickups({
      canViewMembers: memberAccess.canView,
      canEditMembers: memberAccess.canEdit,
      canManageCheckIn: eventAccess.canManageCheckIn,
    })
  ) {
    return { status: "UNAUTHORIZED" as const };
  }

  return {
    status: "READY" as const,
    userAccount,
    organization,
  };
}

async function resolveScopedMember(
  organizationId: string,
  memberId: string,
) {
  const parsedMemberId = approvedPickupMemberIdSchema.safeParse(memberId);
  if (!parsedMemberId.success) return { status: "INVALID" as const };

  const member = await findMemberIdInOrganization(
    organizationId,
    parsedMemberId.data,
  );
  if (!member) return { status: "NOT_FOUND" as const };

  return { status: "READY" as const, memberId: member.id };
}

function hasActiveDuplicate(
  rows: Array<{
    id: string;
    firstName: string;
    lastName: string;
    relationship: string;
    isActive: boolean;
  }>,
  input: { firstName: string; lastName: string; relationship: string },
  excludeId?: string,
) {
  const key = approvedPickupIdentityKey(
    input.firstName,
    input.lastName,
    input.relationship,
  );

  return rows.some(
    (row) =>
      row.isActive &&
      row.id !== excludeId &&
      approvedPickupIdentityKey(row.firstName, row.lastName, row.relationship) ===
        key,
  );
}

async function recordPickupAudit(input: {
  organizationId: string;
  actorUserAccountId: string | null;
  action: keyof typeof MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS;
  entityId: string;
  isActive?: boolean;
}) {
  await createAuditEvent({
    organizationId: input.organizationId,
    actorUserAccountId: input.actorUserAccountId,
    action: MEMBER_APPROVED_PICKUP_AUDIT_ACTIONS[input.action],
    entityType: "MemberApprovedPickup",
    entityId: input.entityId,
    changes: buildApprovedPickupAuditChanges({
      action: input.action,
      isActive: input.isActive,
    }),
  });
}

export async function getMemberApprovedPickups(
  memberId: string,
): Promise<MemberApprovedPickupsView> {
  const access = await requireApprovedPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const scoped = await resolveScopedMember(access.organization.id, memberId);
  if (scoped.status !== "READY") return { status: scoped.status };

  const rows = await findApprovedPickupsByMemberId(
    access.organization.id,
    scoped.memberId,
  );

  return {
    status: "READY",
    rows: rows.map(toMemberApprovedPickupRow),
  };
}

export async function createMemberApprovedPickup(
  memberId: string,
  input: unknown,
): Promise<MemberApprovedPickupMutationResult> {
  const access = await requireApprovedPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const scoped = await resolveScopedMember(access.organization.id, memberId);
  if (scoped.status === "INVALID") {
    return { status: "INVALID", message: "Member was not found." };
  }
  if (scoped.status !== "READY") return { status: scoped.status };

  const parsed = approvedPickupWriteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "INVALID",
      message:
        parsed.error.issues[0]?.message ?? "Please check the pickup person details.",
    };
  }

  const existing = await findApprovedPickupsByMemberId(
    access.organization.id,
    scoped.memberId,
  );
  if (hasActiveDuplicate(existing, parsed.data)) {
    return { status: "DUPLICATE" };
  }

  try {
    const created = await createApprovedPickup({
      organizationId: access.organization.id,
      memberId: scoped.memberId,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      relationship: parsed.data.relationship,
      isActive: true,
    });

    await recordPickupAudit({
      organizationId: access.organization.id,
      actorUserAccountId: access.userAccount.id,
      action: "CREATED",
      entityId: created.id,
      isActive: true,
    });

    return { status: "CREATED", row: toMemberApprovedPickupRow(created) };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "DUPLICATE" };
    }
    throw error;
  }
}

export async function updateMemberApprovedPickup(
  memberId: string,
  pickupId: string,
  input: unknown,
): Promise<MemberApprovedPickupMutationResult> {
  const access = await requireApprovedPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const scoped = await resolveScopedMember(access.organization.id, memberId);
  if (scoped.status === "INVALID") {
    return { status: "INVALID", message: "Member was not found." };
  }
  if (scoped.status !== "READY") return { status: scoped.status };

  const parsedId = approvedPickupIdSchema.safeParse(pickupId);
  if (!parsedId.success) return { status: "NOT_FOUND" };

  const parsed = approvedPickupWriteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "INVALID",
      message:
        parsed.error.issues[0]?.message ?? "Please check the pickup person details.",
    };
  }

  const existing = await findApprovedPickupById(
    access.organization.id,
    scoped.memberId,
    parsedId.data,
  );
  if (!existing) return { status: "NOT_FOUND" };

  const siblings = await findApprovedPickupsByMemberId(
    access.organization.id,
    scoped.memberId,
  );
  if (hasActiveDuplicate(siblings, parsed.data, existing.id) && existing.isActive) {
    return { status: "DUPLICATE" };
  }

  try {
    const updated = await updateApprovedPickup(
      access.organization.id,
      scoped.memberId,
      existing.id,
      {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        relationship: parsed.data.relationship,
      },
    );
    if (!updated) return { status: "NOT_FOUND" };

    await recordPickupAudit({
      organizationId: access.organization.id,
      actorUserAccountId: access.userAccount.id,
      action: "UPDATED",
      entityId: updated.id,
      isActive: updated.isActive,
    });

    return { status: "UPDATED", row: toMemberApprovedPickupRow(updated) };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "DUPLICATE" };
    }
    throw error;
  }
}

export async function deactivateMemberApprovedPickup(
  memberId: string,
  pickupId: string,
): Promise<MemberApprovedPickupMutationResult> {
  const access = await requireApprovedPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const scoped = await resolveScopedMember(access.organization.id, memberId);
  if (scoped.status !== "READY") {
    return scoped.status === "INVALID"
      ? { status: "INVALID", message: "Member was not found." }
      : { status: scoped.status };
  }

  const parsedId = approvedPickupIdSchema.safeParse(pickupId);
  if (!parsedId.success) return { status: "NOT_FOUND" };

  const existing = await findApprovedPickupById(
    access.organization.id,
    scoped.memberId,
    parsedId.data,
  );
  if (!existing) return { status: "NOT_FOUND" };

  const updated = await updateApprovedPickup(
    access.organization.id,
    scoped.memberId,
    existing.id,
    {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedByUserId: access.userAccount.id,
    },
  );
  if (!updated) return { status: "NOT_FOUND" };

  await recordPickupAudit({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "DEACTIVATED",
    entityId: updated.id,
    isActive: false,
  });

  return { status: "DEACTIVATED", row: toMemberApprovedPickupRow(updated) };
}

export async function reactivateMemberApprovedPickup(
  memberId: string,
  pickupId: string,
): Promise<MemberApprovedPickupMutationResult> {
  const access = await requireApprovedPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const scoped = await resolveScopedMember(access.organization.id, memberId);
  if (scoped.status !== "READY") {
    return scoped.status === "INVALID"
      ? { status: "INVALID", message: "Member was not found." }
      : { status: scoped.status };
  }

  const parsedId = approvedPickupIdSchema.safeParse(pickupId);
  if (!parsedId.success) return { status: "NOT_FOUND" };

  const existing = await findApprovedPickupById(
    access.organization.id,
    scoped.memberId,
    parsedId.data,
  );
  if (!existing) return { status: "NOT_FOUND" };

  const siblings = await findApprovedPickupsByMemberId(
    access.organization.id,
    scoped.memberId,
  );
  if (
    hasActiveDuplicate(
      siblings,
      {
        firstName: existing.firstName,
        lastName: existing.lastName,
        relationship: existing.relationship,
      },
      existing.id,
    )
  ) {
    return { status: "DUPLICATE" };
  }

  try {
    const updated = await updateApprovedPickup(
      access.organization.id,
      scoped.memberId,
      existing.id,
      {
        isActive: true,
        deactivatedAt: null,
        deactivatedByUserId: null,
      },
    );
    if (!updated) return { status: "NOT_FOUND" };

    await recordPickupAudit({
      organizationId: access.organization.id,
      actorUserAccountId: access.userAccount.id,
      action: "REACTIVATED",
      entityId: updated.id,
      isActive: true,
    });

    return { status: "REACTIVATED", row: toMemberApprovedPickupRow(updated) };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "DUPLICATE" };
    }
    throw error;
  }
}

export async function deleteMemberApprovedPickup(
  memberId: string,
  pickupId: string,
): Promise<MemberApprovedPickupMutationResult> {
  const access = await requireApprovedPickupAccess();
  if (access.status !== "READY") return { status: access.status };

  const scoped = await resolveScopedMember(access.organization.id, memberId);
  if (scoped.status !== "READY") {
    return scoped.status === "INVALID"
      ? { status: "INVALID", message: "Member was not found." }
      : { status: scoped.status };
  }

  const parsedId = approvedPickupIdSchema.safeParse(pickupId);
  if (!parsedId.success) return { status: "NOT_FOUND" };

  const existing = await findApprovedPickupById(
    access.organization.id,
    scoped.memberId,
    parsedId.data,
  );
  if (!existing) return { status: "NOT_FOUND" };

  const deleted = await deleteApprovedPickup(
    access.organization.id,
    scoped.memberId,
    existing.id,
  );
  if (!deleted) return { status: "NOT_FOUND" };

  await recordPickupAudit({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "DELETED",
    entityId: existing.id,
  });

  return { status: "DELETED" };
}
