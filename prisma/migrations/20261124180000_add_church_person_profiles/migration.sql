CREATE TYPE "ChurchTeam" AS ENUM ('LEADERSHIP', 'BOARD', 'MUSIC');

CREATE TYPE "ChurchProfilePublication" AS ENUM ('HIDDEN', 'PUBLISHED');

CREATE TABLE "church_person_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "rosterKey" TEXT NOT NULL,
    "officialName" TEXT NOT NULL,
    "preferredName" TEXT,
    "aboutMe" TEXT,
    "familyIntroduction" TEXT,
    "serviceDescription" TEXT,
    "photo" BYTEA,
    "photoContentType" TEXT,
    "shareWithMembers" BOOLEAN NOT NULL DEFAULT false,
    "photoShareWithMembers" BOOLEAN NOT NULL DEFAULT false,
    "publicConsent" BOOLEAN NOT NULL DEFAULT false,
    "photoPublicConsent" BOOLEAN NOT NULL DEFAULT false,
    "publication" "ChurchProfilePublication" NOT NULL DEFAULT 'HIDDEN',
    "linkedUserAccountId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "church_person_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "church_team_assignments" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "team" "ChurchTeam" NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "church_team_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "church_person_profiles_organizationId_rosterKey_key" ON "church_person_profiles"("organizationId", "rosterKey");

CREATE UNIQUE INDEX "church_person_profiles_organizationId_linkedUserAccountId_key" ON "church_person_profiles"("organizationId", "linkedUserAccountId");

CREATE INDEX "church_person_profiles_organizationId_publication_idx" ON "church_person_profiles"("organizationId", "publication");

CREATE UNIQUE INDEX "church_team_assignments_profileId_team_key" ON "church_team_assignments"("profileId", "team");

CREATE INDEX "church_team_assignments_profileId_idx" ON "church_team_assignments"("profileId");

ALTER TABLE "church_person_profiles" ADD CONSTRAINT "church_person_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "church_person_profiles" ADD CONSTRAINT "church_person_profiles_linkedUserAccountId_fkey" FOREIGN KEY ("linkedUserAccountId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "church_team_assignments" ADD CONSTRAINT "church_team_assignments_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "church_person_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
