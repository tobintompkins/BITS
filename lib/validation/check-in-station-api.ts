import { z } from "zod";

import {
  EVENT_CHECK_IN_STATION_DEVICE_LABEL_MAX,
  EVENT_CHECK_IN_STATION_LIST_DEFAULT_PAGE_SIZE,
  EVENT_CHECK_IN_STATION_LIST_MAX_PAGE_SIZE,
  EVENT_CHECK_IN_STATION_NAME_MAX,
  EVENT_CHECK_IN_STATION_STATUSES,
} from "@/lib/constants/event-check-in-station";

/** Blueprint 7.3K — open-station body. Strict — rejects actor/timestamps/status/tenant. */
export const openCheckInStationApiBodySchema = z
  .object({
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
  })
  .strict();

export const checkInStationApiEventIdSchema = z.string().uuid();
export const checkInStationApiStationIdSchema = z.string().uuid();

/** Close has no body fields. */
export const closeCheckInStationApiBodySchema = z.object({}).strict();

export const listCheckInStationsApiQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(EVENT_CHECK_IN_STATION_LIST_MAX_PAGE_SIZE)
    .default(EVENT_CHECK_IN_STATION_LIST_DEFAULT_PAGE_SIZE),
  status: z.enum(EVENT_CHECK_IN_STATION_STATUSES).optional(),
});

export type OpenCheckInStationApiBody = z.infer<
  typeof openCheckInStationApiBodySchema
>;
