import { z } from "zod";

export const unmatchedGiftEnvironmentSchema = z.enum(["all", "test", "live"]);
export const unmatchedGiftSortSchema = z.enum(["offeringDate", "totalAmount"]);
export const unmatchedGiftOrderSchema = z.enum(["asc", "desc"]);

export const unmatchedGiftQueueQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().max(320).optional(),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid gift date.")
    .optional(),
  amount: z.string().trim().max(20).optional(),
  fund: z.string().trim().max(100).optional(),
  environment: unmatchedGiftEnvironmentSchema.default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  sort: unmatchedGiftSortSchema.default("offeringDate"),
  order: unmatchedGiftOrderSchema.default("desc"),
});

export const unmatchedGiftDonorSearchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export const matchUnmatchedOnlineGiftSchema = z.object({
  donationId: z.string().uuid(),
  donorId: z.string().uuid(),
  confirmed: z.literal(true),
});

export function parseUnmatchedGiftQueueQuery(
  input: Record<string, string | string[] | undefined>,
) {
  const scalar = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  return unmatchedGiftQueueQuerySchema.safeParse({
    q: scalar(input.q),
    name: scalar(input.name),
    email: scalar(input.email),
    date: scalar(input.date),
    amount: scalar(input.amount),
    fund: scalar(input.fund),
    environment: scalar(input.environment) || "all",
    page: scalar(input.page),
    pageSize: scalar(input.pageSize),
    sort: scalar(input.sort) || "offeringDate",
    order: scalar(input.order) || "desc",
  });
}
