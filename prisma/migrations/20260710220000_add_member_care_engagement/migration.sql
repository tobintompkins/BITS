-- CreateEnum
CREATE TYPE "AttendanceType" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED', 'ONLINE', 'VOLUNTEER', 'GUEST');
CREATE TYPE "FollowUpType" AS ENUM ('VISITOR_WELCOME', 'PHONE_CALL', 'EMAIL', 'TEXT_MESSAGE', 'HOME_VISIT', 'PASTORAL_CARE', 'PRAYER_FOLLOW_UP', 'MEMBERSHIP_FOLLOW_UP', 'BAPTISM_FOLLOW_UP', 'GENERAL');
CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');
CREATE TYPE "FollowUpPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "PastoralCareCategory" AS ENUM ('GENERAL', 'HOSPITAL_VISIT', 'BEREAVEMENT', 'COUNSELING', 'FAMILY_SUPPORT', 'FINANCIAL_ASSISTANCE', 'SPIRITUAL_GUIDANCE', 'MARRIAGE_SUPPORT', 'HEALTH_CONCERN', 'OTHER');
CREATE TYPE "PrayerRequestStatus" AS ENUM ('ACTIVE', 'IN_PRAYER', 'ANSWERED', 'ARCHIVED');
CREATE TYPE "PrayerPrivacyLevel" AS ENUM ('PUBLIC', 'PRAYER_TEAM', 'PASTORAL_STAFF', 'PRIVATE');
CREATE TYPE "CommunicationType" AS ENUM ('PHONE', 'EMAIL', 'TEXT', 'IN_PERSON', 'VIDEO_CALL', 'LETTER', 'OTHER');
CREATE TYPE "CommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "member_attendances" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "serviceName" TEXT NOT NULL,
    "eventId" TEXT,
    "attendanceType" "AttendanceType" NOT NULL DEFAULT 'PRESENT',
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "checkedInByUserId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_attendances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_follow_ups" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "followUpType" "FollowUpType" NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "FollowUpPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedToUserId" UUID,
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "outcome" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pastoral_care_notes" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "category" "PastoralCareCategory" NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "assignedPastorUserId" UUID,
    "followUpDate" DATE,
    "resolvedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pastoral_care_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prayer_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID,
    "requesterName" TEXT,
    "request" TEXT NOT NULL,
    "status" "PrayerRequestStatus" NOT NULL DEFAULT 'ACTIVE',
    "privacyLevel" "PrayerPrivacyLevel" NOT NULL DEFAULT 'PRAYER_TEAM',
    "assignedToUserId" UUID,
    "answeredAt" TIMESTAMP(3),
    "answerNotes" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prayer_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_communications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "communicationType" "CommunicationType" NOT NULL,
    "direction" "CommunicationDirection" NOT NULL,
    "subject" TEXT,
    "messageSummary" TEXT NOT NULL,
    "communicationDate" TIMESTAMP(3) NOT NULL,
    "contactedByUserId" UUID NOT NULL,
    "outcome" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_communications_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "member_attendances_organizationId_attendanceDate_idx" ON "member_attendances"("organizationId", "attendanceDate");
CREATE INDEX "member_attendances_memberId_attendanceDate_idx" ON "member_attendances"("memberId", "attendanceDate");
CREATE INDEX "member_attendances_organizationId_serviceName_idx" ON "member_attendances"("organizationId", "serviceName");
CREATE INDEX "member_follow_ups_organizationId_status_idx" ON "member_follow_ups"("organizationId", "status");
CREATE INDEX "member_follow_ups_organizationId_dueDate_idx" ON "member_follow_ups"("organizationId", "dueDate");
CREATE INDEX "member_follow_ups_memberId_idx" ON "member_follow_ups"("memberId");
CREATE INDEX "member_follow_ups_assignedToUserId_idx" ON "member_follow_ups"("assignedToUserId");
CREATE INDEX "pastoral_care_notes_organizationId_resolvedAt_idx" ON "pastoral_care_notes"("organizationId", "resolvedAt");
CREATE INDEX "pastoral_care_notes_memberId_idx" ON "pastoral_care_notes"("memberId");
CREATE INDEX "pastoral_care_notes_assignedPastorUserId_idx" ON "pastoral_care_notes"("assignedPastorUserId");
CREATE INDEX "prayer_requests_organizationId_status_idx" ON "prayer_requests"("organizationId", "status");
CREATE INDEX "prayer_requests_organizationId_privacyLevel_idx" ON "prayer_requests"("organizationId", "privacyLevel");
CREATE INDEX "prayer_requests_memberId_idx" ON "prayer_requests"("memberId");
CREATE INDEX "prayer_requests_assignedToUserId_idx" ON "prayer_requests"("assignedToUserId");
CREATE INDEX "member_communications_organizationId_communicationDate_idx" ON "member_communications"("organizationId", "communicationDate");
CREATE INDEX "member_communications_memberId_communicationDate_idx" ON "member_communications"("memberId", "communicationDate");

-- ForeignKeys
ALTER TABLE "member_attendances" ADD CONSTRAINT "member_attendances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_attendances" ADD CONSTRAINT "member_attendances_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_attendances" ADD CONSTRAINT "member_attendances_checkedInByUserId_fkey" FOREIGN KEY ("checkedInByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "member_follow_ups" ADD CONSTRAINT "member_follow_ups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_follow_ups" ADD CONSTRAINT "member_follow_ups_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_follow_ups" ADD CONSTRAINT "member_follow_ups_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "member_follow_ups" ADD CONSTRAINT "member_follow_ups_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pastoral_care_notes" ADD CONSTRAINT "pastoral_care_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pastoral_care_notes" ADD CONSTRAINT "pastoral_care_notes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pastoral_care_notes" ADD CONSTRAINT "pastoral_care_notes_assignedPastorUserId_fkey" FOREIGN KEY ("assignedPastorUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pastoral_care_notes" ADD CONSTRAINT "pastoral_care_notes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prayer_requests" ADD CONSTRAINT "prayer_requests_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_communications" ADD CONSTRAINT "member_communications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_communications" ADD CONSTRAINT "member_communications_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_communications" ADD CONSTRAINT "member_communications_contactedByUserId_fkey" FOREIGN KEY ("contactedByUserId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
