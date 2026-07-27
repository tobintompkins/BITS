/**
 * Blueprint 7.3P — secure QR pass data foundation (internal persistence only).
 *
 * Reuses existing `EventQrPass` from Blueprint 7.3 ops.
 * Minimal surface for future issuance/rotation services (7.3Q+):
 * - persist a prepared hash-only token record
 * - resolve an active candidate by hash + purpose within tenant scope
 * - list tokens for one tenant-scoped registration
 * - lock a token row for future rotation/revocation
 *
 * Design: lookups always require organizationId + purpose. Token hashes are
 * globally unique, but rows are never returned without verifying tenant/purpose.
 *
 * No raw token generation/issuance. No public lookup. No hard-delete helper.
 * Safe DTOs never include tokenHash or fallbackCodeHash.
 */
import type { EventQrPass, Prisma } from "@/app/generated/prisma/client";
import {
  EVENT_QR_PASS_DEFAULT_PURPOSE,
  type EventQrPassPurpose,
} from "@/lib/constants/event-qr-pass";
import { prisma } from "@/lib/db/prisma";
import {
  assertQrPassExpiryAfterCreated,
  persistHashOnlyQrPassInputSchema,
} from "@/lib/validation/event-qr-pass";

export class QrPassFoundationError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "VALIDATION"
      | "DUPLICATE"
      | "MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "QrPassFoundationError";
  }
}

type DbClient = Prisma.TransactionClient | typeof prisma;

