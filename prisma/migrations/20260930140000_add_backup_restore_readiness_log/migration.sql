-- Administrator log of external backup checks and restore tests.
-- Does not create, verify, restore, upload, download, delete, or schedule backups.
CREATE TYPE "BackupReadinessScope" AS ENUM (
  'DATABASE',
  'LEADERSHIP_DOCUMENTS',
  'MEMBER_DOCUMENTS',
  'PHOTOGRAPHS',
  'OTHER'
);

CREATE TYPE "BackupReadinessResult" AS ENUM (
  'VERIFIED',
  'RESTORE_TESTED',
  'NEEDS_ATTENTION',
  'NOT_VERIFIED'
);

CREATE TABLE "backup_readiness_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scope" "BackupReadinessScope" NOT NULL,
    "result" "BackupReadinessResult" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "nextReviewAt" DATE,
    "storageSummary" TEXT,
    "notes" TEXT,
    "performedByUserAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_readiness_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "backup_readiness_logs_organizationId_scope_checkedAt_idx"
  ON "backup_readiness_logs"("organizationId", "scope", "checkedAt");

CREATE INDEX "backup_readiness_logs_organizationId_nextReviewAt_idx"
  ON "backup_readiness_logs"("organizationId", "nextReviewAt");

ALTER TABLE "backup_readiness_logs"
  ADD CONSTRAINT "backup_readiness_logs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "backup_readiness_logs"
  ADD CONSTRAINT "backup_readiness_logs_performedByUserAccountId_fkey"
  FOREIGN KEY ("performedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
