import { z } from "zod";

import {
  eventRegistrationVisibilityOptions,
  waitlistPromotionModeOptions,
} from "@/lib/constants/event-registration";

const visibilities = eventRegistrationVisibilityOptions.map((o) => o.value) as [
  string,
  ...string[],
];
const promotionModes = waitlistPromotionModeOptions.map((o) => o.value) as [
  string,
  ...string[],
];

function optionalTrimmed() {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (!value || value === "" ? undefined : value));
}

function optionalInt() {
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === "") return undefined;
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    })
    .pipe(z.number().int().positive().optional());
}

export const registrationSettingsSchema = z
  .object({
    eventId: z.string().uuid(),
    isEnabled: z.boolean().default(false),
    visibility: z.enum(visibilities).default("PUBLIC"),
    opensAt: optionalTrimmed(),
    closesAt: optionalTrimmed(),
    capacity: optionalInt(),
    waitlistEnabled: z.boolean().default(false),
    waitlistCapacity: optionalInt(),
    promotionMode: z.enum(promotionModes).default("AUTOMATIC"),
    maxAttendeesPerRegistration: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === null || value === "") return 1;
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : 1;
      })
      .pipe(z.number().int().min(1).max(50)),
    allowHouseholdRegistration: z.boolean().default(true),
    allowGuestRegistration: z.boolean().default(true),
    requireAuthentication: z.boolean().default(false),
    requireEmail: z.boolean().default(true),
    requirePhone: z.boolean().default(false),
    requireDateOfBirth: z.boolean().default(false),
    requireEmergencyContact: z.boolean().default(false),
    requireGuardianForMinors: z.boolean().default(false),
    allowCancellation: z.boolean().default(true),
    cancellationDeadline: optionalTrimmed(),
    confirmationMessage: optionalTrimmed(),
    instructions: optionalTrimmed(),
    checkInEnabled: z.boolean().default(true),
    qrCheckInEnabled: z.boolean().default(false),
    showCapacityPublicly: z.boolean().default(true),
    showWaitlistPublicly: z.boolean().default(false),
    confirmationRequired: z.boolean().default(false),
    promotionOfferTtlMinutes: z
      .union([z.string(), z.number()])
      .optional()
      .transform((value) => {
        if (value === undefined || value === null || value === "") return 1440;
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : 1440;
      })
      .pipe(z.number().int().min(15).max(10080)),
  })
  .superRefine((data, ctx) => {
    if (data.opensAt && data.closesAt && new Date(data.closesAt) < new Date(data.opensAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["closesAt"],
        message: "Registration close cannot be before open.",
      });
    }
  });

export const attendeeInputSchema = z.object({
  memberId: optionalTrimmed().pipe(z.string().uuid().optional()),
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  email: optionalTrimmed().pipe(z.string().email().optional()),
  phone: optionalTrimmed(),
  dateOfBirth: optionalTrimmed(),
  isGuest: z.boolean().optional().default(false),
  isMinor: z.boolean().optional().default(false),
  guardianName: optionalTrimmed(),
  guardianPhone: optionalTrimmed(),
  emergencyContactName: optionalTrimmed(),
  emergencyContactPhone: optionalTrimmed(),
  accommodationRequest: optionalTrimmed(),
  dietaryNotes: optionalTrimmed(),
  internalNotes: optionalTrimmed(),
  notes: optionalTrimmed(),
});

export const promotionOfferTokenSchema = z.object({
  token: z.string().trim().min(16, "Offer token is required."),
});

export const submitRegistrationSchema = z.object({
  eventId: z.string().uuid(),
  memberId: optionalTrimmed().pipe(z.string().uuid().optional()),
  householdId: optionalTrimmed().pipe(z.string().uuid().optional()),
  primaryContactName: z.string().trim().min(1, "Contact name is required.").max(200),
  primaryContactEmail: optionalTrimmed().pipe(z.string().email().optional()),
  primaryContactPhone: optionalTrimmed(),
  notes: optionalTrimmed(),
  attendees: z.array(attendeeInputSchema).min(1, "At least one attendee is required."),
});

export const cancelRegistrationSchema = z.object({
  confirmationCode: z.string().trim().min(4),
  reason: optionalTrimmed(),
  email: optionalTrimmed().pipe(z.string().email().optional()),
});

export type RegistrationSettingsInput = z.infer<typeof registrationSettingsSchema>;
export type SubmitRegistrationInput = z.infer<typeof submitRegistrationSchema>;
export type CancelRegistrationInput = z.infer<typeof cancelRegistrationSchema>;

export function buildSafeAuditChanges(
  values: Record<string, string | number | boolean | null | undefined>,
) {
  return Object.entries(values).map(([field, newValue]) => ({
    field,
    oldValue: null as string | null,
    newValue:
      newValue === null || newValue === undefined ? null : String(newValue),
  }));
}

export function generateConfirmationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function generateCheckInToken() {
  return crypto.randomUUID().replace(/-/g, "");
}
