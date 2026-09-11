"use server";

import { revalidatePath } from "next/cache";

import {
  UnmatchedGiftError,
  matchUnmatchedOnlineGift,
  searchDonorsForOnlineGiftMatch,
} from "@/server/services/unmatched-online-gift.service";

function toActionError(error: unknown) {
  if (error instanceof UnmatchedGiftError) {
    return { ok: false as const, error: error.message, code: error.code };
  }
  return {
    ok: false as const,
    error: "This gift cannot be matched.",
    code: "INVALID_REQUEST" as const,
  };
}

export async function searchGiftMatchDonorsAction(query: string) {
  try {
    const donors = await searchDonorsForOnlineGiftMatch(query);
    return { ok: true as const, donors };
  } catch (error) {
    return { ...toActionError(error), donors: [] };
  }
}

export async function matchUnmatchedOnlineGiftAction(input: {
  donationId: string;
  donorId: string;
  confirmed: boolean;
}) {
  try {
    const result = await matchUnmatchedOnlineGift(input);
    revalidatePath("/statements/unmatched");
    revalidatePath("/statements");
    return { ok: true as const, ...result };
  } catch (error) {
    return toActionError(error);
  }
}
