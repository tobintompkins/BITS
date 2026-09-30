import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BLOCKED_MEMBER_PORTAL_DOCUMENT_TYPES,
  MEMBER_SAFE_DOCUMENT_ROW_FIELDS,
  SAFE_MEMBER_DOCUMENT_TYPES,
  formatMemberSafeDocumentDate,
  formatMemberSafeDocumentFileSize,
  formatMemberSafeDocumentTypeLabel,
  isSafeMemberDocumentType,
} from "@/lib/validation/member-safe-documents";

type MemberRow = {
  id: string;
  organizationId: string;
  userAccountId: string | null;
  recordStatus: string;
  firstName: string;
  lastName: string;
  email: string;
};

type DocumentRow = {
  id: string;
  organizationId: string;
  memberId: string;
  documentType: string;
  title: string;
  description: string | null;
  fileName: string;
  fileUrl: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  isConfidential: boolean;
  expirationDate: Date | null;
  uploadedByUserId: string;
  createdAt: Date;
};

const store = vi.hoisted(() => ({
  members: [] as MemberRow[],
  documents: [] as DocumentRow[],
  lastMemberWhere: null as unknown,
  lastDocumentWhere: null as unknown,
  lastDocumentSelect: null as unknown,
  lastDocumentOrderBy: null as unknown,
  lastDownloadWhere: null as unknown,
  lastDownloadSelect: null as unknown,
  lastResolvedFileKey: null as string | null,
}));

const mocks = vi.hoisted(() => ({
  getOrCreateUserAccount: vi.fn(),
  findPrimaryOrganization: vi.fn(),
  resolveExistingLocalDocumentAbsolutePath: vi.fn(),
}));

vi.mock("@/lib/auth/user-account", () => ({
  getOrCreateUserAccount: mocks.getOrCreateUserAccount,
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  findPrimaryOrganization: mocks.findPrimaryOrganization,
}));

vi.mock("@/lib/storage/member-document", () => ({
  sanitizeFileName: (fileName: string) =>
    fileName.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180) || "document",
  resolveExistingLocalDocumentAbsolutePath:
    mocks.resolveExistingLocalDocumentAbsolutePath,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    member: {
      findFirst: async ({
        where,
      }: {
        where: {
          organizationId: string;
          userAccountId: string;
          recordStatus: string;
        };
      }) => {
        store.lastMemberWhere = where;
        const row = store.members.find(
          (item) =>
            item.organizationId === where.organizationId &&
            item.userAccountId === where.userAccountId &&
            item.recordStatus === where.recordStatus,
        );
        return row ? { id: row.id } : null;
      },
    },
    memberDocument: {
      findMany: async ({
        where,
        select,
        orderBy,
      }: {
        where: {
          organizationId: string;
          memberId: string;
          isConfidential: boolean;
          documentType: { in: string[] };
        };
        select: unknown;
        orderBy: unknown;
      }) => {
        store.lastDocumentWhere = where;
        store.lastDocumentSelect = select;
        store.lastDocumentOrderBy = orderBy;
        const allowed = new Set(where.documentType.in);
        return store.documents
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.memberId === where.memberId &&
              row.isConfidential === where.isConfidential &&
              allowed.has(row.documentType),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((row) => ({
            id: row.id,
            documentType: row.documentType,
            title: row.title,
            description: row.description,
            fileName: row.fileName,
            mimeType: row.mimeType,
            fileSize: row.fileSize,
            createdAt: row.createdAt,
            expirationDate: row.expirationDate,
          }));
      },
      findFirst: async ({
        where,
        select,
      }: {
        where: {
          id: string;
          organizationId: string;
          memberId: string;
          isConfidential: boolean;
          documentType: { in: string[] };
        };
        select: unknown;
      }) => {
        store.lastDownloadWhere = where;
        store.lastDownloadSelect = select;
        const allowed = new Set(where.documentType.in);
        const row = store.documents.find(
          (item) =>
            item.id === where.id &&
            item.organizationId === where.organizationId &&
            item.memberId === where.memberId &&
            item.isConfidential === where.isConfidential &&
            allowed.has(item.documentType),
        );
        return row
          ? {
              fileKey: row.fileKey,
              fileName: row.fileName,
              mimeType: row.mimeType,
            }
          : null;
      },
    },
  },
}));

