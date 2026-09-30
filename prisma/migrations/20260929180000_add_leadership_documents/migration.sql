-- Private leadership document library for organization administrators.
CREATE TYPE "LeadershipDocumentType" AS ENUM (
  'BOARD_MINUTES',
  'POLICY',
  'LEADERSHIP_RESOURCE',
  'FACILITY_DOCUMENT',
  'FINANCIAL_REFERENCE',
  'OTHER'
);

CREATE TABLE "leadership_documents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentType" "LeadershipDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedByUserAccountId" UUID NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserAccountId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leadership_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leadership_documents_organizationId_documentType_idx"
  ON "leadership_documents"("organizationId", "documentType");

CREATE INDEX "leadership_documents_organizationId_archivedAt_idx"
  ON "leadership_documents"("organizationId", "archivedAt");

CREATE INDEX "leadership_documents_createdAt_idx"
  ON "leadership_documents"("createdAt");

ALTER TABLE "leadership_documents"
  ADD CONSTRAINT "leadership_documents_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leadership_documents"
  ADD CONSTRAINT "leadership_documents_uploadedByUserAccountId_fkey"
  FOREIGN KEY ("uploadedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leadership_documents"
  ADD CONSTRAINT "leadership_documents_archivedByUserAccountId_fkey"
  FOREIGN KEY ("archivedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
