import { isValidMoneyInput, parseMoneyInput } from "@/lib/money/decimal";
import { z } from "zod";

export const offeringBatchFormSchema = z.object({
  name: z.string().trim().min(1, "Batch name is required.").max(120),
  offeringDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid offering date."),
  serviceDescription: z.string().trim().max(200),
  expectedTotal: z
    .string()
    .trim()
    .max(20)
    .refine(
      (value) => value === "" || isValidMoneyInput(value),
      "Expected total must be zero or greater.",
    ),
  notes: z.string().trim().max(2000),
});

export const offeringBatchWriteSchema = offeringBatchFormSchema.transform(
  (value) => ({
    name: value.name,
    offeringDate: value.offeringDate,
    serviceDescription:
      value.serviceDescription === "" ? null : value.serviceDescription,
    expectedTotal: parseMoneyInput(value.expectedTotal),
    notes: value.notes === "" ? null : value.notes,
  }),
);

export const offeringBatchStatusFilterSchema = z.enum([
  "all",
  "DRAFT",
  "ENTERED",
  "RECONCILED",
  "LOCKED",
]);

export const offeringBatchSortSchema = z.enum([
  "offeringDate",
  "createdAt",
  "name",
  "expectedTotal",
  "recordedTotal",
]);

export const offeringBatchOrderSchema = z.enum(["asc", "desc"]);

export const offeringBatchDirectoryQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: offeringBatchStatusFilterSchema.default("all"),
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid start date.")
    .optional(),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid end date.")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  sort: offeringBatchSortSchema.default("offeringDate"),
  order: offeringBatchOrderSchema.default("desc"),
});

export type OfferingBatchWriteInput = z.infer<typeof offeringBatchWriteSchema>;
export type OfferingBatchDirectoryQuery = z.infer<
  typeof offeringBatchDirectoryQuerySchema
>;

export type OfferingBatchFormValues = {
  name: string;
  offeringDate: string;
  serviceDescription: string;
  expectedTotal: string;
  notes: string;
};

export const emptyOfferingBatchFormValues: OfferingBatchFormValues = {
  name: "",
  offeringDate: "",
  serviceDescription: "",
  expectedTotal: "",
  notes: "",
};

export type OfferingBatchActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  batchId?: string;
  fieldErrors: Partial<Record<keyof OfferingBatchFormValues, string[]>>;
};

export function createOfferingBatchActionState(): OfferingBatchActionState {
  return { status: "idle", fieldErrors: {} };
}

export function parseOfferingBatchDirectoryQuery(
  input: Record<string, string | string[] | undefined>,
) {
  const scalar = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const dateFrom = scalar(input.dateFrom);
  const dateTo = scalar(input.dateTo);
  return offeringBatchDirectoryQuerySchema.safeParse({
    q: scalar(input.q),
    status: scalar(input.status) || "all",
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page: scalar(input.page),
    pageSize: scalar(input.pageSize),
    sort: scalar(input.sort) || "offeringDate",
    order: scalar(input.order) || "desc",
  });
}

export function toOfferingBatchFormValues(batch: {
  name: string;
  offeringDate: Date;
  serviceDescription: string | null;
  expectedTotal: { toString(): string } | string | null;
  notes: string | null;
}): OfferingBatchFormValues {
  return {
    name: batch.name,
    offeringDate: batch.offeringDate.toISOString().slice(0, 10),
    serviceDescription: batch.serviceDescription ?? "",
    expectedTotal:
      batch.expectedTotal == null ? "" : batch.expectedTotal.toString(),
    notes: batch.notes ?? "",
  };
}

const AUDIT_FIELDS = [
  "name",
  "offeringDate",
  "serviceDescription",
  "expectedTotal",
] as const;

export function offeringBatchAuditSnapshot(batch: {
  name: string;
  offeringDate: Date | string;
  serviceDescription: string | null;
  expectedTotal: { toString(): string } | string | null;
}) {
  return {
    name: batch.name,
    offeringDate:
      batch.offeringDate instanceof Date
        ? batch.offeringDate.toISOString().slice(0, 10)
        : String(batch.offeringDate).slice(0, 10),
    serviceDescription: batch.serviceDescription,
    expectedTotal: batch.expectedTotal?.toString() ?? null,
  };
}

export function offeringBatchAuditChanges(
  previous: Record<(typeof AUDIT_FIELDS)[number], string | null>,
  next: Record<(typeof AUDIT_FIELDS)[number], string | null>,
) {
  return AUDIT_FIELDS.filter((field) => previous[field] !== next[field]).map(
    (field) => ({
      field,
      oldValue: previous[field],
      newValue: next[field],
    }),
  );
}