import {
  getMemberSafeDocumentDownload,
  getMemberSafeDocuments,
} from "./member-safe-documents.service";

const ORG_ID = "00000000-0000-4000-8000-00000000a001";
const OTHER_ORG = "00000000-0000-4000-8000-00000000a002";
const USER_ID = "00000000-0000-4000-8000-00000000c001";
const STAFF_ID = "00000000-0000-4000-8000-00000000c099";
const MEMBER_ID = "00000000-0000-4000-8000-00000000d001";
const OTHER_MEMBER = "00000000-0000-4000-8000-00000000d002";
const OTHER_ORG_MEMBER = "00000000-0000-4000-8000-00000000d003";
const OWN_EMAIL = "ann@church.test";

const BAPTISM_ID = "00000000-0000-4000-8000-00000000e001";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-00000000e002";
const TRAINING_ID = "00000000-0000-4000-8000-00000000e003";
const MARRIAGE_ID = "00000000-0000-4000-8000-00000000e004";
const ORDINATION_ID = "00000000-0000-4000-8000-00000000e005";
const CONFIDENTIAL_TRAINING_ID = "00000000-0000-4000-8000-00000000e006";
const BACKGROUND_ID = "00000000-0000-4000-8000-00000000e007";
const MEDICAL_ID = "00000000-0000-4000-8000-00000000e008";
const PASTORAL_ID = "00000000-0000-4000-8000-00000000e009";
const IDENTIFICATION_ID = "00000000-0000-4000-8000-00000000e00a";
const VOLUNTEER_APP_ID = "00000000-0000-4000-8000-00000000e00b";
const PERMISSION_ID = "00000000-0000-4000-8000-00000000e00c";
const OTHER_TYPE_ID = "00000000-0000-4000-8000-00000000e00d";
const OTHER_MEMBER_DOC_ID = "00000000-0000-4000-8000-00000000e00e";
const OTHER_ORG_DOC_ID = "00000000-0000-4000-8000-00000000e00f";
const GUESSED_ID = "00000000-0000-4000-8000-00000000e0ff";

function document(partial: DocumentRow): DocumentRow {
  return partial;
}

