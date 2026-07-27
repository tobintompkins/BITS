import type {
  EventAttendeeStatus,
  EventRegistrationSource,
  EventRegistrationStatus,
  EventRegistrationVisibility,
  EventWaitlistPromotionMode,
  Prisma,
} from "@/app/generated/prisma/client";
import {
  getEventAccess,
  requireEventPermission,
} from "@/lib/auth/event-permissions";
import { RegistrationError } from "@/lib/errors/registration-errors";
import { signCheckInPayload, verifyCheckInPayload } from "@/lib/events/check-in-token";
import {
  generatePromotionOfferToken,
  hashPromotionOfferToken,
} from "@/lib/events/promotion-offer-token";
import { enqueueRegistrationNotification } from "@/lib/notifications/registration-notifications";
import {
  buildSafeAuditChanges,
  generateCheckInToken,
  generateConfirmationCode,
  type CancelRegistrationInput,
  type RegistrationSettingsInput,
  type SubmitRegistrationInput,
} from "@/lib/validation/event-registration";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import {
  countCapacityUsed,
  countWaitlistUsed,
  createMemberAttendanceForCheckIn,
  createPromotionOffer,
  createRegistrationSettings,
  createRegistrationWithAttendees,
  findActivePromotionOfferByTokenHash,
  findAttendeeByCheckInToken,
  findAttendeeById,
  findEventBySlugForRegistration,
  findEventLeanForRegistration,
  findEventRegistrations,
  findExpiredOfferedWaitlistEntries,
  findExportRegistrationRows,
  findRegistrationByConfirmationCode,
  findRegistrationById,
  findRegistrationSettingsByEventId,
  findWaitingWaitlistEntriesOrdered,
  getNextWaitlistPosition,
  getRegistrationSummaryCounts,
  lockRegistrationSettingsForEvent,
  markAttendeeCheckedIn,
  prisma,
  revokeActivePromotionOffersForRegistration,
  syncEventRegistrationDenormalizedFields,
  updateAttendeesStatusForRegistration,
  updateRegistrationSettingsRecord,
  updateRegistrationStatus,
  type AttendeeWrite,
} from "@/server/repositories/event-registration.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type Actor = { userAccountId: string | null; email: string | null };

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) throw new Error("Organization not found.");
  return organization.id;
}

async function audit(
  organizationId: string,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  changes: Array<{ field: string; oldValue: string | null; newValue: string | null }>,
) {
  await createAuditEvent({
    organizationId,
    actorUserAccountId: actor.userAccountId,
    action,
    entityType,
    entityId,
    changes:
      changes.length > 0
        ? changes
        : [{ field: "actorEmail", oldValue: null, newValue: actor.email }],
  });
}

function parseOptionalDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapSettingsInput(input: RegistrationSettingsInput) {
  return {
    isEnabled: input.isEnabled,
    visibility: input.visibility as EventRegistrationVisibility,
    opensAt: parseOptionalDate(input.opensAt),
    closesAt: parseOptionalDate(input.closesAt),
    capacity: input.capacity ?? null,
    waitlistEnabled: input.waitlistEnabled,
    waitlistCapacity: input.waitlistCapacity ?? null,
    promotionMode: input.promotionMode as EventWaitlistPromotionMode,
    maxAttendeesPerRegistration: input.maxAttendeesPerRegistration,
    allowHouseholdRegistration: input.allowHouseholdRegistration,
    allowGuestRegistration: input.allowGuestRegistration,
    requireAuthentication: input.requireAuthentication,
    requireEmail: input.requireEmail,
    requirePhone: input.requirePhone,
    requireDateOfBirth: input.requireDateOfBirth,
    requireEmergencyContact: input.requireEmergencyContact,
    requireGuardianForMinors: input.requireGuardianForMinors,
    allowCancellation: input.allowCancellation,
    cancellationDeadline: parseOptionalDate(input.cancellationDeadline),
    confirmationMessage: input.confirmationMessage ?? null,
    instructions: input.instructions ?? null,
    checkInEnabled: input.checkInEnabled,
    qrCheckInEnabled: input.qrCheckInEnabled,
    showCapacityPublicly: input.showCapacityPublicly,
    showWaitlistPublicly: input.showWaitlistPublicly,
    confirmationRequired: input.confirmationRequired,
    promotionOfferTtlMinutes: input.promotionOfferTtlMinutes,
  };
}

function uniqueConfirmationCode() {
  return generateConfirmationCode();
}

function mapAttendeeWrites(
  attendees: SubmitRegistrationInput["attendees"],
  status: EventAttendeeStatus,
  waitlistPosition: number | null,
): AttendeeWrite[] {
  return attendees.map((attendee) => ({
    memberId: attendee.memberId ?? null,
    firstName: attendee.firstName,
    lastName: attendee.lastName,
    email: attendee.email ?? null,
    phone: attendee.phone ?? null,
    dateOfBirth: attendee.dateOfBirth ? parseOptionalDate(attendee.dateOfBirth) : null,
    isGuest: Boolean(attendee.isGuest),
    isMinor: Boolean(attendee.isMinor),
    guardianName: attendee.guardianName ?? null,
    guardianPhone: attendee.guardianPhone ?? null,
    emergencyContactName: attendee.emergencyContactName ?? null,
    emergencyContactPhone: attendee.emergencyContactPhone ?? null,
    accommodationRequest: attendee.accommodationRequest ?? null,
    dietaryNotes: attendee.dietaryNotes ?? null,
    internalNotes: attendee.internalNotes ?? null,
    attendeeType: attendee.memberId
      ? "MEMBER"
      : attendee.isMinor
        ? "CHILD"
        : "GUEST",
    notes: attendee.notes ?? null,
    status,
    waitlistPosition,
    checkInToken: generateCheckInToken(),
  }));
}

