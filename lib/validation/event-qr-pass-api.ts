import { z } from "zod";

export const qrPassApiEventIdSchema = z.string().uuid();
export const qrPassApiRegistrationIdSchema = z.string().uuid();
export const qrPassApiPassIdSchema = z.string().uuid();

export const issueQrPassApiBodySchema = z
  .object({
    attendeeId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type IssueQrPassApiBody = z.infer<typeof issueQrPassApiBodySchema>;
