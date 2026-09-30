-- Church data-retention policy register. Records guidance only; does not delete or purge data.
CREATE TYPE "DataRetentionCategory" AS ENUM (
  'MEMBER_RECORDS',
  'GIVING_AND_STATEMENTS',
  'EVENT_AND_ATTENDANCE',
  'VOLUNTEER_AND_TRAINING',
  'LEADERSHIP_DOCUMENTS',
  'MAINTENANCE_AND_OPERATIONS',
  'PRIVACY_REQUESTS',
  'AUDIT_HISTORY',
  'OTHER'
);

CREATE TABLE "data_retention_policies" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "category" "DataRetentionCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "retentionPeriodMonths" INTEGER,
    "policySummary" TEXT NOT NULL,
    "reviewDueAt" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserAccountId" UUID NOT NULL,
    "updatedByUserAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_retention_policies_retentionPeriodMonths_check"
      CHECK ("retentionPeriodMonths" IS NULL OR "retentionPeriodMonths" > 0)
);

CREATE UNIQUE INDEX "data_retention_policies_organizationId_category_key"
  ON "data_retention_policies"("organizationId", "category");

CREATE INDEX "data_retention_policies_organizationId_isActive_idx"
  ON "data_retention_policies"("organizationId", "isActive");

CREATE INDEX "data_retention_policies_organizationId_reviewDueAt_idx"
  ON "data_retention_policies"("organizationId", "reviewDueAt");

ALTER TABLE "data_retention_policies"
  ADD CONSTRAINT "data_retention_policies_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "data_retention_policies"
  ADD CONSTRAINT "data_retention_policies_createdByUserAccountId_fkey"
  FOREIGN KEY ("createdByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_retention_policies"
  ADD CONSTRAINT "data_retention_policies_updatedByUserAccountId_fkey"
  FOREIGN KEY ("updatedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
