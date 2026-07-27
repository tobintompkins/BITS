-- CreateEnum
CREATE TYPE "MemberRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'DECEASED', 'MERGED');
CREATE TYPE "PreferredContactMethod" AS ENUM ('EMAIL', 'SMS', 'PHONE', 'POSTAL_MAIL', 'IN_PERSON', 'NO_PREFERENCE', 'DO_NOT_CONTACT');
CREATE TYPE "MemberConsentType" AS ENUM ('EMAIL', 'SMS', 'PHONE_CALLS', 'POSTAL_MAIL', 'DIRECTORY_LISTING', 'PHOTO_USE', 'GENERAL_COMMUNICATION');
CREATE TYPE "ConsentChangeSource" AS ENUM ('MEMBER_REQUEST', 'STAFF_UPDATE', 'IMPORT', 'ONLINE_FORM', 'ADMINISTRATIVE', 'OTHER');
CREATE TYPE "DuplicateCandidateStatus" AS ENUM ('PENDING', 'CONFIRMED_DUPLICATE', 'NOT_DUPLICATE', 'MERGED', 'DISMISSED');

-- AlterTable
ALTER TABLE "members"
  ADD COLUMN "recordStatus" "MemberRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" UUID,
  ADD COLUMN "archiveReason" TEXT,
  ADD COLUMN "deceasedDate" DATE,
  ADD COLUMN "deceasedNotes" TEXT,
  ADD COLUMN "preferredContactMethod" "PreferredContactMethod",
  ADD COLUMN "allowEmail" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowSms" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowPhoneCalls" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowPostalMail" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowDirectoryListing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowPhotoUse" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailOptOutDate" TIMESTAMP(3),
  ADD COLUMN "smsOptOutDate" TIMESTAMP(3),
  ADD COLUMN "directoryOptOutDate" TIMESTAMP(3),
  ADD COLUMN "photoOptOutDate" TIMESTAMP(3),
  ADD COLUMN "consentUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "consentUpdatedByUserId" UUID,
  ADD COLUMN "mergedIntoMemberId" UUID,
  ADD COLUMN "mergedAt" TIMESTAMP(3),
  ADD COLUMN "mergedByUserId" UUID;

CREATE INDEX "members_organizationId_recordStatus_idx" ON "members"("organizationId", "recordStatus");
CREATE INDEX "members_mergedIntoMemberId_idx" ON "members"("mergedIntoMemberId");

ALTER TABLE "members" ADD CONSTRAINT "members_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "members" ADD CONSTRAINT "members_consentUpdatedByUserId_fkey" FOREIGN KEY ("consentUpdatedByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "members" ADD CONSTRAINT "members_mergedIntoMemberId_fkey" FOREIGN KEY ("mergedIntoMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "members" ADD CONSTRAINT "members_mergedByUserId_fkey" FOREIGN KEY ("mergedByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "member_consent_history" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "consentType" "MemberConsentType" NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT NOT NULL,
    "source" "ConsentChangeSource" NOT NULL,
    "notes" TEXT,
    "changedByUserId" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_consent_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_merges" (
    "id" UUID NOT NULL,
    "primaryMemberId" UUID NOT NULL,
    "duplicateMemberId" UUID NOT NULL,
    "mergedByUserId" UUID NOT NULL,
    "mergeSummary" TEXT NOT NULL,
    "fieldSelections" JSONB NOT NULL,
    "relatedRecordSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "member_merges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_duplicate_candidates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberAId" UUID NOT NULL,
    "memberBId" UUID NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "matchReasons" JSONB NOT NULL,
    "status" "DuplicateCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_duplicate_candidates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "member_consent_history_memberId_changedAt_idx" ON "member_consent_history"("memberId", "changedAt");
CREATE INDEX "member_merges_primaryMemberId_idx" ON "member_merges"("primaryMemberId");
CREATE INDEX "member_merges_duplicateMemberId_idx" ON "member_merges"("duplicateMemberId");
CREATE UNIQUE INDEX "member_duplicate_candidates_memberAId_memberBId_key" ON "member_duplicate_candidates"("memberAId", "memberBId");
CREATE INDEX "member_duplicate_candidates_organizationId_status_idx" ON "member_duplicate_candidates"("organizationId", "status");
CREATE INDEX "member_duplicate_candidates_organizationId_matchScore_idx" ON "member_duplicate_candidates"("organizationId", "matchScore");

ALTER TABLE "member_consent_history" ADD CONSTRAINT "member_consent_history_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_consent_history" ADD CONSTRAINT "member_consent_history_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "member_merges" ADD CONSTRAINT "member_merges_primaryMemberId_fkey" FOREIGN KEY ("primaryMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_merges" ADD CONSTRAINT "member_merges_duplicateMemberId_fkey" FOREIGN KEY ("duplicateMemberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_merges" ADD CONSTRAINT "member_merges_mergedByUserId_fkey" FOREIGN KEY ("mergedByUserId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_duplicate_candidates" ADD CONSTRAINT "member_duplicate_candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_duplicate_candidates" ADD CONSTRAINT "member_duplicate_candidates_memberAId_fkey" FOREIGN KEY ("memberAId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_duplicate_candidates" ADD CONSTRAINT "member_duplicate_candidates_memberBId_fkey" FOREIGN KEY ("memberBId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_duplicate_candidates" ADD CONSTRAINT "member_duplicate_candidates_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
