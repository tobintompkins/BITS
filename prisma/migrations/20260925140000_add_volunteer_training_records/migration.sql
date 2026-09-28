-- Ordinary ministry training completion and optional expiration dates.
-- This is not a background-check, certificate, or confidential-note store.
CREATE TABLE "volunteer_training_records" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "ministryId" UUID,
    "title" TEXT NOT NULL,
    "completedOn" DATE NOT NULL,
    "expiresOn" DATE,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserAccountId" UUID,
    "createdByUserAccountId" UUID NOT NULL,
    "updatedByUserAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_training_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "volunteer_training_records_organizationId_memberId_idx"
  ON "volunteer_training_records"("organizationId", "memberId");

CREATE INDEX "volunteer_training_records_organizationId_ministryId_idx"
  ON "volunteer_training_records"("organizationId", "ministryId");

CREATE INDEX "volunteer_training_records_organizationId_expiresOn_idx"
  ON "volunteer_training_records"("organizationId", "expiresOn");

CREATE INDEX "volunteer_training_records_organizationId_archivedAt_idx"
  ON "volunteer_training_records"("organizationId", "archivedAt");

ALTER TABLE "volunteer_training_records"
  ADD CONSTRAINT "volunteer_training_records_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "volunteer_training_records"
  ADD CONSTRAINT "volunteer_training_records_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_training_records"
  ADD CONSTRAINT "volunteer_training_records_ministryId_fkey"
  FOREIGN KEY ("ministryId") REFERENCES "ministries"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_training_records"
  ADD CONSTRAINT "volunteer_training_records_createdByUserAccountId_fkey"
  FOREIGN KEY ("createdByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_training_records"
  ADD CONSTRAINT "volunteer_training_records_updatedByUserAccountId_fkey"
  FOREIGN KEY ("updatedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volunteer_training_records"
  ADD CONSTRAINT "volunteer_training_records_archivedByUserAccountId_fkey"
  FOREIGN KEY ("archivedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
