/**
 * Blueprint 7.3Q — secure QR pass issuance, rotation, and revocation (internal only).
 *
 * Staff-authorized over the 7.3P foundation. Ops issue/resolve paths remain;
 * this service is the blueprint contract for future API (7.3R).
 *
 * Member/household ownership is not safely reusable yet — staff-only here.
 * Authorization: canOperateCheckIn || canManageCheckIn || canManageRegistration.
 *
 * Expiry policy: max(event.endDateTime, issuance time) + 24 hours.
 */
import { requireEventPermission } from "@/lib/auth/event-permissions";
import {
  ELIGIBLE_ATTENDEE_STATUSES_FOR_QR_PASS,
  ELIGIBLE_REGISTRATION_STATUSES_FOR_QR_PASS,
  EVENT_QR_PASS_DEFAULT_PURPOSE,
  EVENT_QR_PASS_EXPIRY_HOURS_AFTER_EVENT_END,
  EVENT_QR_PASS_HASH_COLLISION_RETRIES,
} from "@/lib/constants/event-qr-pass";
import { prisma } from "@/lib/db/prisma";
import { CheckInError } from "@/lib/errors/check-in-errors";
import {
  QrPassSecretResult,
  type QrPassRevokeResult,
} from "@/lib/events/qr-pass-secret-result";
import {
  generateQrFallbackCode,
  generateQrPassToken,
  hashQrFallbackCode,
  hashQrPassToken,
} from "@/lib/events/qr-pass-token";
import { assertActionAllowed } from "@/lib/security/rate-limit";
import { buildSafeAuditChanges } from "@/lib/validation/event-registration";
import {
  demoteActiveQrPassForReplacement,
  finalizeQrPassReplacement,
  listQrPassesForRegistration,
  lockActiveQrPassForBinding,
  lockQrPassForUpdate,
  lockRegistrationForQrPassMutation,
  markQrPassExpired,
  markQrPassRevoked,
  persistHashOnlyQrPass,
  QrPassFoundationError,
  toSafeQrPassDto,
} from "@/server/repositories/event-qr-pass.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

type Actor = { userAccountId: string | null; email: string | null };

type DbTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function mapFoundationError(error: unknown): never {
  if (error instanceof QrPassFoundationError) {
    if (error.code === "DUPLICATE") {
      throw new CheckInError("VALIDATION", error.message);
    }
    if (error.code === "VALIDATION" || error.code === "MISMATCH") {
      throw new CheckInError(
        error.code === "MISMATCH" ? "NOT_FOUND" : "VALIDATION",
        error.message,
      );
    }
    throw new CheckInError("NOT_FOUND", error.message);
  }
  throw error;
}

async function getOrganizationId() {
  const organization = await findPrimaryOrganization();
  if (!organization) {
    throw new CheckInError("EVENT_NOT_FOUND", "Organization not found.");
  }
  return organization.id;
}

async function requirePassManagement(organizationId: string) {
  return requireEventPermission(
    organizationId,
    (access) =>
      access.canOperateCheckIn ||
      access.canManageCheckIn ||
      access.canManageRegistration,
    "You do not have permission to manage QR passes.",
  );
}

function computeExpiresAt(eventEnd: Date, now: Date) {
  const base = Math.max(eventEnd.getTime(), now.getTime());
  return new Date(
    base + EVENT_QR_PASS_EXPIRY_HOURS_AFTER_EVENT_END * 60 * 60 * 1000,
  );
}