function validateSubmitAgainstSettings(
  input: SubmitRegistrationInput,
  settings: NonNullable<Awaited<ReturnType<typeof findRegistrationSettingsByEventId>>>,
  options: { isAuthenticated: boolean; isStaffManual?: boolean },
) {
  if (!settings.isEnabled && !options.isStaffManual) {
    throw new RegistrationError(
      "REGISTRATION_DISABLED",
      "Registration is not open for this event.",
    );
  }

  const now = new Date();
  if (!options.isStaffManual) {
    if (settings.opensAt && now < settings.opensAt) {
      throw new RegistrationError(
        "REGISTRATION_NOT_OPEN",
        "Registration has not opened yet.",
      );
    }
    if (settings.closesAt && now > settings.closesAt) {
      throw new RegistrationError(
        "REGISTRATION_CLOSED",
        "Registration has closed.",
      );
    }
  }

  if (settings.requireAuthentication && !options.isAuthenticated && !options.isStaffManual) {
    throw new RegistrationError(
      "FORBIDDEN",
      "Sign in is required to register for this event.",
    );
  }

  if (settings.visibility === "STAFF_ONLY" && !options.isStaffManual) {
    throw new RegistrationError(
      "FORBIDDEN",
      "This event only accepts staff-managed registrations.",
    );
  }

  if (input.attendees.length > settings.maxAttendeesPerRegistration) {
    throw new RegistrationError(
      "PARTY_SIZE_EXCEEDED",
      `Maximum ${settings.maxAttendeesPerRegistration} attendee(s) per registration.`,
    );
  }

  if (input.householdId && !settings.allowHouseholdRegistration) {
    throw new RegistrationError(
      "INVALID_HOUSEHOLD_MEMBER",
      "Household registration is not allowed for this event.",
    );
  }

  const hasGuest = input.attendees.some((a) => a.isGuest);
  if (hasGuest && !settings.allowGuestRegistration) {
    throw new RegistrationError(
      "FORBIDDEN",
      "Guest registration is not allowed for this event.",
    );
  }

  const memberIds = input.attendees
    .map((a) => a.memberId)
    .filter((id): id is string => Boolean(id));
  if (new Set(memberIds).size !== memberIds.length) {
    throw new RegistrationError(
      "DUPLICATE_ATTENDEE",
      "Duplicate members are not allowed in one registration.",
    );
  }

  if (settings.requireEmail && !input.primaryContactEmail) {
    throw new RegistrationError("VALIDATION", "Email is required.");
  }
  if (settings.requirePhone && !input.primaryContactPhone) {
    throw new RegistrationError("VALIDATION", "Phone is required.");
  }

  for (const attendee of input.attendees) {
    if (settings.requireEmail && !attendee.email && !input.primaryContactEmail) {
      throw new Error(`Email is required for ${attendee.firstName}.`);
    }
    if (settings.requirePhone && !attendee.phone && !input.primaryContactPhone) {
      throw new Error(`Phone is required for ${attendee.firstName}.`);
    }
    if (settings.requireDateOfBirth && !attendee.dateOfBirth) {
      throw new Error(`Date of birth is required for ${attendee.firstName}.`);
    }
    if (
      settings.requireEmergencyContact &&
      (!attendee.emergencyContactName || !attendee.emergencyContactPhone)
    ) {
      throw new Error(`Emergency contact is required for ${attendee.firstName}.`);
    }
    if (
      settings.requireGuardianForMinors &&
      attendee.isMinor &&
      (!attendee.guardianName || !attendee.guardianPhone)
    ) {
      throw new Error(`Guardian information is required for ${attendee.firstName}.`);
    }
  }
}

async function expireElapsedOffersInTx(
  organizationId: string,
  eventId: string,
  now: Date,
  tx: Prisma.TransactionClient,
) {
  const expired = await findExpiredOfferedWaitlistEntries(
    organizationId,
    eventId,
    now,
    tx,
  );
  for (const entry of expired) {
    await updateRegistrationStatus(
      entry.registrationId,
      {
        status: "EXPIRED",
        waitlistPosition: null,
        offeredAt: null,
        offerExpiresAt: null,
      },
      tx,
    );
    await updateAttendeesStatusForRegistration(
      entry.registrationId,
      "CANCELLED",
      { waitlistPosition: null },
      tx,
    );
    await tx.eventWaitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: "EXPIRED",
        expiredAt: now,
        offeredAt: null,
        offerExpiresAt: null,
      },
    });
    await revokeActivePromotionOffersForRegistration(entry.registrationId, tx);
  }
  return expired.length;
}

/**
 * Offer the next FIFO waitlisted party a seat when capacity allows.
 * Strict FIFO: if the head party does not fit, stop (do not skip).
 */