export type SafeQrPassDto = {
  id: string;
  organizationId: string;
  eventId: string;
  registrationId: string;
  attendeeId: string | null;
  purpose: EventQrPassPurpose;
  status: EventQrPass["status"];
  expiresAt: Date;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  rotatedAt: Date | null;
  replacedByTokenId: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Strip secret material for DTOs, logs, and audit snapshots. */
export function toSafeQrPassDto(pass: EventQrPass): SafeQrPassDto {
  return {
    id: pass.id,
    organizationId: pass.organizationId,
    eventId: pass.eventId,
    registrationId: pass.registrationId,
    attendeeId: pass.attendeeId,
    purpose: pass.purpose,
    status: pass.status,
    expiresAt: pass.expiresAt,
    revokedAt: pass.revokedAt,
    revokedByUserId: pass.revokedByUserId,
    rotatedAt: pass.rotatedAt,
    replacedByTokenId: pass.replacedByTokenId,
    lastUsedAt: pass.lastUsedAt,
    createdAt: pass.createdAt,
    updatedAt: pass.updatedAt,
  };
}

async function assertRegistrationScope(
  input: {
    organizationId: string;
    eventId: string;
    registrationId: string;
    attendeeId?: string | null;
  },
  tx: DbClient,
) {
  const registration = await tx.eventRegistration.findFirst({
    where: {
      id: input.registrationId,
      organizationId: input.organizationId,
      eventId: input.eventId,
    },
    select: { id: true },
  });
  if (!registration) {
    throw new QrPassFoundationError(
      "MISMATCH",
      "Registration is not in the requested tenant/event scope.",
    );
  }

  if (input.attendeeId) {
    const attendee = await tx.eventAttendee.findFirst({
      where: {
        id: input.attendeeId,
        organizationId: input.organizationId,
        eventId: input.eventId,
        registrationId: input.registrationId,
      },
      select: { id: true },
    });
    if (!attendee) {
      throw new QrPassFoundationError(
        "MISMATCH",
        "Attendee is not bound to the registration/event/tenant.",
      );
    }
  }
}

async function assertReplacementScope(
  input: {
    organizationId: string;
    eventId: string;
    registrationId: string;
    attendeeId: string | null;
    purpose: EventQrPassPurpose;
    replacedByTokenId: string;
  },
  tx: DbClient,
) {
  const replacement = await tx.eventQrPass.findFirst({
    where: { id: input.replacedByTokenId },
    select: {
      id: true,
      organizationId: true,
      eventId: true,
      registrationId: true,
      attendeeId: true,
      purpose: true,
    },
  });
  if (!replacement) {
    throw new QrPassFoundationError("NOT_FOUND", "Replacement token not found.");
  }
  if (
    replacement.organizationId !== input.organizationId ||
    replacement.eventId !== input.eventId ||
    replacement.registrationId !== input.registrationId ||
    replacement.attendeeId !== input.attendeeId ||
    replacement.purpose !== input.purpose
  ) {
    throw new QrPassFoundationError(
      "MISMATCH",
      "Replacement token must share tenant, event, registration, attendee, and purpose.",
    );
  }
}

/**
 * Persist a prepared hash-only QR pass record (for tests and future 7.3Q issuance).
 * Accepts hashes only — never a raw bearer token or plaintext fallback code.
 */
export async function persistHashOnlyQrPass(
  input: {
    organizationId: string;
    eventId: string;
    registrationId: string;
    attendeeId?: string | null;
    tokenHash: string;
    fallbackCodeHash: string;
    purpose?: EventQrPassPurpose;
    status?: EventQrPass["status"];
    expiresAt: Date;
    createdAt?: Date;
    revokedAt?: Date | null;
    revokedByUserId?: string | null;
    replacedByTokenId?: string | null;
    rotatedAt?: Date | null;
  },
  tx: DbClient = prisma,
) {
  const parsed = persistHashOnlyQrPassInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new QrPassFoundationError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Invalid QR pass input.",
    );
  }

  const data = parsed.data;
  const createdAt = data.createdAt ?? new Date();
  try {
    assertQrPassExpiryAfterCreated({ createdAt, expiresAt: data.expiresAt });
  } catch (error) {
    throw new QrPassFoundationError(
      "VALIDATION",
      error instanceof Error ? error.message : "Invalid expiry.",
    );
  }

  await assertRegistrationScope(
    {
      organizationId: data.organizationId,
      eventId: data.eventId,
      registrationId: data.registrationId,
      attendeeId: data.attendeeId ?? null,
    },
    tx,
  );

  if (data.revokedByUserId) {
    const user = await tx.userAccount.findFirst({
      where: { id: data.revokedByUserId },
      select: { id: true },
    });
    if (!user) {
      throw new QrPassFoundationError("NOT_FOUND", "Revoking user not found.");
    }
  }

  if (data.replacedByTokenId) {
    await assertReplacementScope(
      {
        organizationId: data.organizationId,
        eventId: data.eventId,
        registrationId: data.registrationId,
        attendeeId: data.attendeeId ?? null,
        purpose: data.purpose,
        replacedByTokenId: data.replacedByTokenId,
      },
      tx,
    );
  }

  try {
    return await tx.eventQrPass.create({
      data: {
        organizationId: data.organizationId,
        eventId: data.eventId,
        registrationId: data.registrationId,
        attendeeId: data.attendeeId ?? null,
        tokenHash: data.tokenHash,
        fallbackCodeHash: data.fallbackCodeHash,
        purpose: data.purpose,
        status: data.status,
        expiresAt: data.expiresAt,
        createdAt,
        revokedAt: data.revokedAt ?? null,
        revokedByUserId: data.revokedByUserId ?? null,
        replacedByTokenId: data.replacedByTokenId ?? null,
        rotatedAt: data.rotatedAt ?? null,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /unique|duplicate/i.test(error.message)
    ) {
      throw new QrPassFoundationError(
        "DUPLICATE",
        "A conflicting QR pass hash or active binding already exists.",
      );
    }
    throw error;
  }
}

/**
 * Resolve an active candidate by token hash + purpose within tenant scope.
 * Expired ACTIVE rows are not returned (clock-checked); status must be ACTIVE.
 */
export async function findActiveQrPassByHashAndPurpose(
  input: {
    organizationId: string;
    tokenHash: string;
    purpose?: EventQrPassPurpose;
    now?: Date;
  },
  tx: DbClient = prisma,
) {
  const purpose = input.purpose ?? EVENT_QR_PASS_DEFAULT_PURPOSE;
  const now = input.now ?? new Date();

  return tx.eventQrPass.findFirst({
    where: {
      organizationId: input.organizationId,
      tokenHash: input.tokenHash,
      purpose,
      status: "ACTIVE",
      revokedAt: null,
      expiresAt: { gt: now },
    },
  });
}

/**
 * List all QR pass rows for one tenant-scoped registration (history retained).
 */
export async function listQrPassesForRegistration(
  input: {
    organizationId: string;
    eventId: string;
    registrationId: string;
  },
  tx: DbClient = prisma,
) {
  await assertRegistrationScope(input, tx);

  return tx.eventQrPass.findMany({
    where: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      registrationId: input.registrationId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
}

/**
 * Lock a QR pass row for future rotation/revocation (FOR UPDATE).
 */
export async function lockQrPassForUpdate(
  input: {
    organizationId: string;
    eventId: string;
    passId: string;
  },
  tx: DbClient = prisma,
) {
  const rows = await tx.$queryRaw<EventQrPass[]>`
    SELECT *
    FROM "event_qr_passes"
    WHERE "id" = ${input.passId}::uuid
      AND "organizationId" = ${input.organizationId}::uuid
      AND "eventId" = ${input.eventId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Serialize QR pass mutations for one registration (FOR UPDATE).
 * Used by 7.3Q issue/rotate/revoke to prevent lineage forks.
 */
export async function lockRegistrationForQrPassMutation(
  input: {
    organizationId: string;
    eventId: string;
    registrationId: string;
  },
  tx: DbClient = prisma,
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "event_registrations"
    WHERE "id" = ${input.registrationId}::uuid
      AND "organizationId" = ${input.organizationId}::uuid
      AND "eventId" = ${input.eventId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/** Find the ACTIVE pass for a party or attendee binding (status only; caller clock-checks). */
export async function findActiveQrPassForBinding(
  input: {
    organizationId: string;
    eventId: string;
    registrationId: string;
    attendeeId?: string | null;
    purpose?: EventQrPassPurpose;
  },
  tx: DbClient = prisma,
) {
  const purpose = input.purpose ?? EVENT_QR_PASS_DEFAULT_PURPOSE;
  const attendeeId = input.attendeeId ?? null;

  return tx.eventQrPass.findFirst({
    where: {
      organizationId: input.organizationId,
      eventId: input.eventId,
      registrationId: input.registrationId,
      purpose,
      status: "ACTIVE",
      attendeeId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
}

/**
 * Lock the ACTIVE pass for a binding when present (FOR UPDATE SKIP LOCKED not used —
 * waiters serialize behind registration lock + this row lock).
 */
export async function lockActiveQrPassForBinding(
  input: {
    organizationId: string;
    eventId: string;
    registrationId: string;
    attendeeId?: string | null;
    purpose?: EventQrPassPurpose;
  },
  tx: DbClient = prisma,
) {
  const purpose = input.purpose ?? EVENT_QR_PASS_DEFAULT_PURPOSE;
  const attendeeId = input.attendeeId ?? null;

  if (attendeeId) {
    const rows = await tx.$queryRaw<EventQrPass[]>`
      SELECT *
      FROM "event_qr_passes"
      WHERE "organizationId" = ${input.organizationId}::uuid
        AND "eventId" = ${input.eventId}::uuid
        AND "registrationId" = ${input.registrationId}::uuid
        AND "attendeeId" = ${attendeeId}::uuid
        AND "purpose" = ${purpose}::"EventQrPassPurpose"
        AND "status" = 'ACTIVE'
      ORDER BY "createdAt" DESC, id ASC
      LIMIT 1
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  const rows = await tx.$queryRaw<EventQrPass[]>`
    SELECT *
    FROM "event_qr_passes"
    WHERE "organizationId" = ${input.organizationId}::uuid
      AND "eventId" = ${input.eventId}::uuid
      AND "registrationId" = ${input.registrationId}::uuid
      AND "attendeeId" IS NULL
      AND "purpose" = ${purpose}::"EventQrPassPurpose"
      AND "status" = 'ACTIVE'
    ORDER BY "createdAt" DESC, id ASC
    LIMIT 1
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/** Mark a clock-stale ACTIVE pass EXPIRED so a new ACTIVE binding can be issued. */
export async function markQrPassExpired(
  passId: string,
  tx: DbClient = prisma,
) {
  return tx.eventQrPass.update({
    where: { id: passId },
    data: {
      status: "EXPIRED",
      replacedByTokenId: null,
    },
  });
}

export async function markQrPassRevoked(
  input: {
    passId: string;
    revokedAt: Date;
    revokedByUserId: string | null;
  },
  tx: DbClient = prisma,
) {
  return tx.eventQrPass.update({
    where: { id: input.passId },
    data: {
      status: "REVOKED",
      revokedAt: input.revokedAt,
      revokedByUserId: input.revokedByUserId,
      replacedByTokenId: null,
    },
  });
}

/**
 * Demote an ACTIVE pass so a successor can be inserted, then finalize REPLACED lineage.
 * Call order inside one transaction: demote → create successor → finalizeReplacement.
 */
export async function demoteActiveQrPassForReplacement(
  input: {
    passId: string;
    at: Date;
  },
  tx: DbClient = prisma,
) {
  return tx.eventQrPass.update({
    where: { id: input.passId },
    data: {
      status: "REVOKED",
      revokedAt: input.at,
      rotatedAt: input.at,
      replacedByTokenId: null,
    },
  });
}

export async function finalizeQrPassReplacement(
  input: {
    previousPassId: string;
    replacementPassId: string;
    at: Date;
  },
  tx: DbClient = prisma,
) {
  if (input.previousPassId === input.replacementPassId) {
    throw new QrPassFoundationError(
      "VALIDATION",
      "A QR pass cannot replace itself.",
    );
  }
  return tx.eventQrPass.update({
    where: { id: input.previousPassId },
    data: {
      status: "REPLACED",
      revokedAt: input.at,
      rotatedAt: input.at,
      replacedByTokenId: input.replacementPassId,
    },
  });
}

export const eventQrPassFoundationApi = {
  persistHashOnlyQrPass,
  findActiveQrPassByHashAndPurpose,
  listQrPassesForRegistration,
  lockQrPassForUpdate,
  toSafeQrPassDto,
} as const;
