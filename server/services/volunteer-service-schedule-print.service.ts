import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import { staffVolunteerConfirmationLabel } from "@/lib/validation/volunteer-service-confirmation";
import {
  groupVolunteerServiceSchedulePrintAssignments,
  parseVolunteerServiceSchedulePrintEventId,
  type VolunteerServiceSchedulePrintGroup,
} from "@/lib/validation/volunteer-service-schedule-print";
import {
  formatVolunteerEventWhen,
  publicVolunteerLocationText,
} from "@/lib/validation/volunteer-service-schedule";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

const publicLocationSelect = {
  name: true,
  roomName: true,
  isOnline: true,
  city: true,
  state: true,
} as const;

const assignmentSelect = {
  roleLabel: true,
  status: true,
  memberConfirmedAt: true,
  member: {
    select: {
      preferredName: true,
      firstName: true,
      middleName: true,
      lastName: true,
      suffix: true,
    },
  },
  ministry: {
    select: { name: true },
  },
} as const;

export type VolunteerServiceSchedulePrintView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "NOT_FOUND" }
  | {
      status: "READY";
      churchName: string;
      eventTitle: string;
      startsAtLabel: string;
      location: string | null;
      groups: VolunteerServiceSchedulePrintGroup[];
    };

async function requireStaffScheduleAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canManageMinistryRosters) {
    return { status: "UNAUTHORIZED" as const };
  }

  return { status: "READY" as const, organization };
}

/**
 * Ownership-scoped printable roster for one event. Client organization
 * fields are ignored.
 */
export async function getVolunteerServiceSchedulePrint(
  input: unknown,
): Promise<VolunteerServiceSchedulePrintView> {
  const access = await requireStaffScheduleAccess();
  if (access.status !== "READY") return access;

  const parsed = parseVolunteerServiceSchedulePrintEventId(input);
  if (!parsed.success) return { status: "NOT_FOUND" };

  const event = await prisma.event.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
    },
    select: {
      id: true,
      title: true,
      startDateTime: true,
      endDateTime: true,
      timezone: true,
      isAllDay: true,
      location: { select: publicLocationSelect },
    },
  });
  if (!event) return { status: "NOT_FOUND" };

  const assignments = await prisma.volunteerServiceAssignment.findMany({
    where: {
      organizationId: access.organization.id,
      eventId: event.id,
    },
    select: assignmentSelect,
  });

  return {
    status: "READY",
    churchName:
      access.organization.displayName?.trim() || access.organization.name,
    eventTitle: event.title,
    startsAtLabel: formatVolunteerEventWhen(event),
    location: publicVolunteerLocationText(event.location),
    groups: groupVolunteerServiceSchedulePrintAssignments(
      assignments.map((row) => ({
        ministryName: row.ministry?.name ?? null,
        roleLabel: row.roleLabel,
        memberName: getMemberDisplayName(row.member),
        statusLabel: row.status === "CANCELLED" ? "Cancelled" : "Scheduled",
        confirmationLabel: staffVolunteerConfirmationLabel({
          status: row.status,
          memberConfirmedAt: row.memberConfirmedAt,
          timeZone: event.timezone,
        }),
      })),
    ),
  };
}