async function promoteNextWaitlistedParty(
  organizationId: string,
  eventId: string,
  actor: Actor,
  options?: { force?: boolean },
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockRegistrationSettingsForEvent(eventId, tx);
    const settings = await tx.eventRegistrationSettings.findFirst({
      where: { organizationId, eventId },
    });
    if (!settings?.waitlistEnabled) return null;
    if (settings.promotionMode === "STAFF_APPROVAL" && !options?.force) {
      return null;
    }

    const now = new Date();
    await expireElapsedOffersInTx(organizationId, eventId, now, tx);

    const used = await countCapacityUsed(organizationId, eventId, tx);
    const remaining =
      settings.capacity == null
        ? Number.POSITIVE_INFINITY
        : settings.capacity - used;
    if (remaining <= 0) return null;

    const waiting = await findWaitingWaitlistEntriesOrdered(
      organizationId,
      eventId,
      tx,
    );
    const head = waiting[0];
    if (!head) return null;

    // Strict FIFO: never skip a party that does not fit.
    if (head.partySize > remaining) return null;

    const ttlMinutes = Math.max(1, settings.promotionOfferTtlMinutes || 1440);
    const offerExpiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
    const rawToken = generatePromotionOfferToken();
    const tokenHash = hashPromotionOfferToken(rawToken);

    const registration = await updateRegistrationStatus(
      head.registrationId,
      {
        status: "OFFERED",
        offeredAt: now,
        offerExpiresAt,
      },
      tx,
    );
    await tx.eventWaitlistEntry.update({
      where: { id: head.id },
      data: {
        status: "OFFERED",
        offeredAt: now,
        offerExpiresAt,
      },
    });
    await revokeActivePromotionOffersForRegistration(head.registrationId, tx);
    await createPromotionOffer(
      {
        organizationId,
        eventId,
        registrationId: head.registrationId,
        tokenHash,
        expiresAt: offerExpiresAt,
      },
      tx,
    );

    return { registration, rawToken, offerExpiresAt };
  });

  if (!result) return null;

  enqueueRegistrationNotification({
    type: "WAITLIST_OFFERED",
    organizationId,
    eventId,
    registrationId: result.registration.id,
    recipientEmail: result.registration.primaryContactEmail,
    message: `A seat is available for ${result.registration.confirmationCode}. Offer expires ${result.offerExpiresAt.toISOString()}. Accept: /register/offer/accept?token=… Decline: /register/offer/decline?token=…`,
    meta: {
      offerToken: result.rawToken,
      offerExpiresAt: result.offerExpiresAt.toISOString(),
      acceptPath: `/register/offer/accept?token=${encodeURIComponent(result.rawToken)}`,
      declinePath: `/register/offer/decline?token=${encodeURIComponent(result.rawToken)}`,
    },
  });

  await audit(
    organizationId,
    actor,
    "WAITLIST_OFFER",
    "EventRegistration",
    result.registration.id,
    buildSafeAuditChanges({
      confirmationCode: result.registration.confirmationCode,
      status: "OFFERED",
      offerExpiresAt: result.offerExpiresAt.toISOString(),
    }),
  );

  return result.registration;
}

export async function getOrCreateRegistrationSettings(eventId: string) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageRegistration || a.canView,
    "You do not have permission to view registration settings.",
  );

  const existing = await findRegistrationSettingsByEventId(organizationId, eventId);
  if (existing) return existing;

  const event = await findEventLeanForRegistration(organizationId, eventId);
  if (!event) throw new Error("Event not found.");

  const created = await createRegistrationSettings(organizationId, eventId, {
    isEnabled: false,
    visibility: "PUBLIC",
    opensAt: null,
    closesAt: null,
    capacity: null,
    waitlistEnabled: false,
  });

  return created;
}

export async function updateRegistrationSettings(
  input: RegistrationSettingsInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageRegistration,
    "You do not have permission to manage registration settings.",
  );

  const event = await findEventLeanForRegistration(organizationId, input.eventId);
  if (!event) throw new Error("Event not found.");

  const data = mapSettingsInput(input);
  const existing = await findRegistrationSettingsByEventId(
    organizationId,
    input.eventId,
  );

  const settings = existing
    ? await updateRegistrationSettingsRecord(organizationId, input.eventId, data)
    : await createRegistrationSettings(organizationId, input.eventId, data);

  await syncEventRegistrationDenormalizedFields(input.eventId, {
    isEnabled: settings.isEnabled,
    opensAt: settings.opensAt,
    closesAt: settings.closesAt,
    capacity: settings.capacity,
    waitlistEnabled: settings.waitlistEnabled,
    instructions: settings.instructions,
  });

  await audit(
    organizationId,
    actor,
    existing ? "UPDATE" : "CREATE",
    "EventRegistrationSettings",
    settings.id,
    buildSafeAuditChanges({
      isEnabled: settings.isEnabled,
      capacity: settings.capacity,
      waitlistEnabled: settings.waitlistEnabled,
      visibility: settings.visibility,
      promotionOfferTtlMinutes: settings.promotionOfferTtlMinutes,
    }),
  );

  const capacityIncreased =
    existing &&
    ((existing.capacity != null &&
      settings.capacity != null &&
      settings.capacity > existing.capacity) ||
      (existing.capacity != null && settings.capacity == null));

  if (capacityIncreased && settings.waitlistEnabled) {
    await promoteNextWaitlistedParty(organizationId, input.eventId, actor);
  }

  return settings;
}