async function loadEligibleContext(
  organizationId: string,
  input: {
    eventId: string;
    registrationId: string;
    attendeeId?: string | null;
  },
  tx: DbTx,
) {
  const event = await tx.event.findFirst({
    where: { id: input.eventId, organizationId },
    select: {
      id: true,
      endDateTime: true,
      eventStatus: true,
      checkInSettings: {
        select: {
          checkInEnabled: true,
          qrPassEnabled: true,
        },
      },
    },
  });
  if (!event) {
    throw new CheckInError("EVENT_NOT_FOUND", "Event not found.");
  }
  if (event.eventStatus === "CANCELLED") {
    throw new CheckInError(
      "REGISTRATION_NOT_ELIGIBLE",
      "Event is cancelled.",
    );
  }

  const settings = event.checkInSettings;
  if (!settings?.checkInEnabled || !settings.qrPassEnabled) {
    throw new CheckInError(
      "CHECK_IN_DISABLED",
      "QR passes are not enabled for this event.",
    );
  }

  const locked = await lockRegistrationForQrPassMutation(
    {
      organizationId,
      eventId: input.eventId,
      registrationId: input.registrationId,
    },
    tx,
  );
  if (!locked) {
    throw new CheckInError("NOT_FOUND", "Registration not found.");
  }

  const registration = await tx.eventRegistration.findFirst({
    where: {
      id: input.registrationId,
      organizationId,
      eventId: input.eventId,
    },
    select: { id: true, status: true },
  });
  if (!registration) {
    throw new CheckInError("NOT_FOUND", "Registration not found.");
  }

  if (
    !(ELIGIBLE_REGISTRATION_STATUSES_FOR_QR_PASS as readonly string[]).includes(
      registration.status,
    )
  ) {
    throw new CheckInError(
      "REGISTRATION_NOT_ELIGIBLE",
      "Registration is not eligible for a QR pass.",
    );
  }

  const attendeeId = input.attendeeId ?? null;
  if (attendeeId) {
    const attendee = await tx.eventAttendee.findFirst({
      where: {
        id: attendeeId,
        organizationId,
        eventId: input.eventId,
        registrationId: input.registrationId,
      },
      select: { id: true, status: true },
    });
    if (!attendee) {
      throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
    }
    if (
      !(ELIGIBLE_ATTENDEE_STATUSES_FOR_QR_PASS as readonly string[]).includes(
        attendee.status,
      )
    ) {
      throw new CheckInError(
        "REGISTRATION_NOT_ELIGIBLE",
        "Attendee is not eligible for a QR pass.",
      );
    }
  }

  return { event, registration, attendeeId };
}

async function expireStaleActiveIfNeeded<
  T extends { id: string; expiresAt: Date; status: string },
>(pass: T | null, now: Date, tx: DbTx): Promise<T | null> {
  if (!pass || pass.status !== "ACTIVE") return null;
  if (pass.expiresAt > now) return pass;
  await markQrPassExpired(pass.id, tx);
  return null;
}

