import { z } from "zod";

import { containsMarkup } from "@/lib/validation/church-announcement";
import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const LEADERSHIP_DOCUMENT_TITLE_MIN = 3;
export const LEADERSHIP_DOCUMENT_TITLE_MAX = 80;
export const LEADERSHIP_DOCUMENT_DESCRIPTION_MAX = 500;

export const LEADERSHIP_DOCUMENT_TYPES = [
  "BOARD_MINUTES",
  "POLICY",
  "LEADERSHIP_RESOURCE",
  "FACILITY_DOCUMENT",
  "FINANCIAL_REFERENCE",
  "OTHER",
] as const;

export type LeadershipDocumentType =
  (typeof LEADERSHIP_DOCUMENT_TYPES)[number];

export const LEADERSHIP_DOCUMENT_TYPE_LABELS: Record<
  LeadershipDocumentType,
  string
> = {
  BOARD_MINUTES: "Board minutes",
  POLICY: "Policy",
  LEADERSHIP_RESOURCE: "Leadership resource",
  FACILITY_DOCUMENT: "Facility document",
  FINANCIAL_REFERENCE: "Financial reference",
  OTHER: "Other",
};

export const LEADERSHIP_DOCUMENT_ARCHIVE_FILTERS = ["active", "archived"] as const;
export type LeadershipDocumentArchiveFilter =
  (typeof LEADERSHIP_DOCUMENT_ARCHIVE_FILTERS)[number];

export const LEADERSHIP_DOCUMENTS_NOTICE =
  "Securely store meeting minutes, policies, and leadership resources for authorized church leadership.";

export const LEADERSHIP_DOCUMENTS_EMPTY_COPY =
  "No leadership documents match this view.";

export const LEADERSHIP_DOCUMENTS_HREF = "/leadership-documents";
export const LEADERSHIP_DOCUMENT_DOWNLOAD_PREFIX =
  "/api/leadership-documents";

export const LEADERSHIP_DOCUMENT_ROW_FIELDS = [
  "id",
  "documentType",
  "typeLabel",
  "title",
  "description",
  "fileName",
  "mimeType",
  "fileSizeLabel",
  "uploadedOnLabel",
  "archived",
  "archiveStateLabel",
  "downloadHref",
] as const;

export type LeadershipDocumentRow = {
  id: string;
  documentType: LeadershipDocumentType;
  typeLabel: string;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  fileSizeLabel: string;
  uploadedOnLabel: string;
  archived: boolean;
  archiveStateLabel: string;
  downloadHref: string;
};

export type LeadershipDocumentNavItem = {
  href: string;
  label: string;
};

export function staffLeadershipDocumentNavItems(
  canManageLeadershipDocuments: boolean,
): LeadershipDocumentNavItem[] {
  return canManageLeadershipDocuments
    ? [{ href: LEADERSHIP_DOCUMENTS_HREF, label: "Leadership Documents" }]
    : [];
}

export function formatLeadershipDocumentDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function formatLeadershipDocumentFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    const rounded = kb >= 10 ? Math.round(kb) : Math.round(kb * 10) / 10;
    return `${rounded} KB`;
  }
  const mb = bytes / (1024 * 1024);
  const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return `${rounded} MB`;
}

export function leadershipDocumentDownloadHref(id: string) {
  return `${LEADERSHIP_DOCUMENT_DOWNLOAD_PREFIX}/${id}/download`;
}

function firstString(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function optionalText(value: unknown) {
  const text = firstString(value)?.trim() ?? "";
  return text === "" ? undefined : text;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

const titleSchema = z
  .string()
  .trim()
  .min(LEADERSHIP_DOCUMENT_TITLE_MIN, { error: "Enter a short document title." })
  .max(LEADERSHIP_DOCUMENT_TITLE_MAX, {
    error: "Keep the title to 80 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Titles must be plain text.",
  })
  .transform(normalizeText);

const descriptionSchema = z
  .string()
  .trim()
  .max(LEADERSHIP_DOCUMENT_DESCRIPTION_MAX, {
    error: "Keep the description to 500 characters or fewer.",
  })
  .refine((value) => !containsMarkup(value), {
    error: "Descriptions must be plain text.",
  })
  .transform((value) => {
    const normalized = normalizeText(value);
    return normalized === "" ? undefined : normalized;
  })
  .optional();

export const leadershipDocumentCreateSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  documentType: z.enum(LEADERSHIP_DOCUMENT_TYPES),
});

export const leadershipDocumentFilterSchema = z.object({
  documentType: z.enum(LEADERSHIP_DOCUMENT_TYPES).optional(),
  archived: z.enum(LEADERSHIP_DOCUMENT_ARCHIVE_FILTERS).default("active"),
});

export const leadershipDocumentIdSchema = z.object({
  documentId: z.string().uuid(),
});

export function parseLeadershipDocumentCreate(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return leadershipDocumentCreateSchema.safeParse({
    title: firstString(record.title),
    description: optionalText(record.description),
    documentType: firstString(record.documentType),
  });
}

export function parseLeadershipDocumentFilter(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  return leadershipDocumentFilterSchema.safeParse({
    documentType: optionalText(record.documentType),
    archived: optionalText(record.archived) ?? "active",
  });
}

export function parseLeadershipDocumentId(input: unknown) {
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const parsed = leadershipDocumentIdSchema.safeParse({
    documentId: firstString(record.documentId) ?? firstString(record.id),
  });
  return parsed.success
    ? { success: true as const, data: parsed.data.documentId }
    : parsed;
}