export async function getPublicRegistrationPage(slug: string, options?: {
  isAuthenticated?: boolean;
  isStaff?: boolean;
}) {
  const organizationId = await getOrganizationId();
  const event = await findEventBySlugForRegistration(organizationId, slug);
  if (!event || event.eventStatus !== "PUBLISHED") {
    throw new Error("Event not found.");
  }

  // Never leak private events via public registration
  if (event.visibility === "PRIVATE") {
    throw new Error("Event not found.");
  }

  const settings = event.registrationSettings;
  if (!settings || !settings.isEnabled) {
    throw new Error("Registration is not available for this event.");
  }

  if (settings.visibility === "STAFF_ONLY" && !options?.isStaff) {
    throw new Error("Event not found.");
  }

  if (
    settings.visibility === "MEMBERS_ONLY" &&
    !options?.isAuthenticated &&
    !options?.isStaff
  ) {
    throw new Error("Sign in is required to view this registration page.");
  }

  if (event.visibility === "STAFF_ONLY" && !options?.isStaff) {
    throw new Error("Event not found.");
  }

  if (
    event.visibility === "MEMBERS_ONLY" &&
    !options?.isAuthenticated &&
    !options?.isStaff
  ) {
    throw new Error("Sign in is required to view this registration page.");
  }

  const [confirmedCount, waitlistCount] = await Promise.all([
    countCapacityUsed(organizationId, event.id),
    countWaitlistUsed(organizationId, event.id),
  ]);

  const capacityRemaining =
    settings.capacity == null
      ? null
      : Math.max(0, settings.capacity - confirmedCount);

  return {
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      shortDescription: event.shortDescription,
      description: event.description,
      startDateTime: event.startDateTime,
      endDateTime: event.endDateTime,
      timezone: event.timezone,
      isAllDay: event.isAllDay,
      location: event.location,
      category: event.category,
    },
    settings: {
      ...settings,
      // Hide internal capacity details when not public
      capacity: settings.showCapacityPublicly ? settings.capacity : null,
      waitlistEnabled: settings.showWaitlistPublicly
        ? settings.waitlistEnabled
        : settings.waitlistEnabled && capacityRemaining === 0,
    },
    summary: {
      confirmedCount: settings.showCapacityPublicly ? confirmedCount : null,
      waitlistCount: settings.showWaitlistPublicly ? waitlistCount : null,
      capacityRemaining: settings.showCapacityPublicly ? capacityRemaining : null,
    },
  };
}

export async function submitRegistration(
  input: SubmitRegistrationInput,
  actor: Actor,
  options?: { isStaffManual?: boolean; source?: EventRegistrationSource },
) {
  const organizationId = await getOrganizationId();
  const event = await findEventLeanForRegistration(organizationId, input.eventId);
  if (!event) {
    throw new RegistrationError("EVENT_NOT_FOUND", "Event not found.");
  }
  if (event.eventStatus !== "PUBLISHED" && !options?.isStaffManual) {
    throw new RegistrationError(
      "EVENT_NOT_REGISTERABLE",
      "Registration is only available for published events.",
    );
  }
  if (event.visibility === "PRIVATE" && !options?.isStaffManual) {
    throw new RegistrationError("EVENT_NOT_FOUND", "Event not found.");
  }

  const settings = event.registrationSettings;
  if (!settings) {
    throw new RegistrationError(
      "REGISTRATION_DISABLED",
      "Registration is not available for this event.",
    );
  }

  validateSubmitAgainstSettings(input, settings, {
    isAuthenticated: Boolean(actor.userAccountId),
    isStaffManual: options?.isStaffManual,
  });

  const partySize = input.attendees.length;
  const source: EventRegistrationSource =
    options?.source ??
    (options?.isStaffManual
      ? "STAFF"
      : actor.userAccountId
        ? "MEMBER_PORTAL"
        : "PUBLIC_GUEST");

  const registration = await prisma.$transaction(async (tx) => {
    await lockRegistrationSettingsForEvent(event.id, tx);
    const lockedSettings = await tx.eventRegistrationSettings.findFirst({
      where: { organizationId, eventId: event.id },
    });
    if (!lockedSettings) {
      throw new RegistrationError(
        "REGISTRATION_DISABLED",
        "Registration is not available for this event.",
      );
    }

    const now = new Date();
    await expireElapsedOffersInTx(organizationId, event.id, now, tx);

    const used = await countCapacityUsed(organizationId, event.id, tx);
    const capacity = lockedSettings.capacity;
    const remaining = capacity == null ? Number.POSITIVE_INFINITY : capacity - used;

    let status: EventRegistrationStatus = lockedSettings.confirmationRequired
      ? "PENDING"
      : "CONFIRMED";
    let waitlistPosition: number | null = null;
    let attendeeStatus: EventAttendeeStatus =
      status === "PENDING" ? "REGISTERED" : "CONFIRMED";

    if (remaining >= partySize) {
      // keep PENDING/CONFIRMED above
    } else if (lockedSettings.waitlistEnabled) {
      const waitlistUsed = await countWaitlistUsed(organizationId, event.id, tx);
      if (
        lockedSettings.waitlistCapacity != null &&
        waitlistUsed + partySize > lockedSettings.waitlistCapacity
      ) {
        throw new RegistrationError("WAITLIST_FULL", "The waitlist is full.");
      }
      status = "WAITLISTED";
      attendeeStatus = "WAITLISTED";
      waitlistPosition = await getNextWaitlistPosition(organizationId, event.id, tx);
    } else {
      throw new RegistrationError(
        "CAPACITY_UNAVAILABLE",
        "This event is at capacity.",
      );
    }

    let code = uniqueConfirmationCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await tx.eventRegistration.findFirst({
        where: { organizationId, confirmationCode: code },
        select: { id: true },
      });
      if (!clash) break;
      code = uniqueConfirmationCode();
    }

    return createRegistrationWithAttendees(
      {
        organizationId,
        eventId: event.id,
        status,
        source,
        confirmationCode: code,
        memberId: input.memberId ?? null,
        householdId: input.householdId ?? null,
        registeredByUserId: actor.userAccountId,
        primaryContactName: input.primaryContactName,
        primaryContactEmail: input.primaryContactEmail ?? null,
        primaryContactPhone: input.primaryContactPhone ?? null,
        notes: input.notes ?? null,
        partySize,
        waitlistPosition,
        confirmedAt: status === "CONFIRMED" ? new Date() : null,
        attendees: mapAttendeeWrites(input.attendees, attendeeStatus, waitlistPosition),
        createWaitlistEntry: status === "WAITLISTED",
      },
      tx,
    );
  });

  enqueueRegistrationNotification({
    type:
      registration.status === "WAITLISTED"
        ? "REGISTRATION_WAITLISTED"
        : "REGISTRATION_CONFIRMED",
    organizationId,
    eventId: event.id,
    registrationId: registration.id,
    recipientEmail: registration.primaryContactEmail,
    message:
      registration.status === "WAITLISTED"
        ? `Waitlisted for ${event.title}. Code ${registration.confirmationCode}. Position ${registration.waitlistPosition ?? ""}.`
        : `Confirmed for ${event.title}. Code ${registration.confirmationCode}.`,
  });

  await audit(
    organizationId,
    actor,
    "CREATE",
    "EventRegistration",
    registration.id,
    buildSafeAuditChanges({
      confirmationCode: registration.confirmationCode,
      status: registration.status,
      partySize: registration.partySize,
      eventId: event.id,
      source: registration.source,
    }),
  );

  return registration;
}

