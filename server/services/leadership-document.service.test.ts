import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_LEADERSHIP_DOCUMENT_BYTES,
  isLeadershipDocumentStorageKey,
  sanitizeLeadershipFileName,
  validateLeadershipDocumentFile,
} from "@/lib/storage/leadership-document";
import {
  LEADERSHIP_DOCUMENT_ROW_FIELDS,
  parseLeadershipDocumentCreate,
  staffLeadershipDocumentNavItems,
} from "@/lib/validation/leadership-document";

type DocumentRow = {
  id: string;
  organizationId: string;
  documentType: string;
  title: string;
  description: string | null;
  fileName: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  uploadedByUserAccountId: string;
  archivedAt: Date | null;
  archivedByUserAccountId: string | null;
  createdAt: Date;
};

const store = vi.hoisted(() => ({
  documents: [] as DocumentRow[],
  lastFindManyWhere: null as unknown,
  lastCreateData: null as Record<string, unknown> | null,
  savedFiles: [] as Array<{ organizationId: string; fileName: string }>,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  getOrganizationAccess: vi.fn(),
  createAuditEvent: vi.fn(async (input: Record<string, unknown>) => input),
  saveLeadershipDocumentFile: vi.fn(),
  removeLeadershipDocumentFile: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/auth/permissions", () => ({
  getOrganizationAccess: mocks.getOrganizationAccess,
}));

vi.mock("@/server/repositories/audit-event.repository", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

vi.mock("@/lib/storage/leadership-document", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/storage/leadership-document")
  >("@/lib/storage/leadership-document");
  return {
    ...actual,
    saveLeadershipDocumentFile: mocks.saveLeadershipDocumentFile,
    removeLeadershipDocumentFile: mocks.removeLeadershipDocumentFile,
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    leadershipDocument: {
      findMany: async ({
        where,
      }: {
        where: {
          organizationId: string;
          documentType?: string;
          archivedAt?: null | { not: null };
        };
      }) => {
        store.lastFindManyWhere = where;
        return store.documents
          .filter((row) => {
            if (row.organizationId !== where.organizationId) return false;
            if (
              where.documentType &&
              row.documentType !== where.documentType
            ) {
              return false;
            }
            if (where.archivedAt === null && row.archivedAt != null) {
              return false;
            }
            if (
              where.archivedAt &&
              typeof where.archivedAt === "object" &&
              "not" in where.archivedAt &&
              row.archivedAt == null
            ) {
              return false;
            }
            return true;
          })
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          )
          .map((row) => ({
            id: row.id,
            documentType: row.documentType,
            title: row.title,
            description: row.description,
            fileName: row.fileName,
            mimeType: row.mimeType,
            fileSize: row.fileSize,
            archivedAt: row.archivedAt,
            createdAt: row.createdAt,
          }));
      },
      findFirst: async ({
        where,
      }: {
        where: {
          id: string;
          organizationId: string;
          archivedAt?: null | { not: null };
        };
      }) => {
        const row = store.documents.find((item) => {
          if (item.id !== where.id) return false;
          if (item.organizationId !== where.organizationId) return false;
          if (where.archivedAt === null && item.archivedAt != null) return false;
          if (
            where.archivedAt &&
            typeof where.archivedAt === "object" &&
            "not" in where.archivedAt &&
            item.archivedAt == null
          ) {
            return false;
          }
          return true;
        });
        return row ? { ...row } : null;
      },
      create: async ({
        data,
      }: {
        data: Partial<DocumentRow> & {
          organizationId: string;
          title: string;
          fileKey: string;
        };
      }) => {
        store.lastCreateData = data as Record<string, unknown>;
        const created: DocumentRow = {
          id: "00000000-0000-4000-8000-00000000d100",
          organizationId: data.organizationId,
          documentType: data.documentType ?? "POLICY",
          title: data.title,
          description: data.description ?? null,
          fileName: data.fileName ?? "document.pdf",
          fileKey: data.fileKey,
          mimeType: data.mimeType ?? "application/pdf",
          fileSize: data.fileSize ?? 1024,
          uploadedByUserAccountId: data.uploadedByUserAccountId ?? "",
          archivedAt: null,
          archivedByUserAccountId: null,
          createdAt: new Date("2026-09-29T16:00:00.000Z"),
        };
        store.documents.push(created);
        return { id: created.id, documentType: created.documentType };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<DocumentRow>;
      }) => {
        const row = store.documents.find((item) => item.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return { ...row };
      },
    },
  },
}));

import {
  archiveLeadershipDocument,
  createLeadershipDocument,
  getLeadershipDocumentDownload,
  getLeadershipDocuments,
  restoreLeadershipDocument,
} from "./leadership-document.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const ADMIN_ID = "00000000-0000-4000-8000-00000000c001";
const ACTIVE_ID = "00000000-0000-4000-8000-00000000d001";
const ARCHIVED_ID = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_ID = "00000000-0000-4000-8000-00000000d003";

