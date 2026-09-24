import { z } from "zod";

import { parseStatementReadinessYear } from "@/lib/validation/statement-readiness";

export const MEMBER_GIVING_HISTORY_PAGE_SIZE = 25;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseMemberGivingHistoryQuery(
  input: Record<string, string | string[] | undefined>,
  now = new Date(),
) {
  const year = parseStatementReadinessYear(scalar(input.year), now);
  const fundRaw = (scalar(input.fund) ?? "all").trim();
  const fundParse = z.string().uuid().safeParse(fundRaw);
  const pageParse = z.coerce
    .number()
    .int()
    .min(1)
    .safeParse(scalar(input.page) ?? 1);

  return {
    year,
    fund: fundParse.success ? fundParse.data : "all",
    page: pageParse.success ? pageParse.data : 1,
    pageSize: MEMBER_GIVING_HISTORY_PAGE_SIZE,
  };
}

export function memberGivingHistorySearchParams(query: {
  year: number;
  fund?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  params.set("year", String(query.year));
  if (query.fund && query.fund !== "all") params.set("fund", query.fund);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  return params;
}

export function memberGivingHistoryHref(query: {
  year: number;
  fund?: string;
  page?: number;
}) {
  const text = memberGivingHistorySearchParams(query).toString();
  return text ? `/portal/gifts?${text}` : "/portal/gifts";
}
