import { z } from "zod";

export const MEMBER_ANNOUNCEMENTS_PAGE_SIZE = 20;
export const MEMBER_ANNOUNCEMENTS_MAX = 100;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseMemberAnnouncementsQuery(
  input: Record<string, string | string[] | undefined>,
) {
  const pageParse = z.coerce
    .number()
    .int()
    .min(1)
    .safeParse(scalar(input.page) ?? 1);

  return {
    page: pageParse.success ? pageParse.data : 1,
    pageSize: MEMBER_ANNOUNCEMENTS_PAGE_SIZE,
  };
}

export function memberAnnouncementsHref(page = 1) {
  return page > 1 ? `/portal/announcements?page=${page}` : "/portal/announcements";
}
