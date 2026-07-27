import { z } from "zod";

function optionalTrimmed() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (!value || value === "" ? undefined : value));
}

export const checkInSettingsSchema = z
  .object({
    eventId: z.string().uuid(),
    checkInEnabled: z.boolean().default(false),
    checkInOpensAt: optionalTrimmed(),
    checkInClosesAt: optionalTrimmed(),
    allowSelfCheckIn: z.boolean().default(false),
    allowWalkIns: z.boolean().default(false),
    allowCheckOut: z.boolean().default(false),
    allowReentry: z.boolean().default(false),
    requireRegistration: z.boolean().default(true),
    qrPassEnabled: z.boolean().default(true),
    stationNameRequired: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (
      data.checkInOpensAt &&
      data.checkInClosesAt &&
      new Date(data.checkInClosesAt) <= new Date(data.checkInOpensAt)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["checkInClosesAt"],
        message: "Check-in close must be later than open.",
      });
    }
    if (!data.checkInEnabled) {
      if (data.allowSelfCheckIn) {
        ctx.addIssue({
          code: "custom",
          path: ["allowSelfCheckIn"],
          message: "Self check-in requires check-in to be enabled.",
        });
      }
      if (data.allowWalkIns) {
        ctx.addIssue({
          code: "custom",
          path: ["allowWalkIns"],
          message: "Walk-ins require check-in to be enabled.",
        });
      }
      if (data.allowCheckOut) {
        ctx.addIssue({
          code: "custom",
          path: ["allowCheckOut"],
          message: "Check-out requires check-in to be enabled.",
        });
      }
      if (data.allowReentry) {
        ctx.addIssue({
          code: "custom",
          path: ["allowReentry"],
          message: "Re-entry requires check-in to be enabled.",
        });
      }
    }
    if (data.allowReentry && !data.allowCheckOut) {
      ctx.addIssue({
        code: "custom",
        path: ["allowReentry"],
        message: "Re-entry requires check-out to be enabled.",
      });
    }
    if (data.allowWalkIns && data.requireRegistration) {
      ctx.addIssue({
        code: "custom",
        path: ["allowWalkIns"],
        message: "Walk-ins require requireRegistration to be false.",
      });
    }
  });

/** Blueprint 7.3A server-side invariant guard (mirrors schema rules). */
export function assertCheckInSettingsInvariants(data: {
  checkInEnabled: boolean;
  checkInOpensAt: Date | null;
  checkInClosesAt: Date | null;
  allowSelfCheckIn: boolean;
  allowWalkIns: boolean;
  allowCheckOut: boolean;
  allowReentry: boolean;
  requireRegistration: boolean;
}) {
  if (
    data.checkInOpensAt &&
    data.checkInClosesAt &&
    data.checkInClosesAt <= data.checkInOpensAt
  ) {
    throw new Error("Check-in close must be later than open.");
  }
  if (!data.checkInEnabled) {
    if (data.allowSelfCheckIn) {
      throw new Error("Self check-in requires check-in to be enabled.");
    }
    if (data.allowWalkIns) {
      throw new Error("Walk-ins require check-in to be enabled.");
    }
    if (data.allowCheckOut) {
      throw new Error("Check-out requires check-in to be enabled.");
    }
    if (data.allowReentry) {
      throw new Error("Re-entry requires check-in to be enabled.");
    }
  }
  if (data.allowReentry && !data.allowCheckOut) {
    throw new Error("Re-entry requires check-out to be enabled.");
  }
  if (data.allowWalkIns && data.requireRegistration) {
    throw new Error("Walk-ins require requireRegistration to be false.");
  }
}

export function buildCheckInSettingsAuditChanges(
  before: Record<string, string | boolean | null | undefined> | null,
  after: Record<string, string | boolean | null | undefined>,
) {
  const fields = Object.keys(after);
  return fields
    .filter((field) => {
      const oldValue = before?.[field];
      const newValue = after[field];
      return String(oldValue ?? "") !== String(newValue ?? "");
    })
    .map((field) => ({
      field,
      oldValue:
        before?.[field] === null || before?.[field] === undefined
          ? null
          : String(before[field]),
      newValue:
        after[field] === null || after[field] === undefined
          ? null
          : String(after[field]),
    }));
}

export const openStationSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  deviceLabel: optionalTrimmed().pipe(z.string().max(80).optional()),
});

export const checkInAttendeeSchema = z.object({
  eventId: z.string().uuid(),
  attendeeId: z.string().uuid(),
  stationId: optionalTrimmed().pipe(z.string().uuid().optional()),
  source: z
    .enum(["STAFF_SEARCH", "STAFF_QR", "SELF_QR", "WALK_IN", "ADMIN_CORRECTION"])
    .default("STAFF_SEARCH"),
  operationKey: optionalTrimmed(),
});

export const partyCheckInSchema = z.object({
  eventId: z.string().uuid(),
  registrationId: z.string().uuid(),
  attendeeIds: z.array(z.string().uuid()).min(1),
  stationId: optionalTrimmed().pipe(z.string().uuid().optional()),
  operationKey: optionalTrimmed(),
});

export const checkOutSchema = z.object({
  eventId: z.string().uuid(),
  attendanceId: z.string().uuid(),
  stationId: optionalTrimmed().pipe(z.string().uuid().optional()),
  operationKey: optionalTrimmed(),
});

export const walkInSchema = z.object({
  eventId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: optionalTrimmed().pipe(z.string().email().optional()),
  phone: optionalTrimmed(),
  memberId: optionalTrimmed().pipe(z.string().uuid().optional()),
  stationId: optionalTrimmed().pipe(z.string().uuid().optional()),
  notes: optionalTrimmed(),
});

export const correctAttendanceSchema = z.object({
  eventId: z.string().uuid(),
  attendanceId: z.string().uuid(),
  status: z.enum(["EXPECTED", "PRESENT", "CHECKED_OUT", "NO_SHOW", "CANCELLED"]),
  reason: z.string().trim().min(3).max(500),
});

export const markNoShowSchema = z.object({
  eventId: z.string().uuid(),
  attendanceIds: z.array(z.string().uuid()).optional(),
  finalizeRemaining: z.boolean().optional().default(false),
});

export const resolveQrPassSchema = z.object({
  eventId: z.string().uuid(),
  tokenOrCode: z.string().trim().min(4),
});

export const searchCheckInSchema = z.object({
  eventId: z.string().uuid(),
  query: z.string().trim().max(120).optional().default(""),
  status: optionalTrimmed(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CheckInSettingsInput = z.infer<typeof checkInSettingsSchema>;
export type OpenStationInput = z.infer<typeof openStationSchema>;
export type CheckInAttendeeInput = z.infer<typeof checkInAttendeeSchema>;
export type PartyCheckInInput = z.infer<typeof partyCheckInSchema>;
export type WalkInInput = z.infer<typeof walkInSchema>;
export type CorrectAttendanceInput = z.infer<typeof correctAttendanceSchema>;
