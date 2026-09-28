-- Approved HTTPS resource links for a ministry. Not a file or document store.
CREATE TYPE "MinistryResourceStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "ministry_resources" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ministryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "status" "MinistryResourceStatus" NOT NULL DEFAULT 'DRAFT',
    "archivedAt" TIMESTAMP(3),
    "archivedByUserAccountId" UUID,
    "createdByUserAccountId" UUID NOT NULL,
    "updatedByUserAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ministry_resources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ministry_resources_organizationId_ministryId_status_idx"
  ON "ministry_resources"("organizationId", "ministryId", "status");

CREATE INDEX "ministry_resources_organizationId_status_idx"
  ON "ministry_resources"("organizationId", "status");

CREATE INDEX "ministry_resources_organizationId_archivedAt_idx"
  ON "ministry_resources"("organizationId", "archivedAt");

ALTER TABLE "ministry_resources"
  ADD CONSTRAINT "ministry_resources_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ministry_resources"
  ADD CONSTRAINT "ministry_resources_ministryId_fkey"
  FOREIGN KEY ("ministryId") REFERENCES "ministries"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ministry_resources"
  ADD CONSTRAINT "ministry_resources_createdByUserAccountId_fkey"
  FOREIGN KEY ("createdByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ministry_resources"
  ADD CONSTRAINT "ministry_resources_updatedByUserAccountId_fkey"
  FOREIGN KEY ("updatedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ministry_resources"
  ADD CONSTRAINT "ministry_resources_archivedByUserAccountId_fkey"
  FOREIGN KEY ("archivedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
