CREATE TABLE "church_announcement_read_receipts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "announcementId" UUID NOT NULL,
  "userAccountId" UUID NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "church_announcement_read_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "church_announcement_read_receipts_org_announcement_user_key"
  ON "church_announcement_read_receipts"("organizationId", "announcementId", "userAccountId");

CREATE INDEX "church_announcement_read_receipts_org_announcement_idx"
  ON "church_announcement_read_receipts"("organizationId", "announcementId");

ALTER TABLE "church_announcement_read_receipts"
  ADD CONSTRAINT "church_announcement_read_receipts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "church_announcement_read_receipts"
  ADD CONSTRAINT "church_announcement_read_receipts_announcementId_fkey"
  FOREIGN KEY ("announcementId") REFERENCES "church_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "church_announcement_read_receipts"
  ADD CONSTRAINT "church_announcement_read_receipts_userAccountId_fkey"
  FOREIGN KEY ("userAccountId") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