function seed() {
  store.members = [
    {
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      firstName: "Ann",
      lastName: "Adams",
      email: OWN_EMAIL,
    },
    {
      id: OTHER_MEMBER,
      organizationId: ORG_ID,
      userAccountId: "00000000-0000-4000-8000-00000000c002",
      recordStatus: "ACTIVE",
      firstName: "Blake",
      lastName: "Baker",
      email: "blake@church.test",
    },
    {
      id: OTHER_ORG_MEMBER,
      organizationId: OTHER_ORG,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
      firstName: "Other",
      lastName: "Church",
      email: "other@elsewhere.test",
    },
  ];

  store.documents = [
    document({
      id: ORDINATION_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "ORDINATION_DOCUMENT",
      title: "Ordination certificate",
      description: "Recorded ordination",
      fileName: "ordination.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/ordination.pdf`,
      mimeType: "application/pdf",
      fileSize: 102400,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-20T12:00:00.000Z"),
    }),
    document({
      id: MARRIAGE_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "MARRIAGE_CERTIFICATE",
      title: "Marriage certificate",
      description: null,
      fileName: "marriage.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/marriage.pdf`,
      mimeType: "application/pdf",
      fileSize: 2048,
      isConfidential: false,
      expirationDate: new Date("2027-01-15T00:00:00.000Z"),
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
    }),
    document({
      id: TRAINING_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "TRAINING_CERTIFICATE",
      title: "Safeguarding training",
      description: "Completed training",
      fileName: "training.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/training.pdf`,
      mimeType: "application/pdf",
      fileSize: 512,
      isConfidential: false,
      expirationDate: new Date("2027-06-01T00:00:00.000Z"),
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-05T12:00:00.000Z"),
    }),
    document({
      id: MEMBERSHIP_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "MEMBERSHIP_FORM",
      title: "Membership form",
      description: null,
      fileName: "membership.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/membership.pdf`,
      mimeType: "application/pdf",
      fileSize: 81920,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
    }),
    document({
      id: BAPTISM_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "BAPTISM_CERTIFICATE",
      title: "Baptism certificate",
      description: "Baptism record",
      fileName: "baptism.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/baptism.pdf`,
      mimeType: "application/pdf",
      fileSize: 4096,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-07-01T12:00:00.000Z"),
    }),
    document({
      id: CONFIDENTIAL_TRAINING_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "TRAINING_CERTIFICATE",
      title: "Confidential training notes",
      description: "staff-only training remark",
      fileName: "confidential-training.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/confidential-training.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: true,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-25T12:00:00.000Z"),
    }),
    document({
      id: BACKGROUND_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "BACKGROUND_CHECK",
      title: "Background check",
      description: "do not show background",
      fileName: "background.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/background.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-30T12:00:00.000Z"),
    }),
    document({
      id: MEDICAL_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "MEDICAL_FORM",
      title: "Medical form",
      description: "do not show medical",
      fileName: "medical.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/medical.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-29T12:00:00.000Z"),
    }),
    document({
      id: PASTORAL_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "PASTORAL_DOCUMENT",
      title: "Pastoral note file",
      description: "pastoral care note",
      fileName: "pastoral.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/pastoral.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-28T12:00:00.000Z"),
    }),
    document({
      id: IDENTIFICATION_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "IDENTIFICATION",
      title: "Driver license copy",
      description: "identification copy",
      fileName: "id-card.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/id-card.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-27T12:00:00.000Z"),
    }),
    document({
      id: VOLUNTEER_APP_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "VOLUNTEER_APPLICATION",
      title: "Volunteer application",
      description: "volunteer application file",
      fileName: "volunteer-app.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/volunteer-app.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-26T12:00:00.000Z"),
    }),
    document({
      id: PERMISSION_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "PERMISSION_FORM",
      title: "Permission form",
      description: "permission form file",
      fileName: "permission.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/permission.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-24T12:00:00.000Z"),
    }),
    document({
      id: OTHER_TYPE_ID,
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      documentType: "OTHER",
      title: "Other file",
      description: "unclassified file",
      fileName: "other.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${MEMBER_ID}/documents/other.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-23T12:00:00.000Z"),
    }),
    document({
      id: OTHER_MEMBER_DOC_ID,
      organizationId: ORG_ID,
      memberId: OTHER_MEMBER,
      documentType: "BAPTISM_CERTIFICATE",
      title: "Blake baptism",
      description: "other member baptism",
      fileName: "blake-baptism.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${ORG_ID}/${OTHER_MEMBER}/documents/blake-baptism.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-22T12:00:00.000Z"),
    }),
    document({
      id: OTHER_ORG_DOC_ID,
      organizationId: OTHER_ORG,
      memberId: OTHER_ORG_MEMBER,
      documentType: "MEMBERSHIP_FORM",
      title: "Other church form",
      description: "other organization form",
      fileName: "other-org.pdf",
      fileUrl: "/api/member-documents",
      fileKey: `private/members/${OTHER_ORG}/${OTHER_ORG_MEMBER}/documents/other-org.pdf`,
      mimeType: "application/pdf",
      fileSize: 1000,
      isConfidential: false,
      expirationDate: null,
      uploadedByUserId: STAFF_ID,
      createdAt: new Date("2026-09-21T12:00:00.000Z"),
    }),
  ];
}

beforeEach(() => {
  store.members = [];
  store.documents = [];
  store.lastMemberWhere = null;
  store.lastDocumentWhere = null;
  store.lastDocumentSelect = null;
  store.lastDocumentOrderBy = null;
  store.lastDownloadWhere = null;
  store.lastDownloadSelect = null;
  store.lastResolvedFileKey = null;
  mocks.getOrCreateUserAccount.mockReset();
  mocks.findPrimaryOrganization.mockReset();
  mocks.resolveExistingLocalDocumentAbsolutePath.mockReset();
  mocks.getOrCreateUserAccount.mockResolvedValue({
    id: USER_ID,
    primaryEmail: OWN_EMAIL,
    displayName: "Ann Adams",
  });
  mocks.findPrimaryOrganization.mockResolvedValue({ id: ORG_ID });
  mocks.resolveExistingLocalDocumentAbsolutePath.mockImplementation(
    async (fileKey: string) => {
      store.lastResolvedFileKey = fileKey;
      return "/tmp/member-safe-document.bin";
    },
  );
  seed();
});

