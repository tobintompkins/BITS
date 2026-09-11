import { z } from "zod";

const accountEmail = z.string().trim().email().max(320).transform((value) => value.toLowerCase());

export const linkExistingDonorSchema = z.object({
  donorId: z.string().uuid(),
  accountEmail,
});

export const createLinkedDonorSchema = z.object({
  accountEmail,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(40).optional(),
});

export type LinkExistingDonorInput = z.infer<typeof linkExistingDonorSchema>;
export type CreateLinkedDonorInput = z.infer<typeof createLinkedDonorSchema>;
