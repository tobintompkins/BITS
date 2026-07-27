/**
 * Blueprint 7.3T — secure QR token resolution and eligibility (internal, read-only).
 *
 * Hashes the raw token immediately, resolves by hash + EVENT_CHECK_IN purpose,
 * verifies tenant/event scope, token state, registration/attendee eligibility,
 * and check-in window. Does not mutate attendance, tokens, or stations.
 *
 * Staff-only (`canOperateCheckIn`). No fallback-code plaintext lookup.
 * Invalid / wrong-scope / bad-state tokens all surface as INVALID_QR_PASS.
 */
import { requireEventPermission } from "@/lib/auth/event-permissions";
import {
  ELIGIBLE_ATTENDEE_STATUSES_FOR_QR_PASS,
  ELIGIBLE_REGISTRATION_STATUSES_FOR_QR_PASS,
  EVENT_QR_PASS_DEFAULT_PURPOSE,
} from "@/lib/constants/event-qr-pass";
import { prisma } from "@/lib/db/prisma";
import { CheckInError } from "@/lib/errors/check-in-errors";
import { QrPassRawTokenInput } from "@/lib/events/qr-pass-raw-token-input";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import { findActiveQrPassByHashAndPurpose } from "@/server/repositories/event-qr-pass.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type Actor = { userAccountId: string | null; email: string | null };

export type QrPassResolutionDto = {
  passId: string;
  eventId: string;
  registrationId: string;
  bindingType: "PARTY" | "ATTENDEE";
  attendeeId: string | null;
  /** Eligible attendee opaque IDs for a future staff selection step (7.3F-compatible). */
  eligibleAttendeeIds: string[];
  expiresAt: Date;
  eligibility: "USABLE";
};

function invalidToken(): never {
  throw new CheckInError("INVALID_QR_PASS", "QR pass is invalid.");
}

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new CheckInError("EVENT_NOT_FOUND", "Organization not found.");
  }
  return organization.id;
}

function assertCheckInWindow(settings: {
  checkInEnabled: boolean;
  qrPassEnabled: boolean;
  checkInOpensAt: Date | null;
  checkInClosesAt: Date | null;
}, now: Date) {
  if (!settings.checkInEnabled || !settings.qrPassEnabled) {
    throw new CheckInError(
      "CHECK_IN_DISABLED",
      "Check-in is disabled for this event.",
    );
  }
  if (settings.checkInOpensAt && now < settings.checkInOpensAt) {
    throw new CheckInError("CHECK_IN_NOT_OPEN", "Check-in has not opened yet.");
  }
  if (settings.checkInClosesAt && now > settings.checkInClosesAt) {
    throw new CheckInError("CHECK_IN_CLOSED", "Check-in has closed.");
  }
}

/**
 * Resolve a raw event-check-in QR token into a safe, usable pass result.
 * Read-only: no lastUsedAt, attendance, audit success, or token mutation.
 */
export async function resolveQrPassForCheckIn(
  input: {
    eventId: string;
    rawToken: QrPassRawTokenInput | string;
    now?: Date;
  },
  actor: Actor,
): Promise<QrPassResolutionDto> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();

  try {
    const access = await requireEventPermission(
      organizationId,
      (a) => a.canOperateCheckIn,
      "You do not have permission to resolve QR passes.",
    );
    await assertActionAllowed(
      "event.qr.resolve-readonly",
      actor.userAccountId ?? access.userAccountId,
    );

    const secret =
      input.rawToken instanceof QrPassRawTokenInput
        ? input.rawToken
        : QrPassRawTokenInput.fromUnknown(input.rawToken);
    if (!secret) {
      invalidToken();
    }

    const tokenHash = secret.consumeTokenHash();
    if (!tokenHash) {
      invalidToken();
    }

    // Hash-only lookup; no fallback plaintext path in 7.3T.
    const pass = await findActiveQrPassByHashAndPurpose({
      organizationId,
      tokenHash,
      purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
      now,
    });

    // Mask wrong-event / missing / inactive identically.
    if (!pass || pass.eventId !== input.eventId) {
      invalidToken();
    }
    if (pass.status !== "ACTIVE" || pass.revokedAt || pass.replacedByTokenId) {
      invalidToken();
    }
    if (pass.expiresAt <= now) {
      invalidToken();
    }

    const event = await prisma.event.findFirst({
      where: { id: input.eventId, organizationId },
      select: {
        id: true,
        eventStatus: true,
        checkInSettings: {
          select: {
            checkInEnabled: true,
            qrPassEnabled: true,
            checkInOpensAt: true,
            checkInClosesAt: true,
          },
        },
      },
    });
    if (!event || event.eventStatus === "CANCELLED") {
      invalidToken();
    }

    // Window checks only after the token is authorized and scoped.
    const settings = event.checkInSettings;
    if (!settings) {
      throw new CheckInError(
        "CHECK_IN_DISABLED",
        "Check-in is disabled for this event.",
      );
    }
    assertCheckInWindow(settings, now);

    const registration = await prisma.eventRegistration.findFirst({
      where: {
        id: pass.registrationId,
        organizationId,
        eventId: input.eventId,
      },
      select: {
        id: true,
        status: true,
        attendees: {
          where: {
            status: {
              in: [...ELIGIBLE_ATTENDEE_STATUSES_FOR_QR_PASS],
            },
          },
          select: { id: true, status: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!registration) {
      invalidToken();
    }
    if (
      !(ELIGIBLE_REGISTRATION_STATUSES_FOR_QR_PASS as readonly string[]).includes(
        registration.status,
      )
    ) {
      throw new CheckInError(
        "REGISTRATION_NOT_ELIGIBLE",
        "Registration is not eligible for check-in.",
      );
    }

    const eligibleAttendeeIds = registration.attendees.map((row) => row.id);
    const bindingType = pass.attendeeId ? "ATTENDEE" : "PARTY";

    if (pass.attendeeId) {
      if (!eligibleAttendeeIds.includes(pass.attendeeId)) {
        invalidToken();
      }
    }

    return {
      passId: pass.id,
      eventId: pass.eventId,
      registrationId: pass.registrationId,
      bindingType,
      attendeeId: pass.attendeeId,
      eligibleAttendeeIds:
        bindingType === "ATTENDEE" && pass.attendeeId
          ? [pass.attendeeId]
          : eligibleAttendeeIds,
      expiresAt: pass.expiresAt,
      eligibility: "USABLE",
    };
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof Error && /permission/i.test(error.message)) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

export const eventQrPassResolutionApi = {
  resolveQrPassForCheckIn,
} as const;