export async function cancelRegistration(
  input: CancelRegistrationInput,
  actor: Actor,
  options?: { isStaff?: boolean },
) {
  const organizationId = await getOrganizationId();
  const registration = await findRegistrationByConfirmationCode(
    organizationId,
    input.confirmationCode,
  );
  if (!registration) {
    throw new RegistrationError("NOT_FOUND", "Registration not found.");
  }

  if (
    input.email &&
    registration.primaryContactEmail &&
    registration.primaryContactEmail.toLowerCase() !== input.email.toLowerCase()
  ) {
    throw new RegistrationError(
      "VALIDATION",
      "Email does not match this registration.",
    );
  }

  // Idempotent cancel
  if (registration.status === "CANCELLED") {
    return registration;
  }

  const settings = await findRegistrationSettingsByEventId(
    organizationId,
    registration.eventId,
  );

  if (!options?.isStaff) {
    if (!settings?.allowCancellation) {
      throw new RegistrationError(
        "CANCELLATION_DISABLED",
        "Cancellation is not allowed for this event.",
      );
    }
    if (
      settings.cancellationDeadline &&
      new Date() > settings.cancellationDeadline
    ) {
      throw new RegistrationError(
        "CANCELLATION_DEADLINE_PASSED",
        "The cancellation deadline has passed.",
      );
    }
  } else {
    await requireEventPermission(
      organizationId,
      (a) => a.canManageRegistration,
      "You do not have permission to cancel registrations.",
    );
  }

  const wasCounted =
    registration.status === "PENDING" ||
    registration.status === "CONFIRMED" ||
    registration.status === "OFFERED" ||
    registration.status === "CHECKED_IN";

  const updated = await prisma.$transaction(async (tx) => {
    await lockRegistrationSettingsForEvent(registration.eventId, tx);
    const cancelled = await updateRegistrationStatus(
      registration.id,
      {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: input.reason ?? null,
        cancelledByUserId: actor.userAccountId,
        waitlistPosition: null,
        offeredAt: null,
        offerExpiresAt: null,
      },
      tx,
    );
    await updateAttendeesStatusForRegistration(
      registration.id,
      "CANCELLED",
      undefined,
      tx,
    );
    if (registration.waitlistEntry) {
      await tx.eventWaitlistEntry.update({
        where: { id: registration.waitlistEntry.id },
        data: {
          status: "CANCELLED",
          offeredAt: null,
          offerExpiresAt: null,
        },
      });
    }
    await revokeActivePromotionOffersForRegistration(registration.id, tx);
    return cancelled;
  });

  enqueueRegistrationNotification({
    type: "REGISTRATION_CANCELLED",
    organizationId,
    eventId: registration.eventId,
    registrationId: updated.id,
    recipientEmail: updated.primaryContactEmail,
    message: `Registration ${updated.confirmationCode} cancelled.`,
  });

  await audit(
    organizationId,
    actor,
    "CANCEL",
    "EventRegistration",
    updated.id,
    buildSafeAuditChanges({
      confirmationCode: updated.confirmationCode,
      reason: input.reason ?? null,
    }),
  );

  if (wasCounted && settings?.waitlistEnabled) {
    await promoteNextWaitlistedParty(
      organizationId,
      registration.eventId,
      actor,
    );
  }

  return updated;
}