function fakeFile(name: string, size = 1024, type = "application/pdf") {
  const blob = new Blob([new Uint8Array(Math.min(size, 64))], { type });
  Object.defineProperty(blob, "size", { value: size });
  Object.defineProperty(blob, "name", { value: name });
  return blob as File;
}

function seed() {
  store.documents = [
    {
      id: ACTIVE_ID,
      organizationId: ORG_ID,
      documentType: "BOARD_MINUTES",
      title: "September board minutes",
      description: "Approved minutes from the September meeting.",
      fileName: "september-minutes.pdf",
      fileKey: `private/leadership-documents/${ORG_ID}/minutes.pdf`,
      mimeType: "application/pdf",
      fileSize: 2048,
      uploadedByUserAccountId: ADMIN_ID,
      archivedAt: null,
      archivedByUserAccountId: null,
      createdAt: new Date("2026-09-28T12:00:00.000Z"),
    },
    {
      id: ARCHIVED_ID,
      organizationId: ORG_ID,
      documentType: "POLICY",
      title: "Facility use policy",
      description: "Superseded policy retained for history.",
      fileName: "facility-policy.pdf",
      fileKey: `private/leadership-documents/${ORG_ID}/policy.pdf`,
      mimeType: "application/pdf",
      fileSize: 4096,
      uploadedByUserAccountId: ADMIN_ID,
      archivedAt: new Date("2026-09-20T12:00:00.000Z"),
      archivedByUserAccountId: ADMIN_ID,
      createdAt: new Date("2026-09-01T12:00:00.000Z"),
    },
    {
      id: OTHER_ORG_ID,
      organizationId: OTHER_ORG,
      documentType: "BOARD_MINUTES",
      title: "Other church minutes",
      description: "Should never appear.",
      fileName: "other.pdf",
      fileKey: `private/leadership-documents/${OTHER_ORG}/other.pdf`,
      mimeType: "application/pdf",
      fileSize: 1024,
      uploadedByUserAccountId: ADMIN_ID,
      archivedAt: null,
      archivedByUserAccountId: null,
      createdAt: new Date("2026-09-29T12:00:00.000Z"),
    },
  ];
}

beforeEach(() => {
  store.documents = [];
  store.lastFindManyWhere = null;
  store.lastCreateData = null;
  store.savedFiles = [];
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.getOrganizationAccess.mockReset();
  mocks.createAuditEvent.mockClear();
  mocks.saveLeadershipDocumentFile.mockReset();
  mocks.removeLeadershipDocumentFile.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: ADMIN_ID,
    primaryEmail: "admin@church.test",
    displayName: "Ada Admin",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.getOrganizationAccess.mockResolvedValue({
    canEdit: true,
    isSuperAdmin: false,
    roleCode: "ORG_ADMIN",
  });
  mocks.saveLeadershipDocumentFile.mockImplementation(
    async (organizationId: string, file: File) => {
      store.savedFiles.push({ organizationId, fileName: file.name });
      return {
        storageKey: `private/leadership-documents/${organizationId}/saved.pdf`,
        fileName: "saved.pdf",
        mimeType: "application/pdf",
        fileSize: file.size,
      };
    },
  );
  seed();
});

describe("leadership document storage validation", () => {
  it("allows PDF files and sanitizes unsafe names", () => {
    const result = validateLeadershipDocumentFile(
      fakeFile("../../secret minutes.pdf"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitizedFileName).toBe("secret minutes.pdf");
      expect(result.extension).toBe(".pdf");
    }
    expect(sanitizeLeadershipFileName("C:\\\\temp\\\\board minutes.docx")).toBe(
      "board minutes.docx",
    );
    expect(
      isLeadershipDocumentStorageKey(
        `private/leadership-documents/${ORG_ID}/file.pdf`,
        ORG_ID,
      ),
    ).toBe(true);
    expect(
      isLeadershipDocumentStorageKey(
        `private/leadership-documents/${OTHER_ORG}/file.pdf`,
        ORG_ID,
      ),
    ).toBe(false);
    expect(
      isLeadershipDocumentStorageKey(
        `private/leadership-documents/${ORG_ID}/../members/file.pdf`,
        ORG_ID,
      ),
    ).toBe(false);
  });

  it("rejects executables, scripts, and oversized files", () => {
    expect(validateLeadershipDocumentFile(fakeFile("run.exe")).ok).toBe(false);
    expect(validateLeadershipDocumentFile(fakeFile("hook.js")).ok).toBe(false);
    expect(
      validateLeadershipDocumentFile(
        fakeFile("huge.pdf", MAX_LEADERSHIP_DOCUMENT_BYTES + 1),
      ).ok,
    ).toBe(false);
    expect(
      parseLeadershipDocumentCreate({
        title: "Hi",
        documentType: "POLICY",
      }).success,
    ).toBe(false);
  });
});

