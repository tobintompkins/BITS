-- General weekly volunteer availability owned by a linked member.
CREATE TYPE "VolunteerWeekday" AS ENUM (
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY'
);

CREATE TABLE "member_volunteer_availability" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "weekday" "VolunteerWeekday" NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_volunteer_availability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_volunteer_availability_memberId_weekday_key"
  ON "member_volunteer_availability"("memberId", "weekday");

CREATE INDEX "member_volunteer_availability_organizationId_memberId_idx"
  ON "member_volunteer_availability"("organizationId", "memberId");

CREATE INDEX "member_volunteer_availability_organizationId_weekday_idx"
  ON "member_volunteer_availability"("organizationId", "weekday");

ALTER TABLE "member_volunteer_availability"
  ADD CONSTRAINT "member_volunteer_availability_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "member_volunteer_availability"
  ADD CONSTRAINT "member_volunteer_availability_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "members"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
