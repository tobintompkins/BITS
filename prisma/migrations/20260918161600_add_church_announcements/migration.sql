CREATE TYPE "ChurchAnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "church_announcements" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "ChurchAnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "createdByUserAccountId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "church_announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "church_announcements_organizationId_status_publishedAt_idx" ON "church_announcements"("organizationId", "status", "publishedAt");
CREATE INDEX "church_announcements_organizationId_createdAt_idx" ON "church_announcements"("organizationId", "createdAt");

ALTER TABLE "church_announcements" ADD CONSTRAINT "church_announcements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "church_announcements" ADD CONSTRAINT "church_announcements_createdByUserAccountId_fkey" FOREIGN KEY ("createdByUserAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
