import { z } from "zod";

import { parseStatementReadinessYear } from "@/lib/validation/statement-readiness";

export const statementRegistryTypeFilterSchema = z.enum([
  "all",
  "individual",
  "household",
]);

export const statementRegistryStatusFilterSchema = z.enum([
  "all",
  "generated",
  "published",
  "voided",
]);

const PAGE_SIZE = 25;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseStatementRegistryQuery(
  input: Record<string, string | string[] | undefined>,
  now = new Date(),
) {
  const year = parseStatementReadinessYear(scalar(input.year), now);
  const q = (scalar(input.q) ?? "").trim().slice(0, 100);
  const type = statementRegistryTypeFilterSchema.safeParse(
    (scalar(input.type) ?? "all").toLowerCase(),
  );
  const status = statementRegistryStatusFilterSchema.safeParse(
    (scalar(input.status) ?? "all").toLowerCase(),
  );
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .safeParse(scalar(input.page) ?? 1);

  return {
    year,
    q: q || undefined,
    type: type.success ? type.data : "all",
    status: status.success ? status.data : "all",
    page: page.success ? page.data : 1,
    pageSize: PAGE_SIZE,
  };
}

export type StatementRegistryQuery = ReturnType<
  typeof parseStatementRegistryQuery
>;

export function statementRegistrySearchParams(query: {
  year: number;
  q?: string;
  type: string;
  status: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  params.set("year", String(query.year));
  if (query.type !== "all") params.set("type", query.type);
  if (query.status !== "all") params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  return params;
}

export function statementRegistryHref(query: {
  year: number;
  q?: string;
  type: string;
  status: string;
  page?: number;
}) {
  const text = statementRegistrySearchParams(query).toString();
  return text ? `/statements/registry?${text}` : "/statements/registry";
}
