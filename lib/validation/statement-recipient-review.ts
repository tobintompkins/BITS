import { z } from "zod";

import { parseStatementReadinessYear } from "@/lib/validation/statement-readiness";

export const statementRecipientAddressFilterSchema = z.enum([
  "all",
  "complete",
  "missing",
]);

const PAGE_SIZE = 25;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseStatementRecipientReviewQuery(
  input: Record<string, string | string[] | undefined>,
  now = new Date(),
) {
  const year = parseStatementReadinessYear(scalar(input.year), now);
  const q = (scalar(input.q) ?? "").trim().slice(0, 100);
  const address = statementRecipientAddressFilterSchema.safeParse(
    scalar(input.address) || "all",
  );
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .safeParse(scalar(input.page) ?? 1);

  return {
    year,
    q: q || undefined,
    address: address.success ? address.data : "all",
    page: page.success ? page.data : 1,
    pageSize: PAGE_SIZE,
  };
}

export type StatementRecipientReviewQuery = ReturnType<
  typeof parseStatementRecipientReviewQuery
>;
