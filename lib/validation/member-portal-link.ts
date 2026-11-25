import { z } from "zod";

const accountId = z.string().uuid();
const optionalRecordId = z.string().uuid().optional().or(z.literal(""));

export const connectPersonRecordsSchema = z.object({
  userAccountId: accountId,
  donorId: optionalRecordId,
  memberId: optionalRecordId,
  profileId: optionalRecordId,
  confirmed: z.literal("on"),
});

export const createLinkedDonorSchema = z.object({
  userAccountId: accountId,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(40).optional(),
});

export type ConnectPersonRecordsInput = z.infer<typeof connectPersonRecordsSchema>;
export type CreateLinkedDonorInput = z.infer<typeof createLinkedDonorSchema>;
