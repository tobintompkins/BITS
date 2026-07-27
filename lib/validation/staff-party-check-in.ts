import { z } from "zod";

import { STAFF_PARTY_CHECK_IN_MAX_ATTENDEES } from "@/lib/constants/staff-party-check-in";

/**
 * Normalize attendee IDs: trim, drop empties, dedupe preserving first-seen order.
 */
export function normalizeStaffPartyAttendeeIds(attendeeIds: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of attendeeIds) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

export const staffPartyCheckInInputSchema = z.object({
  eventId: z.string().uuid(),
  registrationId: z.string().uuid(),
  attendeeIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one attendee.")
    .max(
      STAFF_PARTY_CHECK_IN_MAX_ATTENDEES,
      `At most ${STAFF_PARTY_CHECK_IN_MAX_ATTENDEES} attendees can be checked in at once.`,
    ),
  operationKey: z.string().trim().min(1).max(120).optional(),
});
