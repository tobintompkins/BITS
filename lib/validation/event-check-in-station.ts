import { z } from "zod";

import {
  EVENT_CHECK_IN_STATION_DEVICE_LABEL_MAX,
  EVENT_CHECK_IN_STATION_NAME_MAX,
  normalizeStationName,
} from "@/lib/constants/event-check-in-station";

/**
 * Blueprint 7.3I foundation validation for station persistence inputs.
 * Does not authorize or open/close stations — repository/service layers remain authoritative.
 */
export const createActiveStationInputSchema = z.object({
  organizationId: z.string().uuid(),
  eventId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, "Station name is required.")
    .max(EVENT_CHECK_IN_STATION_NAME_MAX),
  deviceLabel: z
    .string()
    .trim()
    .max(EVENT_CHECK_IN_STATION_DEVICE_LABEL_MAX)
    .nullish()
    .transform((value) => (!value ? null : value)),
  openedByUserId: z.string().uuid(),
  openedAt: z.date().optional(),
  lastActivityAt: z.date().nullable().optional(),
});

export type CreateActiveStationInput = z.infer<
  typeof createActiveStationInputSchema
>;

export function assertStationTimestampInvariants(input: {
  openedAt: Date;
  closedAt?: Date | null;
  lastActivityAt?: Date | null;
}) {
  if (input.closedAt && input.closedAt < input.openedAt) {
    throw new Error("Station closedAt cannot precede openedAt.");
  }
  if (input.lastActivityAt && input.lastActivityAt < input.openedAt) {
    throw new Error("Station lastActivityAt cannot precede openedAt.");
  }
}

export function toStationNameNormalized(name: string) {
  return normalizeStationName(name);
}
