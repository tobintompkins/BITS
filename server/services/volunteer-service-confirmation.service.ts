import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { parseVolunteerServiceConfirmation } from "@/lib/validation/volunteer-service-confirmation";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const UPCOMING_EVENT_STATUSES = ["DRAFT", "PUBLISHED"] as const;

export type ConfirmMemberVolunteerServiceResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "NOT_FOUND" }
  | {
      status: "CONFIRMED";
      alreadyConfirmed: boolean;
      confirmedAt: Date;
    };

function upcomingEventWhere(organizationId: string, now: Date) {
  return {
    organizationId,
    eventStatus: { in: [...UPCOMING_EVENT_STATUSES] },
    endDateTime: { gte: now },
  };
}

async function resolveLinkedMember() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const member = await prisma.member.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      recordStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) {
    return {
      status: "CONNECTION_PENDING" as const,
      accountEmail: userAccount.primaryEmail,
    };
  }

  return { status: "READY" as const, userAccount, organization, member };
}

/**
 * Records that the signed-in linked member has seen their own upcoming
 * scheduled assignment. Does not change assignment status or substitutes.
 */
export async function confirmMemberVolunteerServiceAssignment(
  input: unknown,
  now = new Date(),
): Promise<ConfirmMemberVolunteerServiceResult> {
  const access = await resolveLinkedMember();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerServiceConfirmation(input);
  if (!parsed.success) return { status: "NOT_FOUND" };

  const existing = await prisma.volunteerServiceAssignment.findFirst({
    where: {
      id: parsed.data.assignmentId,
      organizationId: access.organization.id,
      memberId: access.member.id,
      status: "SCHEDULED",
      event: upcomingEventWhere(access.organization.id, now),
    },
    select: {
      id: true,
      status: true,
      memberConfirmedAt: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };

  if (existing.memberConfirmedAt) {
    return {
      status: "CONFIRMED",
      alreadyConfirmed: true,
      confirmedAt: existing.memberConfirmedAt,
    };
  }

  const confirmedAt = now;
  const updated = await prisma.volunteerServiceAssignment.updateMany({
    where: {
      id: existing.id,
      organizationId: access.organization.id,
      memberId: access.member.id,
      status: "SCHEDULED",
      memberConfirmedAt: null,
    },
    data: {
      memberConfirmedAt: confirmedAt,
      memberConfirmedByUserAccountId: access.userAccount.id,
    },
  });

  if (updated.count !== 1) {
    const again = await prisma.volunteerServiceAssignment.findFirst({
      where: {
        id: existing.id,
        organizationId: access.organization.id,
        memberId: access.member.id,
      },
      select: { memberConfirmedAt: true },
    });
    if (!again?.memberConfirmedAt) return { status: "NOT_FOUND" };
    return {
      status: "CONFIRMED",
      alreadyConfirmed: true,
      confirmedAt: again.memberConfirmedAt,
    };
  }

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "CONFIRM_VOLUNTEER_SERVICE_ASSIGNMENT",
    entityType: "VolunteerServiceAssignment",
    entityId: existing.id,
    changes: [
      { field: "memberConfirmedAt", oldValue: null, newValue: "set" },
    ],
  });

  return {
    status: "CONFIRMED",
    alreadyConfirmed: false,
    confirmedAt,
  };
}
