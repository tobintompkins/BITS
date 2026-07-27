import { z } from "zod";

export const publicPrayerRequestSchema = z.object({
  name: z.string().trim().max(100).optional().default(""),
  contact: z.string().trim().max(200).optional().default(""),
  request: z.string().trim().min(3, "Please enter a prayer request.").max(2000),
  anonymous: z.boolean().default(true),
  sharePublicly: z.boolean().default(false),
  website: z.string().max(0).optional().default(""),
});

export type PublicPrayerRequestInput = z.infer<
  typeof publicPrayerRequestSchema
>;
