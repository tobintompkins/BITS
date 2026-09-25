import { getMemberEngagementAccess } from "@/lib/auth/member-engagement-permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import { getMemberDisplayName } from "@/lib/utils/member-display";
import {
  VOLUNTEER_WEEKDAYS,
  type VolunteerWeekday,
} from "@/lib/validation/member-volunteer-availability";
import {
  parseStaffVolunteerAvailabilityFilters,
  weekdayLabel,
  type StaffVolunteerAvailabilityFilters,
  type StaffVolunteerAvailabilityMinistryOption,
  type StaffVolunteerAvailabilityRow,
} from "@/lib/validation/staff-volunteer-availability";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type StaffVolunteerAvailabilityResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | {
      status: "INVALID_FILTER";
      filters: StaffVolunteerAvailabilityFilters;
      ministries: StaffVolunteerAvailabilityMinistryOption[];
    }
  | {
      status: "READY";
      filters: StaffVolunteerAvailabilityFilters;
      ministries: StaffVolunteerAvailabilityMinistryOption[];
      rows: StaffVolunteerAvailabilityRow[];
    };

function availabilitySelect(organizationId: string) {
  return {
    weekday: true,
    isAvailable: true,
    startTime: true,
    endTime: true,
    note: true,
    member: {
      select: {
        preferredName: true,
        firstName: true,
        middleName: true,
        lastName: true,
        suffix: true,
        ministries: {
          where: {
            status: "ACTIVE" as const,
            endedDate: null,
            ministry: { organizationId, isActive: true },
          },
          orderBy: { ministry: { name: "asc" as const } },
          select: {
            ministry: {
              select: {
                name: true,
                organizationId: true,
                isActive: true,
              },
            },
          },
        },
      },
    },
  } as const;
}

function weekdayRank(weekday: VolunteerWeekday) {
  return VOLUNTEER_WEEKDAYS.indexOf(weekday);
}

function toSafeRow(
  row: {
    weekday: VolunteerWeekday;
    isAvailable: boolean;
    startTime: string | null;
    endTime: string | null;
    note: string | null;
    member: {
      preferredName: string | null;
      firstName: string;
      middleName: string | null;
      lastName: string;
      suffix: string | null;
      ministries: Array<{
        ministry: {
          name: string;
          organizationId: string;
          isActive: boolean;
        };
      }>;
    };
  },
  organizationId: string,
): StaffVolunteerAvailabilityRow {
  return {
    memberName: getMemberDisplayName(row.member),
    ministryNames: row.member.ministries
      .filter(
        (assignment) =>
          assignment.ministry.organizationId === organizationId &&
          assignment.ministry.isActive,
      )
      .map((assignment) => assignment.ministry.name),
    weekday: row.weekday,
    weekdayLabel: weekdayLabel(row.weekday),
    isAvailable: row.isAvailable,
    startTime: row.isAvailable ? row.startTime : null,
    endTime: row.isAvailable ? row.endTime : null,
    note: row.note,
  };
}

/**
 * Read-only volunteer availability for authorized staff.
 * Organization and permission are resolved server-side only.
 */
export async function getStaffVolunteerAvailability(
  input: unknown = {},
): Promise<StaffVolunteerAvailabilityResult> {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" };

  const access = await getMemberEngagementAccess(organization.id);
  if (!access.canViewMinistries) return { status: "UNAUTHORIZED" };

  const ministries = await prisma.ministry.findMany({
    where: {
      organizationId: organization.id,
      isActive: true,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const parsed = parseStaffVolunteerAvailabilityFilters(input);
  const emptyFilters: StaffVolunteerAvailabilityFilters = {
    weekday: null,
    ministryId: null,
  };

  if (!parsed.success) {
    return {
      status: "INVALID_FILTER",
      filters: emptyFilters,
      ministries,
    };
  }

  const filters = parsed.data;
  if (
    filters.ministryId &&
    !ministries.some((ministry) => ministry.id === filters.ministryId)
  ) {
    return {
      status: "INVALID_FILTER",
      filters: emptyFilters,
      ministries,
    };
  }

  const rows = await prisma.memberVolunteerAvailability.findMany({
    where: {
      organizationId: organization.id,
      ...(filters.weekday ? { weekday: filters.weekday } : {}),
      member: {
        organizationId: organization.id,
        recordStatus: "ACTIVE",
        ...(filters.ministryId
          ? {
              ministries: {
                some: {
                  ministryId: filters.ministryId,
                  status: "ACTIVE",
                  endedDate: null,
                  ministry: {
                    id: filters.ministryId,
                    organizationId: organization.id,
                    isActive: true,
                  },
                },
              },
            }
          : {}),
      },
    },
    select: availabilitySelect(organization.id),
  });

  const safeRows = rows
    .map((row) => toSafeRow(row, organization.id))
    .sort((left, right) => {
      const nameCompare = left.memberName.localeCompare(right.memberName);
      if (nameCompare !== 0) return nameCompare;
      return weekdayRank(left.weekday) - weekdayRank(right.weekday);
    });

  return {
    status: "READY",
    filters,
    ministries,
    rows: safeRows,
  };
}
