import type {
  EventAttendeeStatus,
  EventAttendeeType,
  EventRegistrationSource,
  EventRegistrationStatus,
  EventRegistrationVisibility,
  EventWaitlistPromotionMode,
  Prisma,
} from "@/app/generated/prisma/client";
import { COUNTED_TOWARD_CAPACITY_STATUSES } from "@/lib/constants/event-registration";
import { prisma } from "@/lib/db/prisma";

const countedStatuses = [
  ...COUNTED_TOWARD_CAPACITY_STATUSES,
] as EventRegistrationStatus[];

const settingsSelect = {
  id: true,
  organizationId: true,
  eventId: true,
  isEnabled: true,
  visibility: true,
  opensAt: true,
  closesAt: true,
  capacity: true,
  waitlistEnabled: true,
  waitlistCapacity: true,
  promotionMode: true,
  maxAttendeesPerRegistration: true,
  allowHouseholdRegistration: true,
  allowGuestRegistration: true,
  requireAuthentication: true,
  requireEmail: true,
  requirePhone: true,
  requireDateOfBirth: true,
  requireEmergencyContact: true,
  requireGuardianForMinors: true,
  allowCancellation: true,
  cancellationDeadline: true,
  confirmationMessage: true,
  instructions: true,
  checkInEnabled: true,
  qrCheckInEnabled: true,
  showCapacityPublicly: true,
  showWaitlistPublicly: true,
  confirmationRequired: true,
  promotionOfferTtlMinutes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EventRegistrationSettingsSelect;

const attendeeSelect = {
  id: true,
  organizationId: true,
  registrationId: true,
  eventId: true,
  status: true,
  attendeeType: true,
  memberId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  isGuest: true,
  isMinor: true,
  guardianName: true,
  guardianPhone: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  accommodationRequest: true,
  dietaryNotes: true,
  internalNotes: true,
  waitlistPosition: true,
  checkedInAt: true,
  checkedInByUserId: true,
  checkInToken: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  member: {
    select: { id: true, firstName: true, lastName: true, preferredName: true },
  },
} satisfies Prisma.EventAttendeeSelect;

const registrationInclude = {
  attendees: { select: attendeeSelect, orderBy: { createdAt: "asc" as const } },
  waitlistEntry: true,
  member: {
    select: { id: true, firstName: true, lastName: true, preferredName: true },
  },
  household: { select: { id: true, householdName: true } },
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      startDateTime: true,
      endDateTime: true,
      eventStatus: true,
      visibility: true,
    },
  },
} satisfies Prisma.EventRegistrationInclude;

export type RegistrationSettingsWrite = {
  isEnabled: boolean;
  visibility: EventRegistrationVisibility;
  opensAt: Date | null;
  closesAt: Date | null;
  capacity: number | null;
  waitlistEnabled: boolean;
  waitlistCapacity: number | null;
  promotionMode: EventWaitlistPromotionMode;
  maxAttendeesPerRegistration: number;
  allowHouseholdRegistration: boolean;
  allowGuestRegistration: boolean;
  requireAuthentication: boolean;
  requireEmail: boolean;
  requirePhone: boolean;
  requireDateOfBirth: boolean;
  requireEmergencyContact: boolean;
  requireGuardianForMinors: boolean;
  allowCancellation: boolean;
  cancellationDeadline: Date | null;
  confirmationMessage: string | null;
  instructions: string | null;
  checkInEnabled: boolean;
  qrCheckInEnabled: boolean;
  showCapacityPublicly: boolean;
  showWaitlistPublicly: boolean;
  confirmationRequired: boolean;
  promotionOfferTtlMinutes: number;
};

export type AttendeeWrite = {
  memberId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: Date | null;
  isGuest?: boolean;
  isMinor?: boolean;
  attendeeType?: EventAttendeeType;
  guardianName?: string | null;
  guardianPhone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  accommodationRequest?: string | null;
  dietaryNotes?: string | null;
  internalNotes?: string | null;
  notes?: string | null;
  status: EventAttendeeStatus;
  waitlistPosition?: number | null;
  checkInToken: string;
};

/** Lock registration settings row for capacity allocation. */
export async function lockRegistrationSettingsForEvent(
  eventId: string,
  tx: Prisma.TransactionClient,
) {
  await tx.$executeRaw`
    SELECT id FROM event_registration_settings
    WHERE "eventId" = ${eventId}::uuid
    FOR UPDATE
  `;
}

export async function findRegistrationSettingsByEventId(
  organizationId: string,
  eventId: string,
) {
  return prisma.eventRegistrationSettings.findFirst({
    where: { organizationId, eventId },
    select: settingsSelect,
  });
}