describe("member safe document labels and formatting", () => {
  it("keeps the first-patch allow-list small and labeled", () => {
    expect([...SAFE_MEMBER_DOCUMENT_TYPES]).toEqual([
      "BAPTISM_CERTIFICATE",
      "MEMBERSHIP_FORM",
      "TRAINING_CERTIFICATE",
      "MARRIAGE_CERTIFICATE",
      "ORDINATION_DOCUMENT",
    ]);
    expect(formatMemberSafeDocumentTypeLabel("BAPTISM_CERTIFICATE")).toBe(
      "Baptism Certificate",
    );
    expect(formatMemberSafeDocumentTypeLabel("MEMBERSHIP_FORM")).toBe(
      "Membership Form",
    );
    expect(formatMemberSafeDocumentTypeLabel("TRAINING_CERTIFICATE")).toBe(
      "Training Certificate",
    );
    expect(formatMemberSafeDocumentTypeLabel("MARRIAGE_CERTIFICATE")).toBe(
      "Marriage Certificate",
    );
    expect(formatMemberSafeDocumentTypeLabel("ORDINATION_DOCUMENT")).toBe(
      "Ordination Document",
    );
    for (const blocked of BLOCKED_MEMBER_PORTAL_DOCUMENT_TYPES) {
      expect(isSafeMemberDocumentType(blocked)).toBe(false);
    }
  });

  it("formats dates and file sizes for display", () => {
    expect(formatMemberSafeDocumentDate(new Date("2026-09-20T12:00:00.000Z"))).toBe(
      "Sep 20, 2026",
    );
    expect(formatMemberSafeDocumentFileSize(512)).toBe("512 B");
    expect(formatMemberSafeDocumentFileSize(2048)).toBe("2 KB");
    expect(formatMemberSafeDocumentFileSize(102400)).toBe("100 KB");
    expect(formatMemberSafeDocumentFileSize(1048576)).toBe("1 MB");
  });
});

describe("member safe documents access", () => {
  it("returns signed-out, no-organization, and pending states", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getMemberSafeDocuments()).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastMemberWhere).toBeNull();
    expect(store.lastDocumentWhere).toBeNull();

    mocks.findPrimaryOrganization.mockResolvedValueOnce(null);
    await expect(getMemberSafeDocuments()).resolves.toEqual({
      status: "NO_ORGANIZATION",
    });
    expect(store.lastDocumentWhere).toBeNull();

    store.members[0]!.userAccountId = null;
    await expect(getMemberSafeDocuments()).resolves.toEqual({
      status: "CONNECTION_PENDING",
      accountEmail: OWN_EMAIL,
    });
    expect(store.lastDocumentWhere).toBeNull();
  });

  it("queries only the current organization and signed-in linked member", async () => {
    await getMemberSafeDocuments();
    expect(store.lastMemberWhere).toEqual({
      organizationId: ORG_ID,
      userAccountId: USER_ID,
      recordStatus: "ACTIVE",
    });
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("email");
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain(OWN_EMAIL);
    expect(JSON.stringify(store.lastMemberWhere)).not.toContain("Adams");
    expect(store.lastDocumentWhere).toEqual({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      isConfidential: false,
      documentType: { in: [...SAFE_MEMBER_DOCUMENT_TYPES] },
    });
  });
});

