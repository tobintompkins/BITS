import { z } from "zod";

import {
  EVENT_QR_PASS_DEFAULT_PURPOSE,
  EVENT_QR_PASS_PURPOSES,
  EVENT_QR_PASS_STATUSES,
} from "@/lib/constants/event-qr-pass";

const sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Token hash must be a SHA-256 hex digest.");

/**
 * Blueprint 7.3P foundation validation for hash-only QR pass persistence.
 * Does not generate, issue, or redeem tokens — repository/service layers remain authoritative.
 */
export const persistHashOnlyQrPassInputSchema = z
  .object({
    organizationId: z.string().uuid(),
    eventId: z.string().uuid(),
    registrationId: z.string().uuid(),
    attendeeId: z.string().uuid().nullable().optional(),
    tokenHash: sha256HexSchema,
    fallbackCodeHash: sha256HexSchema,
    purpose: z.enum(EVENT_QR_PASS_PURPOSES).default(EVENT_QR_PASS_DEFAULT_PURPOSE),
    status: z.enum(EVENT_QR_PASS_STATUSES).default("ACTIVE"),
    expiresAt: z.date(),
    createdAt: z.date().optional(),
    revokedAt: z.date().nullable().optional(),
    revokedByUserId: z.string().uuid().nullable().optional(),
    replacedByTokenId: z.string().uuid().nullable().optional(),
    rotatedAt: z.date().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const createdAt = value.createdAt ?? new Date();
    if (value.expiresAt <= createdAt) {
      ctx.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "expiresAt must be later than createdAt.",
      });
    }

    if (value.replacedByTokenId && value.replacedByTokenId.length > 0) {
      // Self-replacement is also blocked at the DB; id is assigned on create.
    }

    if (value.status === "ACTIVE") {
      if (value.revokedAt || value.revokedByUserId || value.replacedByTokenId) {
        ctx.addIssue({
          code: "custom",
          path: ["status"],
          message: "ACTIVE passes cannot carry revocation or replacement fields.",
        });
      }
    }

    if (value.status === "REVOKED") {
      if (!value.revokedAt) {
        ctx.addIssue({
          code: "custom",
          path: ["revokedAt"],
          message: "REVOKED passes require revokedAt.",
        });
      }
      if (value.replacedByTokenId) {
        ctx.addIssue({
          code: "custom",
          path: ["replacedByTokenId"],
          message: "REVOKED passes must not set replacedByTokenId.",
        });
      }
    }

    if (value.status === "REPLACED") {
      if (!value.revokedAt || !value.replacedByTokenId) {
        ctx.addIssue({
          code: "custom",
          path: ["status"],
          message: "REPLACED passes require revokedAt and replacedByTokenId.",
        });
      }
    }

    if (value.status === "EXPIRED" && value.replacedByTokenId) {
      ctx.addIssue({
        code: "custom",
        path: ["replacedByTokenId"],
        message: "EXPIRED passes must not set replacedByTokenId.",
      });
    }
  });

export type PersistHashOnlyQrPassInput = z.infer<
  typeof persistHashOnlyQrPassInputSchema
>;

export function assertQrPassExpiryAfterCreated(input: {
  createdAt: Date;
  expiresAt: Date;
}) {
  if (input.expiresAt <= input.createdAt) {
    throw new Error("expiresAt must be later than createdAt.");
  }
}