export async function createRegistrationSettings(
  organizationId: string,
  eventId: string,
  data: Partial<RegistrationSettingsWrite> = {},
) {
  return prisma.eventRegistrationSettings.create({
    data: {
      organizationId,
      eventId,
      ...data,
    },
    select: settingsSelect,
  });
}

export async function updateRegistrationSettingsRecord(
  organizationId: string,
  eventId: string,
  data: RegistrationSettingsWrite,
) {
  return prisma.eventRegistrationSettings.update({
    where: { eventId },
    data: {
      ...data,
      organizationId,
    },
    select: settingsSelect,
  });
}

export async function syncEventRegistrationDenormalizedFields(
  eventId: string,
  settings: {
    isEnabled: boolean;
    opensAt: Date | null;
    closesAt: Date | null;
    capacity: number | null;
    waitlistEnabled: boolean;
    instructions: string | null;
  },
) {
  return prisma.event.update({
    where: { id: eventId },
    data: {
      registrationRequired: settings.isEnabled,
      registrationOpenDate: settings.opensAt,
      registrationCloseDate: settings.closesAt,
      registrationCapacity: settings.capacity,
      waitlistEnabled: settings.waitlistEnabled,
      registrationInstructions: settings.instructions,
    },
    select: { id: true },
  });
}

export async function findEventBySlugForRegistration(
  organizationId: string,
  slug: string,
) {
  return prisma.event.findFirst({
    where: { organizationId, slug },
    select: {
      id: true,
      organizationId: true,
      title: true,
      slug: true,
      shortDescription: true,
      description: true,
      eventStatus: true,
      visibility: true,
      startDateTime: true,
      endDateTime: true,
      timezone: true,
      isAllDay: true,
      location: {
        select: {
          name: true,
          roomName: true,
          isOnline: true,
          city: true,
          state: true,
        },
      },
      category: { select: { name: true, color: true } },
      registrationSettings: { select: settingsSelect },
    },
  });
}

export async function findEventLeanForRegistration(
  organizationId: string,
  eventId: string,
) {
  return prisma.event.findFirst({
    where: { organizationId, id: eventId },
    select: {
      id: true,
      organizationId: true,
      title: true,
      slug: true,
      eventStatus: true,
      visibility: true,
      startDateTime: true,
      endDateTime: true,
      registrationSettings: { select: settingsSelect },
    },
  });
}

/** Count attendees whose registration status counts toward capacity. */
export async function countCapacityUsed(
  organizationId: string,
  eventId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventAttendee.count({
    where: {
      organizationId,
      eventId,
      status: { not: "CANCELLED" },
      registration: { status: { in: countedStatuses } },
    },
  });
}

export async function countWaitlistUsed(
  organizationId: string,
  eventId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventAttendee.count({
    where: {
      organizationId,
      eventId,
      status: { not: "CANCELLED" },
      registration: { status: "WAITLISTED" },
    },
  });
}

export async function getNextWaitlistPosition(
  organizationId: string,
  eventId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const max = await tx.eventWaitlistEntry.aggregate({
    where: { organizationId, eventId },
    _max: { position: true },
  });
  return (max._max.position ?? 0) + 1;
}

export async function findWaitingWaitlistEntriesOrdered(
  organizationId: string,
  eventId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventWaitlistEntry.findMany({
    where: { organizationId, eventId, status: "WAITING" },
    include: {
      registration: {
        include: {
          attendees: { select: attendeeSelect, orderBy: { createdAt: "asc" } },
        },
      },
    },
    orderBy: [{ position: "asc" }, { joinedAt: "asc" }, { id: "asc" }],
  });
}

export async function findExpiredOfferedWaitlistEntries(
  organizationId: string,
  eventId: string,
  now: Date,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventWaitlistEntry.findMany({
    where: {
      organizationId,
      eventId,
      status: "OFFERED",
      offerExpiresAt: { lte: now },
    },
    select: { id: true, registrationId: true },
  });
}

export async function createPromotionOffer(
  input: {
    organizationId: string;
    eventId: string;
    registrationId: string;
    tokenHash: string;
    expiresAt: Date;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventPromotionOffer.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      registrationId: input.registrationId,
      tokenHash: input.tokenHash,
      purpose: "WAITLIST_PROMOTION",
      expiresAt: input.expiresAt,
    },
  });
}

export async function findActivePromotionOfferByTokenHash(
  organizationId: string,
  tokenHash: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventPromotionOffer.findFirst({
    where: {
      organizationId,
      tokenHash,
      usedAt: null,
      revokedAt: null,
    },
    include: {
      registration: { include: registrationInclude },
    },
  });
}

