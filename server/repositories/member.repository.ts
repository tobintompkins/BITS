import type {
  MemberRecordStatus,
  MembershipStatus,
  Prisma,
} from "@/app/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type MemberWriteInput = {
  organizationId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  preferredName?: string | null;
  suffix?: string | null;
  email?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  dateOfBirth?: Date | null;
  gender?: string | null;
  maritalStatus?: string | null;
  membershipStatus: MembershipStatus;
  memberSince?: Date | null;
  baptismDate?: Date | null;
  salvationDate?: Date | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  notes?: string | null;
};

export type MemberListFilters = {
  organizationId: string;
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
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

const memberDirectorySelect = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  preferredName: true,
  suffix: true,
  email: true,
  phone: true,
  membershipStatus: true,
  recordStatus: true,
  preferredContactMethod: true,
  updatedAt: true,
  householdLinks: {
    select: {
      household: {
        select: {
          id: true,
          householdName: true,
        },
      },
    },
  },
} satisfies Prisma.MemberSelect;

const memberListInclude = {
  householdLinks: {
    include: {
      household: {
        select: {
          id: true,
          householdName: true,
          primaryContactId: true,
        },
      },
    },
  },
} satisfies Prisma.MemberInclude;

const memberDetailInclude = {
  emergencyContacts: {
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
  },
  householdLinks: {
    include: {
      household: {
        include: {
          primaryContact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              preferredName: true,
            },
          },
          memberLinks: {
            include: {
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                  email: true,
                  phone: true,
                  membershipStatus: true,
                  recordStatus: true,
                },
              },
            },
            orderBy: [{ isPrimaryContact: "desc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  },
  mergedIntoMember: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      recordStatus: true,
    },
  },
} satisfies Prisma.MemberInclude;

function buildMemberListWhere(filters: MemberListFilters): Prisma.MemberWhereInput {
  let statusFilter: Prisma.MemberWhereInput;
  if (filters.recordStatus) {
    statusFilter = { recordStatus: filters.recordStatus };
  } else {
    const excluded: MemberRecordStatus[] = ["MERGED"];
    if (!filters.includeArchived) excluded.push("ARCHIVED");
    if (!filters.includeDeceased) excluded.push("DECEASED");
    statusFilter = { recordStatus: { notIn: excluded } };
  }

  return {
    organizationId: filters.organizationId,
    ...statusFilter,
    ...(filters.membershipStatus
      ? { membershipStatus: filters.membershipStatus }
      : {}),
    ...(filters.householdId
      ? {
          householdLinks: {
            some: { householdId: filters.householdId },
          },
        }
      : {}),
    ...(filters.doNotContact
      ? { preferredContactMethod: "DO_NOT_CONTACT" }
      : {}),
    ...(filters.directoryOptOut ? { allowDirectoryListing: false } : {}),
    ...(filters.allowEmail === false ? { allowEmail: false } : {}),
    ...(filters.allowEmail === true ? { allowEmail: true } : {}),
    ...(filters.allowSms === false ? { allowSms: false } : {}),
    ...(filters.allowSms === true ? { allowSms: true } : {}),
    ...(filters.allowPhoneCalls === false ? { allowPhoneCalls: false } : {}),
    ...(filters.allowPostalMail === false ? { allowPostalMail: false } : {}),
    ...(filters.search
      ? {
          OR: [
            { firstName: { contains: filters.search, mode: "insensitive" } },
            { lastName: { contains: filters.search, mode: "insensitive" } },
            { preferredName: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
            { phone: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

/** Full member rows for export/import — prefer findMembersPage for UI lists. */
export async function findMembers(filters: MemberListFilters) {
  return prisma.member.findMany({
    where: buildMemberListWhere(filters),
    include: memberListInclude,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

/** Paginated lean directory query. */
export async function findMembersPage(filters: MemberListFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, filters.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  const where = buildMemberListWhere(filters);

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      select: memberDirectorySelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.member.count({ where }),
  ]);

  return { members, total, page, pageSize };
}

/** Lean options for attendance/care/ministry member pickers. */
export async function findMemberOptions(organizationId: string) {
  return prisma.member.findMany({
    where: {
      organizationId,
      recordStatus: { in: ["ACTIVE", "INACTIVE"] },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function findMemberById(organizationId: string, id: string) {
  return prisma.member.findFirst({
    where: { id, organizationId },
    include: memberDetailInclude,
  });
}

export async function findMembersForHouseholdSelect(organizationId: string) {
  return prisma.member.findMany({
    where: {
      organizationId,
      recordStatus: { notIn: ["MERGED"] },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      preferredName: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function createMember(data: MemberWriteInput) {
  return prisma.member.create({ data });
}

export async function updateMember(
  id: string,
  organizationId: string,
  data: Omit<MemberWriteInput, "organizationId">,
) {
  const result = await prisma.member.updateMany({
    where: { id, organizationId },
    data,
  });

  if (result.count === 0) {
    throw new Error("Member not found.");
  }

  return prisma.member.findFirstOrThrow({
    where: { id, organizationId },
  });
}

export async function deleteMember(id: string, organizationId: string) {
  const result = await prisma.member.deleteMany({
    where: { id, organizationId },
  });

  if (result.count === 0) {
    throw new Error("Member not found.");
  }
}

export async function findMemberHouseholdUnits(organizationId: string) {
  return prisma.memberHouseholdUnit.findMany({
    where: { organizationId },
    orderBy: { householdName: "asc" },
    select: { id: true, householdName: true },
  });
}

export async function upsertMemberHouseholdLink(
  organizationId: string,
  memberId: string,
  householdId: string,
) {
  return prisma.memberHousehold.upsert({
    where: {
      memberId_householdId: { memberId, householdId },
    },
    update: {},
    create: {
      organizationId,
      memberId,
      householdId,
    },
  });
}

export async function clearMemberHouseholdLinks(memberId: string) {
  return prisma.memberHousehold.deleteMany({
    where: { memberId },
  });
}
