import { z } from "zod";

/**
 * Request body for Blueprint 7.3D / 7.3N staff check-in API.
 * Strict — rejects client-owned server fields.
 * `stationId` is optional (7.3N); empty string is rejected (not coerced to null).
 */
export const staffCheckInApiBodySchema = z
  .object({
    attendeeId: z.string().uuid(),
    stationId: z.string().uuid().optional(),
  })
  .strict();

export const staffCheckInApiEventIdSchema = z.string().uuid();

/** Optional Idempotency-Key header (existing EventCheckInIdempotency facility). */
export const staffCheckInIdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120);

export type StaffCheckInApiBody = z.infer<typeof staffCheckInApiBodySchema>;