/** Staff: create a promotion offer for a specific waitlisted registration. */
export async function promoteWaitlistRegistration(
  registrationId: string,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageRegistration,
    "You do not have permission to promote waitlist registrations.",
  );

  const registration = await findRegistrationById(organizationId, registrationId);
  if (!registration) {
    throw new RegistrationError("NOT_FOUND", "Registration not found.");
  }
  if (registration.status !== "WAITLISTED") {
    throw new RegistrationError(
      "VALIDATION",
      "Only waitlisted registrations can be promoted.",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockRegistrationSettingsForEvent(registration.eventId, tx);
    const settings = await tx.eventRegistrationSettings.findFirst({
      where: { organizationId, eventId: registration.eventId },
    });
    if (!settings) {
      throw new RegistrationError(
        "REGISTRATION_DISABLED",
        "Registration settings missing.",
      );
    }
    const now = new Date();
    await expireElapsedOffersInTx(organizationId, registration.eventId, now, tx);
    const used = await countCapacityUsed(organizationId, registration.eventId, tx);
    const remaining =
      settings.capacity == null
        ? Number.POSITIVE_INFINITY
        : settings.capacity - used;
    if (registration.partySize > remaining) {
      throw new RegistrationError(
        "CAPACITY_UNAVAILABLE",
        "Not enough capacity to promote this registration.",
      );
    }

    const entry = await tx.eventWaitlistEntry.findUnique({
      where: { registrationId: registration.id },
    });
    if (!entry || entry.status !== "WAITING") {
      throw new RegistrationError(
        "VALIDATION",
        "Waitlist entry is not eligible for an offer.",
      );
    }

    const ttlMinutes = Math.max(1, settings.promotionOfferTtlMinutes || 1440);
    const offerExpiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
    const rawToken = generatePromotionOfferToken();
    const tokenHash = hashPromotionOfferToken(rawToken);

    const updated = await updateRegistrationStatus(
      registration.id,
      {
        status: "OFFERED",
        offeredAt: now,
        offerExpiresAt,
      },
      tx,
    );
    await tx.eventWaitlistEntry.update({
      where: { id: entry.id },
      data: { status: "OFFERED", offeredAt: now, offerExpiresAt },
    });
    await revokeActivePromotionOffersForRegistration(registration.id, tx);
    await createPromotionOffer(
      {
        organizationId,
        eventId: registration.eventId,
        registrationId: registration.id,
        tokenHash,
        expiresAt: offerExpiresAt,
      },
      tx,
    );
    return { updated, rawToken, offerExpiresAt };
  });

  enqueueRegistrationNotification({
    type: "WAITLIST_OFFERED",
    organizationId,
    eventId: registration.eventId,
    registrationId: result.updated.id,
    recipientEmail: result.updated.primaryContactEmail,
    message: `A seat is available for ${result.updated.confirmationCode}.`,
    meta: {
      offerToken: result.rawToken,
      offerExpiresAt: result.offerExpiresAt.toISOString(),
      acceptPath: `/register/offer/accept?token=${encodeURIComponent(result.rawToken)}`,
      declinePath: `/register/offer/decline?token=${encodeURIComponent(result.rawToken)}`,
    },
  });

  await audit(
    organizationId,
    actor,
    "WAITLIST_OFFER",
    "EventRegistration",
    result.updated.id,
    buildSafeAuditChanges({
      confirmationCode: result.updated.confirmationCode,
      status: "OFFERED",
    }),
  );

  return result.updated;
}

export async function acceptPromotionOffer(rawToken: string) {
  const organizationId = await getOrganizationId();
  const tokenHash = hashPromotionOfferToken(rawToken.trim());

  const result = await prisma.$transaction(async (tx) => {
    const offer = await findActivePromotionOfferByTokenHash(
      organizationId,
      tokenHash,
      tx,
    );
    if (!offer) {
      throw new RegistrationError("OFFER_INVALID", "Promotion offer is invalid.");
    }

    await lockRegistrationSettingsForEvent(offer.eventId, tx);
    const now = new Date();

    if (offer.expiresAt <= now) {
      throw new RegistrationError("OFFER_EXPIRED", "This promotion offer has expired.");
    }

    const registration = offer.registration;
    if (registration.status === "CONFIRMED") {
      return { registration, alreadyAccepted: true as const };
    }
    if (registration.status !== "OFFERED") {
      throw new RegistrationError(
        "OFFER_INVALID",
        "This promotion offer is no longer available.",
      );
    }

    const updated = await updateRegistrationStatus(
      registration.id,
      {
        status: "CONFIRMED",
        waitlistPosition: null,
        confirmedAt: now,
        offeredAt: registration.offeredAt,
        offerExpiresAt: null,
      },
      tx,
    );
    await updateAttendeesStatusForRegistration(
      registration.id,
      "CONFIRMED",
      { waitlistPosition: null },
      tx,
    );
    await tx.eventWaitlistEntry.updateMany({
      where: { registrationId: registration.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: now,
        offerExpiresAt: null,
      },
    });
    await tx.eventPromotionOffer.update({
      where: { id: offer.id },
      data: { usedAt: now },
    });

    return { registration: updated, alreadyAccepted: false as const };
  });

  if (!result.alreadyAccepted) {
    enqueueRegistrationNotification({
      type: "WAITLIST_OFFER_ACCEPTED",
      organizationId,
      eventId: result.registration.eventId,
      registrationId: result.registration.id,
      recipientEmail: result.registration.primaryContactEmail,
      message: `Offer accepted. Registration ${result.registration.confirmationCode} is confirmed.`,
    });

    await audit(
      organizationId,
      { userAccountId: null, email: result.registration.primaryContactEmail },
      "WAITLIST_ACCEPT",
      "EventRegistration",
      result.registration.id,
      buildSafeAuditChanges({
        confirmationCode: result.registration.confirmationCode,
        status: "CONFIRMED",
      }),
    );
  }

  return result.registration;
}

