import { z } from "zod";

import { memberGivingHistorySearchParams } from "@/lib/validation/member-giving-history";

const giftIdSchema = z.string().uuid();

export function parseMemberGiftId(value: string | undefined) {
  const parsed = giftIdSchema.safeParse(value?.trim());
  return parsed.success ? parsed.data : null;
}

export function memberGiftReceiptHref(
  giftId: string,
  query?: { year: number; fund?: string; page?: number },
) {
  const text = query ? memberGivingHistorySearchParams(query).toString() : "";
  return text ? `/portal/gifts/${giftId}?${text}` : `/portal/gifts/${giftId}`;
}