describe("leadership document access", () => {
  it("returns signed-out, missing organization, and forbidden states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getLeadershipDocuments()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastFindManyWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getLeadershipDocuments()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });

    mocks.getOrganizationAccess.mockResolvedValue({
      canEdit: false,
      isSuperAdmin: false,
      roleCode: "TREASURER",
    });
    await expect(getLeadershipDocuments()).resolves.toEqual({
      status: "UNAUTHORIZED",
    });
    await expect(
      createLeadershipDocument({
        title: "Should not upload",
        documentType: "POLICY",
        file: fakeFile("policy.pdf"),
      }),
    ).resolves.toEqual({ status: "UNAUTHORIZED" });
    expect(staffLeadershipDocumentNavItems(false)).toEqual([]);
    expect(staffLeadershipDocumentNavItems(true)).toEqual([
      { href: "/leadership-documents", label: "Leadership Documents" },
    ]);
  });
});

describe("leadership document scoping", () => {
  it("lists only current-org active documents and hides storage secrets", async () => {
    const result = await getLeadershipDocuments();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastFindManyWhere).toMatchObject({
      organizationId: ORG_ID,
      archivedAt: null,
    });
    expect(result.rows.map((row) => row.id)).toEqual([ACTIVE_ID]);
    expect(JSON.stringify(result)).not.toContain("Other church minutes");
    expect(JSON.stringify(result)).not.toContain("admin@church.test");
    expect(JSON.stringify(result)).not.toContain("fileKey");
    expect(JSON.stringify(result)).not.toContain("private/leadership-documents");
    expect(JSON.stringify(result)).not.toContain(process.cwd());
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...LEADERSHIP_DOCUMENT_ROW_FIELDS].sort(),
    );
  });

  it("keeps archived documents available through the archived filter", async () => {
    const archived = await getLeadershipDocuments({ archived: "archived" });
    expect(archived.status).toBe("READY");
    if (archived.status !== "READY") return;
    expect(archived.rows.map((row) => row.id)).toEqual([ARCHIVED_ID]);
    expect(archived.rows[0]?.archived).toBe(true);

    const policies = await getLeadershipDocuments({
      documentType: "POLICY",
      archived: "archived",
    });
    expect(policies.status).toBe("READY");
    if (policies.status === "READY") {
      expect(policies.rows.map((row) => row.id)).toEqual([ARCHIVED_ID]);
    }
  });

  it("does not reveal another organization's document by guessed id", async () => {
    await expect(getLeadershipDocumentDownload(OTHER_ORG_ID)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    mocks.getOrganizationAccess.mockResolvedValue({
      canEdit: false,
      roleCode: "TREASURER",
    });
    await expect(getLeadershipDocumentDownload(ACTIVE_ID)).resolves.toEqual({
      status: "NOT_FOUND",
    });
  });
});

describe("leadership document mutations", () => {
  it("uploads with a sanitized file record and a small audit summary", async () => {
    const result = await createLeadershipDocument({
      title: "Building use policy",
      description: "Current facility policy for leadership reference.",
      documentType: "POLICY",
      file: fakeFile("Building Use Policy.pdf"),
    });
    expect(result).toEqual({ status: "CREATED" });
    expect(store.lastCreateData).toMatchObject({
      organizationId: ORG_ID,
      documentType: "POLICY",
      fileName: "saved.pdf",
      fileKey: `private/leadership-documents/${ORG_ID}/saved.pdf`,
      uploadedByUserAccountId: ADMIN_ID,
    });
    const audit = JSON.stringify(mocks.createAuditEvent.mock.calls[0]?.[0]);
    expect(audit).toContain("UPLOAD_LEADERSHIP_DOCUMENT");
    expect(audit).toContain("POLICY");
    expect(audit).not.toContain("Current facility policy for leadership reference.");
    expect(audit).not.toContain("private/leadership-documents");
  });

  it("archives and restores without deleting history", async () => {
    await expect(
      archiveLeadershipDocument({ documentId: ACTIVE_ID }),
    ).resolves.toEqual({ status: "ARCHIVED" });
    const archived = store.documents.find((row) => row.id === ACTIVE_ID);
    expect(archived?.archivedAt).toBeInstanceOf(Date);
    expect(store.documents).toHaveLength(3);

    await expect(
      restoreLeadershipDocument({ documentId: ACTIVE_ID }),
    ).resolves.toEqual({ status: "RESTORED" });
    expect(store.documents.find((row) => row.id === ACTIVE_ID)?.archivedAt).toBeNull();

    await expect(
      archiveLeadershipDocument({ documentId: OTHER_ORG_ID }),
    ).resolves.toEqual({ status: "NOT_FOUND" });
  });

  it("audits downloads without leaking file keys", async () => {
    const download = await getLeadershipDocumentDownload(ACTIVE_ID);
    expect(download.status).toBe("READY");
    if (download.status !== "READY") return;
    expect(download.fileName).toBe("september-minutes.pdf");
    expect(JSON.stringify(download)).not.toContain("fileKey");
    const audit = JSON.stringify(mocks.createAuditEvent.mock.calls.at(-1)?.[0]);
    expect(audit).toContain("DOWNLOAD_LEADERSHIP_DOCUMENT");
    expect(audit).not.toContain("private/leadership-documents");
    expect(audit).not.toContain("Approved minutes from the September meeting.");
  });
});
