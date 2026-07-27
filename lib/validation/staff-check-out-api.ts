import { z } from "zod";

/**
 * Blueprint 7.3X — request body for staff check-out / re-entry APIs.
 * Uses attendeeId to match established 7.3D check-in routing.
 * Strict — rejects client-owned server fields.
 */
export const staffCheckOutApiBodySchema = z
  .object({
    attendeeId: z.string().uuid(),
    stationId: z.string().uuid().optional(),
  })
  .strict();

export const staffCheckOutApiEventIdSchema = z.string().uuid();

/** Optional Idempotency-Key header (EventCheckInIdempotency facility). */
export const staffCheckOutIdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120);

export type StaffCheckOutApiBody = z.infer<typeof staffCheckOutApiBodySchema>;