export async function declinePromotionOffer(rawToken: string) {
  const organizationId = await getOrganizationId();
  const tokenHash = hashPromotionOfferToken(rawToken.trim());

  const result = await prisma.$transaction(async (tx) => {
    const offer = await findActivePromotionOfferByTokenHash(
      organizationId,
      tokenHash,
      tx,
    );
    if (!offer) {
      throw new RegistrationError("OFFER_INVALID", "Promotion offer is invalid.");
    }

    await lockRegistrationSettingsForEvent(offer.eventId, tx);
    const now = new Date();
    const registration = offer.registration;

    if (
      registration.status === "DECLINED" ||
      registration.status === "EXPIRED" ||
      registration.status === "CANCELLED"
    ) {
      return { registration, eventId: offer.eventId, alreadyDone: true as const };
    }

    if (registration.status !== "OFFERED") {
      throw new RegistrationError(
        "OFFER_INVALID",
        "This promotion offer is no longer available.",
      );
    }

    const updated = await updateRegistrationStatus(
      registration.id,
      {
        status: "DECLINED",
        waitlistPosition: null,
        offeredAt: null,
        offerExpiresAt: null,
      },
      tx,
    );
    await updateAttendeesStatusForRegistration(
      registration.id,
      "CANCELLED",
      { waitlistPosition: null },
      tx,
    );
    await tx.eventWaitlistEntry.updateMany({
      where: { registrationId: registration.id },
      data: {
        status: "DECLINED",
        declinedAt: now,
        offeredAt: null,
        offerExpiresAt: null,
      },
    });
    await tx.eventPromotionOffer.update({
      where: { id: offer.id },
      data: { usedAt: now },
    });

    return { registration: updated, eventId: offer.eventId, alreadyDone: false as const };
  });

  if (!result.alreadyDone) {
    enqueueRegistrationNotification({
      type: "WAITLIST_OFFER_DECLINED",
      organizationId,
      eventId: result.eventId,
      registrationId: result.registration.id,
      recipientEmail: result.registration.primaryContactEmail,
      message: `Offer declined for ${result.registration.confirmationCode}.`,
    });

    await audit(
      organizationId,
      { userAccountId: null, email: result.registration.primaryContactEmail },
      "WAITLIST_DECLINE",
      "EventRegistration",
      result.registration.id,
      buildSafeAuditChanges({
        confirmationCode: result.registration.confirmationCode,
        status: "DECLINED",
      }),
    );

    await promoteNextWaitlistedParty(organizationId, result.eventId, {
      userAccountId: null,
      email: null,
    });
  }

  return result.registration;
}

/** Expire elapsed offers and attempt the next promotion (callable by jobs/staff). */
export async function processWaitlistPromotionCycle(eventId: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await prisma.$transaction(async (tx) => {
    await lockRegistrationSettingsForEvent(eventId, tx);
    await expireElapsedOffersInTx(organizationId, eventId, new Date(), tx);
  });
  return promoteNextWaitlistedParty(organizationId, eventId, actor, { force: true });
}

export async function getEventRegistrations(eventId: string) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageRegistration,
    "You do not have permission to view registrations.",
  );

  const event = await findEventLeanForRegistration(organizationId, eventId);
  if (!event) throw new Error("Event not found.");

  const [registrations, summary, access] = await Promise.all([
    findEventRegistrations(organizationId, eventId),
    getRegistrationSummaryCounts(organizationId, eventId),
    getEventAccess(organizationId),
  ]);

  const registrationsWithQr = registrations.map((registration) => ({
    ...registration,
    attendees: registration.attendees.map((attendee) => {
      const base = {
        ...attendee,
        qrPayload: signCheckInPayload(attendee.id, attendee.eventId),
      };
      if (access.canReadSensitiveAttendee) return base;
      // Omit sensitive fields rather than returning null
      return {
        id: base.id,
        organizationId: base.organizationId,
        registrationId: base.registrationId,
        eventId: base.eventId,
        status: base.status,
        attendeeType: base.attendeeType,
        memberId: base.memberId,
        firstName: base.firstName,
        lastName: base.lastName,
        email: base.email,
        phone: base.phone,
        dateOfBirth: base.dateOfBirth,
        isGuest: base.isGuest,
        isMinor: base.isMinor,
        guardianName: base.guardianName,
        guardianPhone: base.guardianPhone,
        emergencyContactName: base.emergencyContactName,
        emergencyContactPhone: base.emergencyContactPhone,
        waitlistPosition: base.waitlistPosition,
        checkedInAt: base.checkedInAt,
        checkedInByUserId: base.checkedInByUserId,
        checkInToken: base.checkInToken,
        notes: base.notes,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
        member: base.member,
        qrPayload: base.qrPayload,
      };
    }),
  }));

  return { event, registrations: registrationsWithQr, summary, access };
}

export async function getRegistrationById(registrationId: string) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageRegistration,
    "You do not have permission to view registrations.",
  );

  const registration = await findRegistrationById(organizationId, registrationId);
  if (!registration) throw new Error("Registration not found.");
  return registration;
}

export async function getRegistrationByConfirmationCodePublic(code: string) {
  const organizationId = await getOrganizationId();
  const registration = await findRegistrationByConfirmationCode(
    organizationId,
    code,
  );
  if (!registration) throw new Error("Registration not found.");

  return {
    confirmationCode: registration.confirmationCode,
    status: registration.status,
    primaryContactName: registration.primaryContactName,
    primaryContactEmail: registration.primaryContactEmail,
    partySize: registration.partySize,
    waitlistPosition: registration.waitlistPosition,
    event: {
      id: registration.event.id,
      title: registration.event.title,
      slug: registration.event.slug,
      startDateTime: registration.event.startDateTime,
      endDateTime: registration.event.endDateTime,
    },
    attendees: registration.attendees.map((a) => ({
      id: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
      status: a.status,
      isGuest: a.isGuest,
      checkedInAt: a.checkedInAt,
      // Signed QR payload for display — not the raw random token
      qrPayload: signCheckInPayload(a.id, a.eventId),
    })),
  };
}

