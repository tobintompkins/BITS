-- CreateEnum
CREATE TYPE "MembershipMilestoneType" AS ENUM (
  'SALVATION',
  'BAPTISM',
  'MEMBERSHIP',
  'BABY_DEDICATION',
  'CHILD_DEDICATION',
  'MARRIAGE',
  'ORDINATION',
  'LICENSED_MINISTRY',
  'FIRST_VISIT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'DECEASED',
  'OTHER'
);

CREATE TYPE "GiftProficiencyLevel" AS ENUM (
  'DISCOVERING',
  'DEVELOPING',
  'CONFIDENT',
  'STRONG',
  'MENTOR'
);

CREATE TYPE "MinistryType" AS ENUM (
  'WORSHIP',
  'CHILDREN',
  'YOUTH',
  'OUTREACH',
  'HOSPITALITY',
  'PRAYER',
  'DISCIPLESHIP',
  'MISSIONS',
  'MEDIA',
  'TECHNOLOGY',
  'ADMINISTRATION',
  'PASTORAL_CARE',
  'SECURITY',
  'FACILITIES',
  'TRANSPORTATION',
  'OTHER'
);

CREATE TYPE "MemberMinistryRole" AS ENUM (
  'PARTICIPANT',
  'VOLUNTEER',
  'TEAM_MEMBER',
  'TEAM_LEAD',
  'COORDINATOR',
  'DIRECTOR',
  'PASTOR',
  'OTHER'
);

CREATE TYPE "MemberMinistryStatus" AS ENUM (
  'INTERESTED',
  'ACTIVE',
  'PAUSED',
  'INACTIVE',
  'COMPLETED'
);

CREATE TYPE "SkillProficiencyLevel" AS ENUM (
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
  'EXPERT'
);

CREATE TYPE "MemberDocumentType" AS ENUM (
  'BAPTISM_CERTIFICATE',
  'MEMBERSHIP_FORM',
  'BACKGROUND_CHECK',
  'VOLUNTEER_APPLICATION',
  'TRAINING_CERTIFICATE',
  'PASTORAL_DOCUMENT',
  'MEDICAL_FORM',
  'PERMISSION_FORM',
  'IDENTIFICATION',
  'MARRIAGE_CERTIFICATE',
  'ORDINATION_DOCUMENT',
  'OTHER'
);

-- CreateTable
CREATE TABLE "member_milestones" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "milestoneType" "MembershipMilestoneType" NOT NULL,
    "title" TEXT NOT NULL,
    "milestoneDate" DATE NOT NULL,
    "location" TEXT,
    "officiant" TEXT,
    "certificateNumber" TEXT,
    "notes" TEXT,
    "documentUrl" TEXT,
    "documentKey" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_milestones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spiritual_gifts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spiritual_gifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_spiritual_gifts" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "spiritualGiftId" UUID NOT NULL,
    "proficiencyLevel" "GiftProficiencyLevel" NOT NULL DEFAULT 'DISCOVERING',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "identifiedDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_spiritual_gifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ministries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ministryType" "MinistryType" NOT NULL,
    "leaderUserId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "meetingSchedule" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ministries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_ministries" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "ministryId" UUID NOT NULL,
    "role" "MemberMinistryRole" NOT NULL DEFAULT 'VOLUNTEER',
    "status" "MemberMinistryStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedDate" DATE,
    "endedDate" DATE,
    "notes" TEXT,
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_ministries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_skills" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "skillName" TEXT NOT NULL,
    "skillCategory" TEXT,
    "proficiencyLevel" "SkillProficiencyLevel" NOT NULL DEFAULT 'BEGINNER',
    "yearsExperience" INTEGER,
    "isAvailableToServe" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_skills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_interests" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "interestName" TEXT NOT NULL,
    "interestCategory" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_interests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "member_documents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "documentType" "MemberDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "expirationDate" DATE,
    "uploadedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "member_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_milestones_organizationId_milestoneType_idx" ON "member_milestones"("organizationId", "milestoneType");
CREATE INDEX "member_milestones_memberId_milestoneDate_idx" ON "member_milestones"("memberId", "milestoneDate");

CREATE UNIQUE INDEX "spiritual_gifts_organizationId_name_key" ON "spiritual_gifts"("organizationId", "name");
CREATE INDEX "spiritual_gifts_organizationId_isActive_idx" ON "spiritual_gifts"("organizationId", "isActive");

CREATE UNIQUE INDEX "member_spiritual_gifts_memberId_spiritualGiftId_key" ON "member_spiritual_gifts"("memberId", "spiritualGiftId");
CREATE INDEX "member_spiritual_gifts_spiritualGiftId_idx" ON "member_spiritual_gifts"("spiritualGiftId");

CREATE UNIQUE INDEX "ministries_organizationId_name_key" ON "ministries"("organizationId", "name");
CREATE INDEX "ministries_organizationId_ministryType_idx" ON "ministries"("organizationId", "ministryType");
CREATE INDEX "ministries_organizationId_isActive_idx" ON "ministries"("organizationId", "isActive");

CREATE UNIQUE INDEX "member_ministries_memberId_ministryId_key" ON "member_ministries"("memberId", "ministryId");
CREATE INDEX "member_ministries_ministryId_status_idx" ON "member_ministries"("ministryId", "status");

CREATE INDEX "member_skills_memberId_idx" ON "member_skills"("memberId");
CREATE INDEX "member_skills_skillName_idx" ON "member_skills"("skillName");

CREATE INDEX "member_interests_memberId_idx" ON "member_interests"("memberId");

CREATE INDEX "member_documents_organizationId_documentType_idx" ON "member_documents"("organizationId", "documentType");
CREATE INDEX "member_documents_memberId_idx" ON "member_documents"("memberId");
CREATE INDEX "member_documents_expirationDate_idx" ON "member_documents"("expirationDate");

-- AddForeignKey
ALTER TABLE "member_milestones" ADD CONSTRAINT "member_milestones_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_milestones" ADD CONSTRAINT "member_milestones_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_milestones" ADD CONSTRAINT "member_milestones_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "spiritual_gifts" ADD CONSTRAINT "spiritual_gifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_spiritual_gifts" ADD CONSTRAINT "member_spiritual_gifts_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_spiritual_gifts" ADD CONSTRAINT "member_spiritual_gifts_spiritualGiftId_fkey" FOREIGN KEY ("spiritualGiftId") REFERENCES "spiritual_gifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ministries" ADD CONSTRAINT "ministries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ministries" ADD CONSTRAINT "ministries_leaderUserId_fkey" FOREIGN KEY ("leaderUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "member_ministries" ADD CONSTRAINT "member_ministries_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_ministries" ADD CONSTRAINT "member_ministries_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_skills" ADD CONSTRAINT "member_skills_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_interests" ADD CONSTRAINT "member_interests_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_documents" ADD CONSTRAINT "member_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_documents" ADD CONSTRAINT "member_documents_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "member_documents" ADD CONSTRAINT "member_documents_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
