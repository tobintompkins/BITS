import { getOrganizationAccess } from "@/lib/auth/permissions";
import { getOrCreateUserAccount } from "@/lib/auth/user-account";
import { prisma } from "@/lib/db/prisma";
import {
  isLeadershipDocumentStorageKey,
  removeLeadershipDocumentFile,
  resolveLeadershipDocumentAbsolutePath,
  saveLeadershipDocumentFile,
  validateLeadershipDocumentFile,
} from "@/lib/storage/leadership-document";
import {
  LEADERSHIP_DOCUMENT_TYPE_LABELS,
  formatLeadershipDocumentDate,
  formatLeadershipDocumentFileSize,
  leadershipDocumentDownloadHref,
  parseLeadershipDocumentCreate,
  parseLeadershipDocumentFilter,
  parseLeadershipDocumentId,
  type LeadershipDocumentRow,
  type LeadershipDocumentType,
} from "@/lib/validation/leadership-document";
import { createAuditEvent } from "@/server/repositories/audit-event.repository";
import { findPrimaryOrganization } from "@/server/repositories/organization.repository";

export type LeadershipDocumentsView =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID_FILTER" }
  | { status: "READY"; rows: LeadershipDocumentRow[] };

export type LeadershipDocumentMutationResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_ORGANIZATION" }
  | { status: "UNAUTHORIZED" }
  | { status: "INVALID" }
  | { status: "NOT_FOUND" }
  | { status: "CREATED" }
  | { status: "ARCHIVED" }
  | { status: "RESTORED" };

export type LeadershipDocumentDownloadResult =
  | { status: "SIGNED_OUT" }
  | { status: "NOT_FOUND" }
  | {
      status: "READY";
      fileName: string;
      mimeType: string;
      absolutePath: string;
    };

const listSelect = {
  id: true,
  documentType: true,
  title: true,
  description: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  archivedAt: true,
  createdAt: true,
} as const;

type LinkedAccess = {
  status: "READY";
  userAccount: { id: string };
  organization: { id: string };
};

async function requireLeadershipDocumentAccess() {
  const userAccount = await getOrCreateUserAccount();
  if (!userAccount) return { status: "SIGNED_OUT" as const };

  const organization = await findPrimaryOrganization();
  if (!organization) return { status: "NO_ORGANIZATION" as const };

  const access = await getOrganizationAccess(organization.id);
  if (!access.canEdit) return { status: "UNAUTHORIZED" as const };

  return {
    status: "READY" as const,
    userAccount,
    organization,
  } satisfies LinkedAccess;
}

function toRow(row: {
  id: string;
  documentType: LeadershipDocumentType;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  archivedAt: Date | null;
  createdAt: Date;
}): LeadershipDocumentRow {
  const archived = row.archivedAt != null;
  return {
    id: row.id,
    documentType: row.documentType,
    typeLabel: LEADERSHIP_DOCUMENT_TYPE_LABELS[row.documentType],
    title: row.title,
    description: row.description,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSizeLabel: formatLeadershipDocumentFileSize(row.fileSize),
    uploadedOnLabel: formatLeadershipDocumentDate(row.createdAt),
    archived,
    archiveStateLabel: archived ? "Archived" : "Active",
    downloadHref: leadershipDocumentDownloadHref(row.id),
  };
}

function readUploadFile(input: unknown): File | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const file = (input as { file?: unknown }).file;
  if (
    file &&
    typeof file === "object" &&
    typeof (file as File).arrayBuffer === "function" &&
    typeof (file as File).name === "string" &&
    typeof (file as File).size === "number"
  ) {
    return file as File;
  }
  return null;
}

/**
 * Org-admin leadership document library. Organization and permissions are
 * resolved server-side. File keys and filesystem paths are never listed.
 */
export async function getLeadershipDocuments(
  input: unknown = {},
): Promise<LeadershipDocumentsView> {
  const access = await requireLeadershipDocumentAccess();
  if (access.status !== "READY") return access;

  const parsed = parseLeadershipDocumentFilter(input);
  if (!parsed.success) return { status: "INVALID_FILTER" };

  const records = await prisma.leadershipDocument.findMany({
    where: {
      organizationId: access.organization.id,
      ...(parsed.data.documentType
        ? { documentType: parsed.data.documentType }
        : {}),
      archivedAt: parsed.data.archived === "archived" ? { not: null } : null,
    },
    orderBy: [{ createdAt: "desc" }, { title: "asc" }],
    select: listSelect,
  });

  return {
    status: "READY",
    rows: records.map((row) =>
      toRow({
        ...row,
        documentType: row.documentType as LeadershipDocumentType,
      }),
    ),
  };
}