export async function staffAddRegistration(
  input: SubmitRegistrationInput,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageRegistration,
    "You do not have permission to add registrations.",
  );
  return submitRegistration(input, actor, { isStaffManual: true });
}

export async function checkInAttendee(attendeeId: string, actor: Actor) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canCheckIn,
    "You do not have permission to check in attendees.",
  );

  const attendee = await findAttendeeById(organizationId, attendeeId);
  if (!attendee) throw new Error("Attendee not found.");
  if (attendee.status === "CANCELLED") {
    throw new Error("Cannot check in a cancelled attendee.");
  }
  if (attendee.status === "CHECKED_IN") {
    return attendee;
  }

  const settings = attendee.event.registrationSettings;
  if (settings && !settings.checkInEnabled) {
    throw new Error("Check-in is disabled for this event.");
  }

  const updated = await markAttendeeCheckedIn(attendee.id, actor.userAccountId);

  const siblings = await prisma.eventAttendee.findMany({
    where: { registrationId: attendee.registrationId },
    select: { id: true, status: true },
  });
  const allCheckedIn = siblings.every(
    (s) => s.id === attendee.id || s.status === "CHECKED_IN",
  );
  if (allCheckedIn) {
    await updateRegistrationStatus(attendee.registrationId, {
      status: "CHECKED_IN",
      checkedInAt: new Date(),
    });
  }

  if (attendee.memberId) {
    const attendanceDate = new Date(attendee.event.startDateTime);
    attendanceDate.setUTCHours(0, 0, 0, 0);
    await createMemberAttendanceForCheckIn({
      organizationId,
      memberId: attendee.memberId,
      eventId: attendee.eventId,
      serviceName: attendee.event.title,
      attendanceDate,
      checkedInByUserId: actor.userAccountId,
    });
  }

  await audit(
    organizationId,
    actor,
    "CHECK_IN",
    "EventAttendee",
    updated.id,
    buildSafeAuditChanges({
      attendeeId: updated.id,
      eventId: updated.eventId,
      memberId: updated.memberId,
    }),
  );

  return updated;
}

export async function checkInByToken(
  eventId: string,
  token: string,
  actor: Actor,
) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canCheckIn,
    "You do not have permission to check in attendees.",
  );

  // Prefer HMAC-signed QR payload; fall back to raw checkInToken lookup
  const verified = verifyCheckInPayload(token.trim(), eventId);
  if (verified.ok) {
    const attendee = await findAttendeeById(organizationId, verified.attendeeId);
    if (!attendee || attendee.eventId !== eventId) {
      throw new Error("Check-in token does not match this event.");
    }
    return checkInAttendee(attendee.id, actor);
  }

  const byRaw = await findAttendeeByCheckInToken(
    organizationId,
    eventId,
    token.trim(),
  );
  if (byRaw) {
    return checkInAttendee(byRaw.id, actor);
  }

  throw new Error(verified.message || "Invalid check-in token.");
}

export async function exportEventRegistrationsCsv(eventId: string) {
  const organizationId = await getOrganizationId();
  const access = await requireEventPermission(
    organizationId,
    (a) => a.canExportRegistrations,
    "You do not have permission to export registrations.",
  );

  const rows = await findExportRegistrationRows(organizationId, eventId);
  const includeSensitive = access.canReadSensitiveAttendee;
  const header = [
    "confirmationCode",
    "registrationStatus",
    "source",
    "primaryContactName",
    "primaryContactEmail",
    "partySize",
    "waitlistPosition",
    "attendeeFirstName",
    "attendeeLastName",
    "attendeeEmail",
    "attendeeStatus",
    "isGuest",
    "checkedInAt",
    "registeredAt",
    ...(includeSensitive
      ? ["accommodationRequest", "dietaryNotes", "internalNotes"]
      : []),
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    for (const attendee of row.attendees) {
      const cells = [
        row.confirmationCode,
        row.status,
        row.source,
        row.primaryContactName,
        row.primaryContactEmail ?? "",
        String(row.partySize),
        row.waitlistPosition != null ? String(row.waitlistPosition) : "",
        attendee.firstName,
        attendee.lastName,
        attendee.email ?? "",
        attendee.status,
        attendee.isGuest ? "yes" : "no",
        attendee.checkedInAt?.toISOString() ?? "",
        row.createdAt.toISOString(),
        ...(includeSensitive
          ? [
              attendee.accommodationRequest ?? "",
              attendee.dietaryNotes ?? "",
              attendee.internalNotes ?? "",
            ]
          : []),
      ].map((value) => {
        const text = String(value);
        if (text.includes(",") || text.includes('"') || text.includes("\n")) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      });
      lines.push(cells.join(","));
    }
  }

  return {
    filename: `event-${eventId}-registrations.csv`,
    csv: lines.join("\n"),
  };
}

export async function getRegistrationSummary(eventId: string) {
  const organizationId = await getOrganizationId();
  const access = await getEventAccess(organizationId);
  if (!access.canView) throw new Error("You do not have permission to view this event.");

  return getRegistrationSummaryCounts(organizationId, eventId);
}

export async function getAttendeeQrPayload(attendeeId: string) {
  const organizationId = await getOrganizationId();
  await requireEventPermission(
    organizationId,
    (a) => a.canManageRegistration || a.canCheckIn,
    "You do not have permission to view check-in QR codes.",
  );

  const attendee = await findAttendeeById(organizationId, attendeeId);
  if (!attendee) throw new Error("Attendee not found.");
  return {
    attendeeId: attendee.id,
    eventId: attendee.eventId,
    payload: signCheckInPayload(attendee.id, attendee.eventId),
  };
}