async function persistActivePassWithRetry(
  input: {
    organizationId: string;
    eventId: string;
    registrationId: string;
    attendeeId: string | null;
    expiresAt: Date;
    createdAt: Date;
  },
  tx: DbTx,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < EVENT_QR_PASS_HASH_COLLISION_RETRIES; attempt += 1) {
    const rawToken = generateQrPassToken();
    const fallbackCode = generateQrFallbackCode();
    try {
      const pass = await persistHashOnlyQrPass(
        {
          organizationId: input.organizationId,
          eventId: input.eventId,
          registrationId: input.registrationId,
          attendeeId: input.attendeeId,
          tokenHash: hashQrPassToken(rawToken),
          fallbackCodeHash: hashQrFallbackCode(fallbackCode),
          purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
          status: "ACTIVE",
          expiresAt: input.expiresAt,
          createdAt: input.createdAt,
        },
        tx,
      );
      return { pass, rawToken };
    } catch (error) {
      lastError = error;
      if (
        error instanceof QrPassFoundationError &&
        error.code === "DUPLICATE" &&
        attempt + 1 < EVENT_QR_PASS_HASH_COLLISION_RETRIES
      ) {
        continue;
      }
      mapFoundationError(error);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new CheckInError("VALIDATION", "Unable to persist QR pass.");
}

/**
 * Issue a party-level or attendee-level EVENT_CHECK_IN pass.
 * If an unexpired ACTIVE pass already exists, returns metadata without a raw token.
 */
export async function issueQrPassLifecycle(
  input: {
    eventId: string;
    registrationId: string;
    attendeeId?: string | null;
    now?: Date;
  },
  actor: Actor,
): Promise<QrPassSecretResult> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();

  try {
    const access = await requirePassManagement(organizationId);
    const actorUserId = actor.userAccountId ?? access.userAccountId;
    if (!actorUserId) {
      throw new CheckInError("FORBIDDEN", "Sign in is required to issue QR passes.");
    }
    await assertActionAllowed("event.qr.issue", actorUserId);

    return await prisma.$transaction(async (tx) => {
      const ctx = await loadEligibleContext(organizationId, input, tx);
      const expiresAt = computeExpiresAt(ctx.event.endDateTime, now);

      const lockedActive = await lockActiveQrPassForBinding(
        {
          organizationId,
          eventId: input.eventId,
          registrationId: input.registrationId,
          attendeeId: ctx.attendeeId,
        },
        tx,
      );
      const active = await expireStaleActiveIfNeeded(lockedActive, now, tx);

      if (active) {
        return new QrPassSecretResult({
          passId: active.id,
          eventId: active.eventId,
          registrationId: active.registrationId,
          attendeeId: active.attendeeId,
          purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
          expiresAt: active.expiresAt,
          reused: true,
          rawToken: null,
        });
      }

      const { pass, rawToken } = await persistActivePassWithRetry(
        {
          organizationId,
          eventId: input.eventId,
          registrationId: input.registrationId,
          attendeeId: ctx.attendeeId,
          expiresAt,
          createdAt: now,
        },
        tx,
      );

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserAccountId: actorUserId,
          action: "EVENT_QR_PASS_ISSUED",
          entityType: "EventQrPass",
          entityId: pass.id,
          changeMetadata: {
            changes: buildSafeAuditChanges({
              passId: pass.id,
              eventId: pass.eventId,
              registrationId: pass.registrationId,
              attendeeId: pass.attendeeId,
              purpose: pass.purpose,
              expiresAt: pass.expiresAt.toISOString(),
              result: "ISSUED",
            }),
          },
        },
      });

      return new QrPassSecretResult({
        passId: pass.id,
        eventId: pass.eventId,
        registrationId: pass.registrationId,
        attendeeId: pass.attendeeId,
        purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
        expiresAt: pass.expiresAt,
        reused: false,
        rawToken,
      });
    });
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof QrPassFoundationError) mapFoundationError(error);
    if (error instanceof Error && /permission/i.test(error.message)) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

/**
 * Rotate the ACTIVE pass for a binding (or explicit passId) and return a new raw token once.
 */
export async function rotateQrPassLifecycle(
  input: {
    eventId: string;
    registrationId: string;
    attendeeId?: string | null;
    passId?: string;
    now?: Date;
  },
  actor: Actor,
): Promise<QrPassSecretResult> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();

  try {
    const access = await requirePassManagement(organizationId);
    const actorUserId = actor.userAccountId ?? access.userAccountId;
    if (!actorUserId) {
      throw new CheckInError(
        "FORBIDDEN",
        "Sign in is required to rotate QR passes.",
      );
    }
    await assertActionAllowed("event.qr.rotate", actorUserId);

    return await prisma.$transaction(async (tx) => {
      const ctx = await loadEligibleContext(organizationId, input, tx);
      const expiresAt = computeExpiresAt(ctx.event.endDateTime, now);

      let previous =
        input.passId != null
          ? await lockQrPassForUpdate(
              {
                organizationId,
                eventId: input.eventId,
                passId: input.passId,
              },
              tx,
            )
          : await lockActiveQrPassForBinding(
              {
                organizationId,
                eventId: input.eventId,
                registrationId: input.registrationId,
                attendeeId: ctx.attendeeId,
              },
              tx,
            );

      if (!previous) {
        throw new CheckInError("NOT_FOUND", "QR pass not found.");
      }
      if (
        previous.registrationId !== input.registrationId ||
        previous.attendeeId !== ctx.attendeeId
      ) {
        throw new CheckInError("NOT_FOUND", "QR pass not found.");
      }
      if (previous.status !== "ACTIVE") {
        throw new CheckInError(
          previous.status === "REVOKED" || previous.status === "REPLACED"
            ? "QR_PASS_REVOKED"
            : "QR_PASS_EXPIRED",
          "No active QR pass is available to rotate.",
        );
      }

      const stillActive = await expireStaleActiveIfNeeded(previous, now, tx);
      if (!stillActive) {
        throw new CheckInError(
          "QR_PASS_EXPIRED",
          "No active QR pass is available to rotate.",
        );
      }
      previous = stillActive;

      await demoteActiveQrPassForReplacement(
        { passId: previous.id, at: now },
        tx,
      );

      const { pass, rawToken } = await persistActivePassWithRetry(
        {
          organizationId,
          eventId: input.eventId,
          registrationId: input.registrationId,
          attendeeId: ctx.attendeeId,
          expiresAt,
          createdAt: now,
        },
        tx,
      );

      await finalizeQrPassReplacement(
        {
          previousPassId: previous.id,
          replacementPassId: pass.id,
          at: now,
        },
        tx,
      );

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserAccountId: actorUserId,
          action: "EVENT_QR_PASS_ROTATED",
          entityType: "EventQrPass",
          entityId: pass.id,
          changeMetadata: {
            changes: buildSafeAuditChanges({
              passId: pass.id,
              previousPassId: previous.id,
              eventId: pass.eventId,
              registrationId: pass.registrationId,
              attendeeId: pass.attendeeId,
              purpose: pass.purpose,
              expiresAt: pass.expiresAt.toISOString(),
              result: "ROTATED",
            }),
          },
        },
      });

      return new QrPassSecretResult({
        passId: pass.id,
        eventId: pass.eventId,
        registrationId: pass.registrationId,
        attendeeId: pass.attendeeId,
        purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
        expiresAt: pass.expiresAt,
        reused: false,
        rawToken,
      });
    });
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof QrPassFoundationError) mapFoundationError(error);
    if (error instanceof Error && /permission/i.test(error.message)) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

