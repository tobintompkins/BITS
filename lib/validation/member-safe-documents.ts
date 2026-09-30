import { z } from "zod";

import { formatVolunteerTimeOffDate } from "@/lib/validation/volunteer-time-off-request";

export const memberSafeDocumentsHref = "/portal/documents";

export const MEMBER_SAFE_DOCUMENTS_NOTICE =
  "Only safe, non-confidential documents assigned to your membership appear here. Contact the church office for other document questions.";

export const MEMBER_SAFE_DOCUMENTS_EMPTY_COPY =
  "No safe documents are assigned to your membership yet.";

export const MEMBER_SAFE_DOCUMENTS_PENDING_COPY =
  "Your account must be connected to your church membership record before documents can appear. Contact the church office if this information needs correction.";

export const SAFE_MEMBER_DOCUMENT_TYPES = [
  "BAPTISM_CERTIFICATE",
  "MEMBERSHIP_FORM",
  "TRAINING_CERTIFICATE",
  "MARRIAGE_CERTIFICATE",
  "ORDINATION_DOCUMENT",
] as const;

export type SafeMemberDocumentType = (typeof SAFE_MEMBER_DOCUMENT_TYPES)[number];

export const BLOCKED_MEMBER_PORTAL_DOCUMENT_TYPES = [
  "BACKGROUND_CHECK",
  "MEDICAL_FORM",
  "PASTORAL_DOCUMENT",
  "IDENTIFICATION",
  "VOLUNTEER_APPLICATION",
  "PERMISSION_FORM",
  "OTHER",
] as const;

export const SAFE_MEMBER_DOCUMENT_TYPE_LABELS: Record<
  SafeMemberDocumentType,
  string
> = {
  BAPTISM_CERTIFICATE: "Baptism Certificate",
  MEMBERSHIP_FORM: "Membership Form",
  TRAINING_CERTIFICATE: "Training Certificate",
  MARRIAGE_CERTIFICATE: "Marriage Certificate",
  ORDINATION_DOCUMENT: "Ordination Document",
};

export const MEMBER_SAFE_DOCUMENT_ROW_FIELDS = [
  "id",
  "typeLabel",
  "title",
  "description",
  "fileName",
  "mimeType",
  "fileSizeLabel",
  "createdOnLabel",
  "expiresOnLabel",
] as const;

export const memberSafeDocumentIdSchema = z.string().uuid();

const SAFE_TYPE_SET = new Set<string>(SAFE_MEMBER_DOCUMENT_TYPES);

export function isSafeMemberDocumentType(
  value: string,
): value is SafeMemberDocumentType {
  return SAFE_TYPE_SET.has(value);
}

export function formatMemberSafeDocumentTypeLabel(documentType: string) {
  if (isSafeMemberDocumentType(documentType)) {
    return SAFE_MEMBER_DOCUMENT_TYPE_LABELS[documentType];
  }
  return "Document";
}

export function formatMemberSafeDocumentDate(value: Date) {
  return formatVolunteerTimeOffDate(value);
}

export function formatMemberSafeDocumentFileSize(bytes: number) {
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