describe("member safe document rows", () => {
  it("returns newest-first safe documents for the linked member only", async () => {
    const result = await getMemberSafeDocuments();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastDocumentOrderBy).toEqual({ createdAt: "desc" });
    expect(result.rows.map((row) => row.title)).toEqual([
      "Ordination certificate",
      "Marriage certificate",
      "Safeguarding training",
      "Membership form",
      "Baptism certificate",
    ]);
    expect(result.rows.map((row) => row.typeLabel)).toEqual([
      "Ordination Document",
      "Marriage Certificate",
      "Training Certificate",
      "Membership Form",
      "Baptism Certificate",
    ]);
  });

  it("never returns sensitive, confidential, other-member, or other-organization documents", async () => {
    const result = await getMemberSafeDocuments();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("Background check");
    expect(payload).not.toContain("Medical form");
    expect(payload).not.toContain("Pastoral note");
    expect(payload).not.toContain("Driver license");
    expect(payload).not.toContain("Volunteer application");
    expect(payload).not.toContain("Permission form");
    expect(payload).not.toContain("Other file");
    expect(payload).not.toContain("Confidential training");
    expect(payload).not.toContain("Blake baptism");
    expect(payload).not.toContain("Other church form");
    expect(payload).not.toContain(BACKGROUND_ID);
    expect(payload).not.toContain(OTHER_MEMBER_DOC_ID);
    expect(payload).not.toContain(OTHER_ORG_DOC_ID);
  });

  it("returns only the safe selected display fields", async () => {
    const result = await getMemberSafeDocuments();
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(store.lastDocumentSelect).toEqual({
      id: true,
      documentType: true,
      title: true,
      description: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      createdAt: true,
      expirationDate: true,
    });
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      [...MEMBER_SAFE_DOCUMENT_ROW_FIELDS].sort(),
    );
    expect(result.rows[0]).toEqual({
      id: ORDINATION_ID,
      typeLabel: "Ordination Document",
      title: "Ordination certificate",
      description: "Recorded ordination",
      fileName: "ordination.pdf",
      mimeType: "application/pdf",
      fileSizeLabel: "100 KB",
      createdOnLabel: "Sep 20, 2026",
      expiresOnLabel: null,
    });
    expect(result.rows[1]).toEqual({
      id: MARRIAGE_ID,
      typeLabel: "Marriage Certificate",
      title: "Marriage certificate",
      description: null,
      fileName: "marriage.pdf",
      mimeType: "application/pdf",
      fileSizeLabel: "2 KB",
      createdOnLabel: "Sep 10, 2026",
      expiresOnLabel: "Jan 15, 2027",
    });
  });

  it("omits file keys, storage paths, staff identity, and internal notes", async () => {
    const result = await getMemberSafeDocuments();
    expect(result.status).toBe("READY");
    const payload = JSON.stringify(result);
    expect(payload).not.toContain("fileKey");
    expect(payload).not.toContain("private/members");
    expect(payload).not.toContain("/api/member-documents");
    expect(payload).not.toContain(STAFF_ID);
    expect(payload).not.toContain(USER_ID);
    expect(payload).not.toContain(MEMBER_ID);
    expect(payload).not.toContain("staff-only training remark");
    expect(payload).not.toContain("pastoral care note");
    expect(JSON.stringify(store.lastDocumentSelect)).not.toContain("fileKey");
    expect(JSON.stringify(store.lastDocumentSelect)).not.toContain(
      "uploadedByUserId",
    );
  });
});

describe("member safe document download", () => {
  it("returns signed-out without looking up a document", async () => {
    mocks.getOrCreateUserAccount.mockResolvedValueOnce(null);
    await expect(getMemberSafeDocumentDownload(BAPTISM_ID)).resolves.toEqual({
      status: "SIGNED_OUT",
    });
    expect(store.lastDownloadWhere).toBeNull();
  });

  it("does not let a guessed document id bypass current-member ownership", async () => {
    await expect(
      getMemberSafeDocumentDownload(OTHER_MEMBER_DOC_ID),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(
      getMemberSafeDocumentDownload(BACKGROUND_ID),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(
      getMemberSafeDocumentDownload(CONFIDENTIAL_TRAINING_ID),
    ).resolves.toEqual({ status: "NOT_FOUND" });
    await expect(getMemberSafeDocumentDownload(GUESSED_ID)).resolves.toEqual({
      status: "NOT_FOUND",
    });
    await expect(getMemberSafeDocumentDownload("not-a-uuid")).resolves.toEqual({
      status: "NOT_FOUND",
    });
    expect(store.lastDownloadWhere).toMatchObject({
      organizationId: ORG_ID,
      memberId: MEMBER_ID,
      isConfidential: false,
      documentType: { in: [...SAFE_MEMBER_DOCUMENT_TYPES] },
    });
  });

  it("streams only a current-member safe document and hides storage identity", async () => {
    const result = await getMemberSafeDocumentDownload(TRAINING_ID);
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.fileName).toBe("training.pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(Object.keys(result).sort()).toEqual([
      "absolutePath",
      "fileName",
      "mimeType",
      "status",
    ]);
    expect(JSON.stringify(result)).not.toContain("fileKey");
    expect(JSON.stringify(result)).not.toContain("private/members");
    expect(JSON.stringify(result)).not.toContain(STAFF_ID);
    expect(store.lastDownloadSelect).toEqual({
      fileKey: true,
      fileName: true,
      mimeType: true,
    });
    expect(store.lastResolvedFileKey).toContain("training.pdf");
  });
});