export async function createLeadershipDocument(
  input: unknown,
): Promise<LeadershipDocumentMutationResult> {
  const access = await requireLeadershipDocumentAccess();
  if (access.status !== "READY") return access;

  const parsed = parseLeadershipDocumentCreate(input);
  const file = readUploadFile(input);
  if (!parsed.success || !file) return { status: "INVALID" };

  const validation = validateLeadershipDocumentFile(file);
  if (!validation.ok) return { status: "INVALID" };

  const saved = await saveLeadershipDocumentFile(access.organization.id, file);

  try {
    const created = await prisma.leadershipDocument.create({
      data: {
        organizationId: access.organization.id,
        documentType: parsed.data.documentType,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        fileName: saved.fileName,
        fileKey: saved.storageKey,
        mimeType: saved.mimeType,
        fileSize: saved.fileSize,
        uploadedByUserAccountId: access.userAccount.id,
      },
      select: { id: true, documentType: true },
    });

    await createAuditEvent({
      organizationId: access.organization.id,
      actorUserAccountId: access.userAccount.id,
      action: "UPLOAD_LEADERSHIP_DOCUMENT",
      entityType: "LeadershipDocument",
      entityId: created.id,
      changes: [
        { field: "title", oldValue: null, newValue: "set" },
        {
          field: "documentType",
          oldValue: null,
          newValue: created.documentType,
        },
      ],
    });
  } catch (error) {
    await removeLeadershipDocumentFile(saved.storageKey, access.organization.id);
    throw error;
  }

  return { status: "CREATED" };
}

export async function archiveLeadershipDocument(
  input: unknown,
): Promise<LeadershipDocumentMutationResult> {
  const access = await requireLeadershipDocumentAccess();
  if (access.status !== "READY") return access;

  const parsed = parseLeadershipDocumentId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.leadershipDocument.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
      archivedAt: null,
    },
    select: { id: true, documentType: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  await prisma.leadershipDocument.update({
    where: { id: existing.id },
    data: {
      archivedAt: new Date(),
      archivedByUserAccountId: access.userAccount.id,
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "ARCHIVE_LEADERSHIP_DOCUMENT",
    entityType: "LeadershipDocument",
    entityId: existing.id,
    changes: [
      { field: "archivedAt", oldValue: null, newValue: "set" },
      { field: "documentType", oldValue: existing.documentType, newValue: existing.documentType },
    ],
  });

  return { status: "ARCHIVED" };
}

export async function restoreLeadershipDocument(
  input: unknown,
): Promise<LeadershipDocumentMutationResult> {
  const access = await requireLeadershipDocumentAccess();
  if (access.status !== "READY") return access;

  const parsed = parseLeadershipDocumentId(input);
  if (!parsed.success) return { status: "INVALID" };

  const existing = await prisma.leadershipDocument.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
      archivedAt: { not: null },
    },
    select: { id: true, documentType: true },
  });
  if (!existing) return { status: "NOT_FOUND" };

  await prisma.leadershipDocument.update({
    where: { id: existing.id },
    data: {
      archivedAt: null,
      archivedByUserAccountId: null,
    },
  });

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "RESTORE_LEADERSHIP_DOCUMENT",
    entityType: "LeadershipDocument",
    entityId: existing.id,
    changes: [
      { field: "archivedAt", oldValue: "set", newValue: null },
      { field: "documentType", oldValue: existing.documentType, newValue: existing.documentType },
    ],
  });

  return { status: "RESTORED" };
}

export async function getLeadershipDocumentDownload(
  documentId: string,
): Promise<LeadershipDocumentDownloadResult> {
  const access = await requireLeadershipDocumentAccess();
  if (access.status === "SIGNED_OUT") return { status: "SIGNED_OUT" };
  if (access.status !== "READY") return { status: "NOT_FOUND" };

  const parsed = parseLeadershipDocumentId({ documentId });
  if (!parsed.success) return { status: "NOT_FOUND" };

  const existing = await prisma.leadershipDocument.findFirst({
    where: {
      id: parsed.data,
      organizationId: access.organization.id,
    },
    select: {
      id: true,
      title: true,
      documentType: true,
      fileName: true,
      fileKey: true,
      mimeType: true,
    },
  });
  if (!existing) return { status: "NOT_FOUND" };
  if (
    !isLeadershipDocumentStorageKey(existing.fileKey, access.organization.id)
  ) {
    return { status: "NOT_FOUND" };
  }

  const absolutePath = resolveLeadershipDocumentAbsolutePath(
    existing.fileKey,
    access.organization.id,
  );
  if (!absolutePath) return { status: "NOT_FOUND" };

  await createAuditEvent({
    organizationId: access.organization.id,
    actorUserAccountId: access.userAccount.id,
    action: "DOWNLOAD_LEADERSHIP_DOCUMENT",
    entityType: "LeadershipDocument",
    entityId: existing.id,
    changes: [
      { field: "title", oldValue: null, newValue: "set" },
      {
        field: "documentType",
        oldValue: existing.documentType,
        newValue: existing.documentType,
      },
    ],
  });

  return {
    status: "READY",
    fileName: existing.fileName,
    mimeType: existing.mimeType,
    absolutePath,
  };
}