/**
 * Revoke the ACTIVE pass for a binding (or explicit passId). Idempotent for
 * already revoked/replaced/expired rows — one material audit per transition.
 */
export async function revokeQrPassLifecycle(
  input: {
    eventId: string;
    registrationId: string;
    attendeeId?: string | null;
    passId?: string;
    now?: Date;
  },
  actor: Actor,
): Promise<QrPassRevokeResult> {
  const organizationId = await getOrganizationId();
  const now = input.now ?? new Date();

  try {
    const access = await requirePassManagement(organizationId);
    const actorUserId = actor.userAccountId ?? access.userAccountId;
    if (!actorUserId) {
      throw new CheckInError(
        "FORBIDDEN",
        "Sign in is required to revoke QR passes.",
      );
    }
    await assertActionAllowed("event.qr.revoke", actorUserId);

    return await prisma.$transaction(async (tx) => {
      // Revocation still requires the registration to exist in-tenant; eligibility
      // for issue is not required so cancelled registrations can revoke outstanding passes.
      const event = await tx.event.findFirst({
        where: { id: input.eventId, organizationId },
        select: { id: true },
      });
      if (!event) {
        throw new CheckInError("EVENT_NOT_FOUND", "Event not found.");
      }

      const locked = await lockRegistrationForQrPassMutation(
        {
          organizationId,
          eventId: input.eventId,
          registrationId: input.registrationId,
        },
        tx,
      );
      if (!locked) {
        throw new CheckInError("NOT_FOUND", "Registration not found.");
      }

      const attendeeId = input.attendeeId ?? null;
      if (attendeeId) {
        const attendee = await tx.eventAttendee.findFirst({
          where: {
            id: attendeeId,
            organizationId,
            eventId: input.eventId,
            registrationId: input.registrationId,
          },
          select: { id: true },
        });
        if (!attendee) {
          throw new CheckInError("ATTENDEE_NOT_FOUND", "Attendee not found.");
        }
      }

      const pass =
        input.passId != null
          ? await lockQrPassForUpdate(
              {
                organizationId,
                eventId: input.eventId,
                passId: input.passId,
              },
              tx,
            )
          : await lockActiveQrPassForBinding(
              {
                organizationId,
                eventId: input.eventId,
                registrationId: input.registrationId,
                attendeeId,
              },
              tx,
            );

      if (!pass) {
        // Idempotent: look up any historical pass for the binding when no ACTIVE row.
        const historical = await tx.eventQrPass.findFirst({
          where: {
            organizationId,
            eventId: input.eventId,
            registrationId: input.registrationId,
            attendeeId,
            purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
            ...(input.passId ? { id: input.passId } : {}),
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        });
        if (!historical) {
          throw new CheckInError("NOT_FOUND", "QR pass not found.");
        }
        return {
          passId: historical.id,
          eventId: historical.eventId,
          registrationId: historical.registrationId,
          attendeeId: historical.attendeeId,
          purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
          status: historical.status,
          transitioned: false,
          revokedAt: historical.revokedAt,
        };
      }

      if (
        pass.registrationId !== input.registrationId ||
        pass.attendeeId !== attendeeId
      ) {
        throw new CheckInError("NOT_FOUND", "QR pass not found.");
      }

      if (pass.status !== "ACTIVE") {
        return {
          passId: pass.id,
          eventId: pass.eventId,
          registrationId: pass.registrationId,
          attendeeId: pass.attendeeId,
          purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
          status: pass.status,
          transitioned: false,
          revokedAt: pass.revokedAt,
        };
      }

      if (pass.expiresAt <= now) {
        const expired = await markQrPassExpired(pass.id, tx);
        return {
          passId: expired.id,
          eventId: expired.eventId,
          registrationId: expired.registrationId,
          attendeeId: expired.attendeeId,
          purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
          status: "EXPIRED",
          transitioned: true,
          revokedAt: expired.revokedAt,
        };
      }

      const revoked = await markQrPassRevoked(
        {
          passId: pass.id,
          revokedAt: now,
          revokedByUserId: actorUserId,
        },
        tx,
      );

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserAccountId: actorUserId,
          action: "EVENT_QR_PASS_REVOKED",
          entityType: "EventQrPass",
          entityId: revoked.id,
          changeMetadata: {
            changes: buildSafeAuditChanges({
              passId: revoked.id,
              eventId: revoked.eventId,
              registrationId: revoked.registrationId,
              attendeeId: revoked.attendeeId,
              purpose: revoked.purpose,
              result: "REVOKED",
            }),
          },
        },
      });

      return {
        passId: revoked.id,
        eventId: revoked.eventId,
        registrationId: revoked.registrationId,
        attendeeId: revoked.attendeeId,
        purpose: EVENT_QR_PASS_DEFAULT_PURPOSE,
        status: "REVOKED",
        transitioned: true,
        revokedAt: revoked.revokedAt,
      };
    });
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof QrPassFoundationError) mapFoundationError(error);
    if (error instanceof Error && /permission/i.test(error.message)) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

