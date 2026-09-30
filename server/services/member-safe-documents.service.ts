import type { MemberDocumentType } from "@/app/generated/prisma/client";

import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  resolveExistingLocalDocumentAbsolutePath,
  sanitizeFileName,
} from "@/lib/storage/member-document";
import {
  SAFE_MEMBER_DOCUMENT_TYPES,
  formatMemberSafeDocumentDate,
  formatMemberSafeDocumentFileSize,
  formatMemberSafeDocumentTypeLabel,
  isSafeMemberDocumentType,
  memberSafeDocumentIdSchema,
} from "@/lib/validation/member-safe-documents";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type MemberSafeDocumentRow = {
  id: string;
  typeLabel: string;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  fileSizeLabel: string;
  createdOnLabel: string;
  expiresOnLabel: string | null;
};

export type MemberSafeDocumentsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "CONNECTION_PENDING"; accountEmail: string }
  | { status: "READY"; rows: MemberSafeDocumentRow[] };

export type MemberSafeDocumentDownloadResult =
  | { status: "SIGNED_OUT" }
  | { status: "NOT_FOUND" }
  | {
      status: "READY";
      fileName: string;
      mimeType: string;
      absolutePath: string;
    };

const safeDocumentTypes = [
  ...SAFE_MEMBER_DOCUMENT_TYPES,
] as MemberDocumentType[];

const listSelect = {
  id: true,
  documentType: true,
  title: true,
  description: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  createdAt: true,
  expirationDate: true,
} as const;

const downloadSelect = {
  fileKey: true,
  fileName: true,
  mimeType: true,
} as const;

function safeDocumentWhere(organizationId: string, memberId: string) {
  return {
    organizationId,
    memberId,
    isConfidential: false,
    documentType: { in: safeDocumentTypes },
  };
}

async function resolveLinkedMember() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const member = await prisma.member.findFirst({
    where: {
      organizationId: organization.id,
      userAccountId: userAccount.id,
      recordStatus: "ACTIVE",
    },
    select: { id: true },
  });
  if (!member) {
    return {
      status: "CONNECTION_PENDING" as const,
      accountEmail: userAccount.primaryEmail,
    };
  }

  return {
    status: "LINKED" as const,
    organizationId: organization.id,
    memberId: member.id,
  };
}

/**
 * Read-only safe documents for the signed-in linked member.
 * Account, organization, and member are resolved server-side only.
 * Client identity fields are ignored. Email and name are never used to match.
 */
export async function getMemberSafeDocuments(): Promise<MemberSafeDocumentsView> {
  const linked = await resolveLinkedMember();
  if (linked.status !== "LINKED") return linked;

  const records = await prisma.memberDocument.findMany({
    where: safeDocumentWhere(linked.organizationId, linked.memberId),
    orderBy: { createdAt: "desc" },
    select: listSelect,
  });

  return {
    status: "READY",
    rows: records
      .filter((row) => isSafeMemberDocumentType(row.documentType))
      .map((row) => ({
        id: row.id,
        typeLabel: formatMemberSafeDocumentTypeLabel(row.documentType),
        title: row.title,
        description: row.description,
        fileName: row.fileName,
        mimeType: row.mimeType,
        fileSizeLabel: formatMemberSafeDocumentFileSize(row.fileSize),
        createdOnLabel: formatMemberSafeDocumentDate(row.createdAt),
        expiresOnLabel: row.expirationDate
          ? formatMemberSafeDocumentDate(row.expirationDate)
          : null,
      })),
  };
}

/**
 * Ownership-scoped download for one safe document belonging to the current
 * linked member. A document id alone never grants access.
 */
export async function getMemberSafeDocumentDownload(
  documentId: string,
): Promise<MemberSafeDocumentDownloadResult> {
  const parsed = memberSafeDocumentIdSchema.safeParse(documentId);
  const linked = await resolveLinkedMember();
  if (linked.status === "SIGNED_OUT") return linked;
  if (!parsed.success) return { status: "NOT_FOUND" };
  if (linked.status !== "LINKED") return { status: "NOT_FOUND" };

  const document = await prisma.memberDocument.findFirst({
    where: {
      id: parsed.data,
      ...safeDocumentWhere(linked.organizationId, linked.memberId),
    },
    select: downloadSelect,
  });
  if (!document) return { status: "NOT_FOUND" };

  const absolutePath = await resolveExistingLocalDocumentAbsolutePath(
    document.fileKey,
  );

  return {
    status: "READY",
    fileName: sanitizeFileName(document.fileName),
    mimeType: document.mimeType,
    absolutePath,
  };
}
