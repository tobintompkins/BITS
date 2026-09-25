import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  mergeVolunteerAvailabilityDays,
  memberVolunteerAvailabilitySchema,
  normalizeVolunteerAvailabilityDays,
  type MemberVolunteerAvailabilityDay,
  type MemberVolunteerAvailabilityInput,
} from "@/lib/validation/member-volunteer-availability";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberVolunteerAvailabilityAccessResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string };

export type MemberVolunteerAvailabilityView =
  | MemberVolunteerAvailabilityAccessResult
  | {
      status: "READY";
      days: MemberVolunteerAvailabilityDay[];
    };

export type MemberVolunteerAvailabilityResult =
  | MemberVolunteerAvailabilityAccessResult
  | { status: "INVALID" }
  | {
      status: "READY";
      days: MemberVolunteerAvailabilityDay[];
      unchanged?: boolean;
    };

const availabilitySelect = {
  weekday: true,
  isAvailable: true,
  startTime: true,
  endTime: true,
  note: true,
} as const;

async function resolveLinkedMemberAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  return {
    status: "LINKED" as const,
    userAccount,
    organization,
  };
}

function sameDay(
  previous: MemberVolunteerAvailabilityDay | undefined,
  next: MemberVolunteerAvailabilityDay,
) {
  if (!previous) return false;
  return (
    previous.isAvailable === next.isAvailable &&
    previous.startTime === next.startTime &&
    previous.endTime === next.endTime &&
    previous.note === next.note
  );
}

function auditChanges(
  previous: MemberVolunteerAvailabilityDay | undefined,
  next: MemberVolunteerAvailabilityDay,
) {
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] =
    [];
  if ((previous?.isAvailable ?? false) !== next.isAvailable) {
    changes.push({
      field: `${next.weekday}.isAvailable`,
      oldValue: previous ? String(previous.isAvailable) : null,
      newValue: String(next.isAvailable),
    });
  }
  if ((previous?.startTime ?? null) !== next.startTime) {
    changes.push({
      field: `${next.weekday}.startTime`,
      oldValue: previous?.startTime ?? null,
      newValue: next.startTime,
    });
  }
  if ((previous?.endTime ?? null) !== next.endTime) {
    changes.push({
      field: `${next.weekday}.endTime`,
      oldValue: previous?.endTime ?? null,
      newValue: next.endTime,
    });
  }
  if ((previous?.note ?? null) !== next.note) {
    changes.push({
      field: `${next.weekday}.note`,
      oldValue: previous?.note ? "set" : null,
      newValue: next.note ? "set" : null,
    });
  }
  return changes;
}

/**
 * Read or save general weekly availability for the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 */
export async function getMemberVolunteerAvailability(): Promise<MemberVolunteerAvailabilityView> {
  const access = await resolveLinkedMemberAccess();
  if (access.status !== "LINKED") return access;

  const member = await prisma.member.findFirst({
    where: {
      organizationId: access.organization.id,
      userAccountId: access.userAccount.id,
      recordStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) {
    return {
      status: "CONNECTION_PENDING",
      accountEmail: access.userAccount.primaryEmail,
    };
  }

  const rows = await prisma.memberVolunteerAvailability.findMany({
    where: {
      organizationId: access.organization.id,
      memberId: member.id,
    },
    orderBy: { weekday: "asc" },
    select: availabilitySelect,
  });

  return {
    status: "READY",
    days: mergeVolunteerAvailabilityDays(rows),
  };
}

export async function updateMemberVolunteerAvailability(
  input: unknown,
): Promise<MemberVolunteerAvailabilityResult> {
  const parsed = memberVolunteerAvailabilitySchema.safeParse(input);
  if (!parsed.success) return { status: "INVALID" };

  const access = await resolveLinkedMemberAccess();
  if (access.status !== "LINKED") return access;

  const nextDays = normalizeVolunteerAvailabilityDays(parsed.data.days);

  return prisma.$transaction(async (tx) => {
    const member = await tx.member.findFirst({
      where: {
        organizationId: access.organization.id,
        userAccountId: access.userAccount.id,
        recordStatus: "ACTIVE",
      },
      select: { id: true },
    });
    if (!member) {
      return {
        status: "CONNECTION_PENDING",
        accountEmail: access.userAccount.primaryEmail,
      };
    }

    const existing = await tx.memberVolunteerAvailability.findMany({
      where: {
        organizationId: access.organization.id,
        memberId: member.id,
      },
      select: availabilitySelect,
    });
    const existingByDay = new Map(existing.map((row) => [row.weekday, row]));

    const changes: { field: string; oldValue: string | null; newValue: string | null }[] =
      [];

    for (const day of nextDays) {
      const previous = existingByDay.get(day.weekday);
      if (sameDay(previous, day)) continue;

      const updated = await tx.memberVolunteerAvailability.updateMany({
        where: {
          organizationId: access.organization.id,
          memberId: member.id,
          weekday: day.weekday,
        },
        data: {
          isAvailable: day.isAvailable,
          startTime: day.startTime,
          endTime: day.endTime,
          note: day.note,
        },
      });
      if (updated.count === 0) {
        await tx.memberVolunteerAvailability.create({
          data: {
            organizationId: access.organization.id,
            memberId: member.id,
            weekday: day.weekday,
            isAvailable: day.isAvailable,
            startTime: day.startTime,
            endTime: day.endTime,
            note: day.note,
          },
        });
      } else if (updated.count !== 1) {
        throw new Error("Unable to update your volunteer availability right now.");
      }

      changes.push(...auditChanges(previous, day));
    }

    if (changes.length > 0) {
      await createAuditEvent(
        {
          organizationId: access.organization.id,
          actorUserAccountId: access.userAccount.id,
          action: "UPDATE_MEMBER_VOLUNTEER_AVAILABILITY",
          entityType: "MemberVolunteerAvailability",
          entityId: member.id,
          changes,
        },
        tx,
      );
    }

    const rows = await tx.memberVolunteerAvailability.findMany({
      where: {
        organizationId: access.organization.id,
        memberId: member.id,
      },
      orderBy: { weekday: "asc" },
      select: availabilitySelect,
    });

    return {
      status: "READY",
      days: mergeVolunteerAvailabilityDays(rows),
      unchanged: changes.length === 0,
    };
  });
}

export type { MemberVolunteerAvailabilityInput };