export async function revokeActivePromotionOffersForRegistration(
  registrationId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventPromotionOffer.updateMany({
    where: { registrationId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function findRegistrationByConfirmationCode(
  organizationId: string,
  confirmationCode: string,
) {
  return prisma.eventRegistration.findFirst({
    where: {
      organizationId,
      confirmationCode: confirmationCode.toUpperCase(),
    },
    include: registrationInclude,
  });
}

export async function findRegistrationById(
  organizationId: string,
  registrationId: string,
) {
  return prisma.eventRegistration.findFirst({
    where: { organizationId, id: registrationId },
    include: registrationInclude,
  });
}

export async function findEventRegistrations(
  organizationId: string,
  eventId: string,
  options?: { status?: EventRegistrationStatus | EventRegistrationStatus[] },
) {
  const statusFilter = options?.status
    ? Array.isArray(options.status)
      ? { in: options.status }
      : options.status
    : undefined;

  return prisma.eventRegistration.findMany({
    where: {
      organizationId,
      eventId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: registrationInclude,
    orderBy: [
      { status: "asc" },
      { waitlistPosition: "asc" },
      { createdAt: "asc" },
    ],
  });
}

export async function findWaitlistedRegistrationsOrdered(
  organizationId: string,
  eventId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventRegistration.findMany({
    where: { organizationId, eventId, status: "WAITLISTED" },
    include: {
      attendees: { select: attendeeSelect, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
  });
}

export async function createRegistrationWithAttendees(
  input: {
    organizationId: string;
    eventId: string;
    status: EventRegistrationStatus;
    source?: EventRegistrationSource;
    confirmationCode: string;
    memberId?: string | null;
    householdId?: string | null;
    registeredByUserId?: string | null;
    primaryContactName: string;
    primaryContactEmail?: string | null;
    primaryContactPhone?: string | null;
    notes?: string | null;
    partySize: number;
    waitlistPosition?: number | null;
    confirmedAt?: Date | null;
    attendees: AttendeeWrite[];
    createWaitlistEntry?: boolean;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventRegistration.create({
    data: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      status: input.status,
      source: input.source ?? "PUBLIC_GUEST",
      confirmationCode: input.confirmationCode,
      memberId: input.memberId ?? null,
      householdId: input.householdId ?? null,
      registeredByUserId: input.registeredByUserId ?? null,
      primaryContactName: input.primaryContactName,
      primaryContactEmail: input.primaryContactEmail?.toLowerCase() ?? null,
      primaryContactPhone: input.primaryContactPhone ?? null,
      notes: input.notes ?? null,
      partySize: input.partySize,
      waitlistPosition: input.waitlistPosition ?? null,
      confirmedAt: input.confirmedAt ?? null,
      attendees: {
        create: input.attendees.map((attendee) => ({
          organizationId: input.organizationId,
          eventId: input.eventId,
          status: attendee.status,
          attendeeType:
            attendee.attendeeType ??
            (attendee.memberId ? "MEMBER" : attendee.isMinor ? "CHILD" : "GUEST"),
          memberId: attendee.memberId ?? null,
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          email: attendee.email?.toLowerCase() ?? null,
          phone: attendee.phone ?? null,
          dateOfBirth: attendee.dateOfBirth ?? null,
          isGuest: Boolean(attendee.isGuest),
          isMinor: Boolean(attendee.isMinor),
          guardianName: attendee.guardianName ?? null,
          guardianPhone: attendee.guardianPhone ?? null,
          emergencyContactName: attendee.emergencyContactName ?? null,
          emergencyContactPhone: attendee.emergencyContactPhone ?? null,
          accommodationRequest: attendee.accommodationRequest ?? null,
          dietaryNotes: attendee.dietaryNotes ?? null,
          internalNotes: attendee.internalNotes ?? null,
          waitlistPosition: attendee.waitlistPosition ?? null,
          checkInToken: attendee.checkInToken,
          notes: attendee.notes ?? null,
        })),
      },
      ...(input.createWaitlistEntry && input.waitlistPosition != null
        ? {
            waitlistEntry: {
              create: {
                organizationId: input.organizationId,
                eventId: input.eventId,
                position: input.waitlistPosition,
                partySize: input.partySize,
                status: "WAITING" as const,
              },
            },
          }
        : {}),
    },
    include: registrationInclude,
  });
}

export async function updateRegistrationStatus(
  registrationId: string,
  data: {
    status: EventRegistrationStatus;
    waitlistPosition?: number | null;
    cancelledAt?: Date | null;
    cancellationReason?: string | null;
    cancelledByUserId?: string | null;
    confirmedAt?: Date | null;
    checkedInAt?: Date | null;
    offeredAt?: Date | null;
    offerExpiresAt?: Date | null;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventRegistration.update({
    where: { id: registrationId },
    data,
    include: registrationInclude,
  });
}

export async function updateAttendeesStatusForRegistration(
  registrationId: string,
  status: EventAttendeeStatus,
  extra?: { waitlistPosition?: number | null },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventAttendee.updateMany({
    where: { registrationId, status: { not: "CANCELLED" } },
    data: {
      status,
      ...(extra?.waitlistPosition !== undefined
        ? { waitlistPosition: extra.waitlistPosition }
        : {}),
    },
  });
}

export async function findAttendeeById(
  organizationId: string,
  attendeeId: string,
) {
  return prisma.eventAttendee.findFirst({
    where: { organizationId, id: attendeeId },
    select: {
      ...attendeeSelect,
      registration: {
        select: {
          id: true,
          status: true,
          confirmationCode: true,
          primaryContactName: true,
          primaryContactEmail: true,
        },
      },
      event: {
        select: {
          id: true,
          title: true,
          startDateTime: true,
          registrationSettings: {
            select: { checkInEnabled: true, qrCheckInEnabled: true },
          },
        },
      },
    },
  });
}

export async function findAttendeeByCheckInToken(
  organizationId: string,
  eventId: string,
  checkInToken: string,
) {
  return prisma.eventAttendee.findFirst({
    where: { organizationId, eventId, checkInToken },
    select: {
      ...attendeeSelect,
      registration: {
        select: {
          id: true,
          status: true,
          confirmationCode: true,
        },
      },
    },
  });
}

export async function markAttendeeCheckedIn(
  attendeeId: string,
  checkedInByUserId: string | null,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.eventAttendee.update({
    where: { id: attendeeId },
    data: {
      status: "CHECKED_IN",
      checkedInAt: new Date(),
      checkedInByUserId,
    },
    select: attendeeSelect,
  });
}

export async function createMemberAttendanceForCheckIn(input: {
  organizationId: string;
  memberId: string;
  eventId: string;
  serviceName: string;
  attendanceDate: Date;
  checkedInByUserId: string | null;
}) {
  return prisma.memberAttendance.create({
    data: {
      organizationId: input.organizationId,
      memberId: input.memberId,
      eventId: input.eventId,
      serviceName: input.serviceName,
      attendanceDate: input.attendanceDate,
      attendanceType: "PRESENT",
      checkInTime: new Date(),
      checkedInByUserId: input.checkedInByUserId,
      notes: "Checked in via event registration",
    },
    select: { id: true },
  });
}

export async function findExportRegistrationRows(
  organizationId: string,
  eventId: string,
) {
  return prisma.eventRegistration.findMany({
    where: { organizationId, eventId },
    select: {
      confirmationCode: true,
      status: true,
      primaryContactName: true,
      primaryContactEmail: true,
      primaryContactPhone: true,
      partySize: true,
      waitlistPosition: true,
      notes: true,
      createdAt: true,
      cancelledAt: true,
      confirmedAt: true,
      checkedInAt: true,
      source: true,
      attendees: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          status: true,
          isGuest: true,
          isMinor: true,
          checkedInAt: true,
          accommodationRequest: true,
          dietaryNotes: true,
          internalNotes: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function getRegistrationSummaryCounts(
  organizationId: string,
  eventId: string,
) {
  const [confirmedAttendees, waitlistedAttendees, settings] = await Promise.all([
    countCapacityUsed(organizationId, eventId),
    countWaitlistUsed(organizationId, eventId),
    findRegistrationSettingsByEventId(organizationId, eventId),
  ]);

  const capacity = settings?.capacity ?? null;
  const remaining =
    capacity == null ? null : Math.max(0, capacity - confirmedAttendees);

  return {
    confirmedCount: confirmedAttendees,
    waitlistCount: waitlistedAttendees,
    capacity,
    capacityRemaining: remaining,
    settings,
  };
}

export async function countNearCapacityEvents(organizationId: string) {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      organizationId,
      eventStatus: "PUBLISHED",
      startDateTime: { gte: now },
      OR: [
        { registrationRequired: true, registrationCapacity: { not: null } },
        {
          registrationSettings: {
            isEnabled: true,
            capacity: { not: null },
          },
        },
      ],
    },
    select: {
      id: true,
      registrationCapacity: true,
      registrationSettings: { select: { capacity: true, isEnabled: true } },
    },
    take: 200,
  });

  let nearCapacity = 0;
  for (const event of events) {
    const capacity =
      event.registrationSettings?.capacity ?? event.registrationCapacity ?? 0;
    if (capacity <= 0) continue;
    const used = await countCapacityUsed(organizationId, event.id);
    if (used / capacity >= 0.8) nearCapacity += 1;
  }
  return nearCapacity;
}

export { prisma };