/**
 * List safe QR pass metadata for one registration (no secrets).
 */
export async function listQrPassesLifecycle(
  input: {
    eventId: string;
    registrationId: string;
  },
  actor: Actor,
) {
  const organizationId = await getOrganizationId();

  try {
    const access = await requirePassManagement(organizationId);
    await assertActionAllowed(
      "event.qr.list",
      actor.userAccountId ?? access.userAccountId,
    );

    const registration = await prisma.eventRegistration.findFirst({
      where: {
        id: input.registrationId,
        organizationId,
        eventId: input.eventId,
      },
      select: { id: true },
    });
    if (!registration) {
      throw new CheckInError("NOT_FOUND", "Registration not found.");
    }

    const rows = await listQrPassesForRegistration({
      organizationId,
      eventId: input.eventId,
      registrationId: input.registrationId,
    });

    return rows.map((row) => toSafeQrPassDto(row));
  } catch (error) {
    if (error instanceof CheckInError) throw error;
    if (error instanceof QrPassFoundationError) mapFoundationError(error);
    if (error instanceof Error && /permission/i.test(error.message)) {
      throw new CheckInError("FORBIDDEN", error.message);
    }
    throw error;
  }
}

export const eventQrPassLifecycleApi = {
  issueQrPassLifecycle,
  rotateQrPassLifecycle,
  revokeQrPassLifecycle,
  listQrPassesLifecycle,
  toSafeQrPassDto,
} as const;
