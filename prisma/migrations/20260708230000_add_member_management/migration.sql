-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM (
  'VISITOR',
  'REGULAR_ATTENDER',
  'MEMBER',
  'INACTIVE',
  'TRANSFERRED',
  'DECEASED'
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "suffix" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "alternatePhone" TEXT,
    "dateOfBirth" DATE,
    "gender" TEXT,
    "maritalStatus" TEXT,
    "membershipStatus" "MembershipStatus" NOT NULL DEFAULT 'VISITOR',
    "memberSince" DATE,
    "baptismDate" DATE,
    "salvationDate" DATE,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'US',
    "profilePhotoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_household_units" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "householdName" TEXT NOT NULL,
    "primaryContactId" UUID,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT DEFAULT 'US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_household_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_households" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "relationshipToHousehold" TEXT,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_households_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "members_organizationId_idx" ON "members"("organizationId");
CREATE INDEX "members_organizationId_membershipStatus_idx" ON "members"("organizationId", "membershipStatus");
CREATE INDEX "members_organizationId_lastName_firstName_idx" ON "members"("organizationId", "lastName", "firstName");

CREATE INDEX "member_household_units_organizationId_idx" ON "member_household_units"("organizationId");

CREATE UNIQUE INDEX "member_households_memberId_householdId_key" ON "member_households"("memberId", "householdId");
CREATE INDEX "member_households_organizationId_idx" ON "member_households"("organizationId");
CREATE INDEX "member_households_householdId_idx" ON "member_households"("householdId");
CREATE INDEX "member_households_memberId_idx" ON "member_households"("memberId");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_household_units" ADD CONSTRAINT "member_household_units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_household_units" ADD CONSTRAINT "member_household_units_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "member_households" ADD CONSTRAINT "member_households_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_households" ADD CONSTRAINT "member_households_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "member_households" ADD CONSTRAINT "member_households_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "member_household_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
