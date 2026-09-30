-- Public church service alerts for weather, cancellations, delays, and service changes.
-- Does not alter church announcements or send email/text notifications.
CREATE TYPE "ChurchServiceAlertStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED'
);

CREATE TYPE "ChurchServiceAlertType" AS ENUM (
  'WEATHER',
  'CANCELLATION',
  'DELAY',
  'SERVICE_CHANGE',
  'GENERAL'
);

CREATE TABLE "church_service_alerts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "alertType" "ChurchServiceAlertType" NOT NULL,
    "status" "ChurchServiceAlertStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdByUserAccountId" UUID NOT NULL,
    "updatedByUserAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_service_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "church_service_alerts_org_status_window_idx"
  ON "church_service_alerts"("organizationId", "status", "startsAt", "expiresAt");

CREATE INDEX "church_service_alerts_org_status_expires_idx"
  ON "church_service_alerts"("organizationId", "status", "expiresAt");

ALTER TABLE "church_service_alerts"
  ADD CONSTRAINT "church_service_alerts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "church_service_alerts"
  ADD CONSTRAINT "church_service_alerts_createdByUserAccountId_fkey"
  FOREIGN KEY ("createdByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "church_service_alerts"
  ADD CONSTRAINT "church_service_alerts_updatedByUserAccountId_fkey"
  FOREIGN KEY ("updatedByUserAccountId") REFERENCES "user_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
