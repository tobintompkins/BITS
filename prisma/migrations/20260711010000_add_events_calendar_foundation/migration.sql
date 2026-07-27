-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'MEMBERS_ONLY', 'STAFF_ONLY', 'PRIVATE');
CREATE TYPE "EventOrganizerRole" AS ENUM ('PRIMARY_CONTACT', 'HOST', 'COORDINATOR', 'PASTOR', 'MINISTRY_LEADER', 'VOLUNTEER_LEAD', 'OTHER');

-- CreateTable
CREATE TABLE "event_categories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_locations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT DEFAULT 'US',
    "roomName" TEXT,
    "capacity" INTEGER,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "onlineMeetingUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "categoryId" UUID,
    "locationId" UUID,
    "eventStatus" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'STAFF_ONLY',
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "registrationRequired" BOOLEAN NOT NULL DEFAULT false,
    "registrationOpenDate" TIMESTAMP(3),
    "registrationCloseDate" TIMESTAMP(3),
    "registrationCapacity" INTEGER,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "registrationFee" DECIMAL(10,2),
    "registrationInstructions" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "featuredImageUrl" TEXT,
    "featuredImageKey" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "recurrenceEndDate" TIMESTAMP(3),
    "parentEventId" UUID,
    "createdByUserId" UUID NOT NULL,
    "updatedByUserId" UUID,
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_organizers" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID,
    "memberId" UUID,
    "organizerName" TEXT,
    "organizerEmail" TEXT,
    "organizerPhone" TEXT,
    "role" "EventOrganizerRole" NOT NULL DEFAULT 'OTHER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_organizers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_ministries" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "ministryId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_ministries_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "event_categories_organizationId_name_key" ON "event_categories"("organizationId", "name");
CREATE INDEX "event_categories_organizationId_isActive_idx" ON "event_categories"("organizationId", "isActive");

CREATE UNIQUE INDEX "event_locations_organizationId_name_key" ON "event_locations"("organizationId", "name");
CREATE INDEX "event_locations_organizationId_isActive_idx" ON "event_locations"("organizationId", "isActive");

CREATE UNIQUE INDEX "events_organizationId_slug_key" ON "events"("organizationId", "slug");
CREATE INDEX "events_organizationId_eventStatus_idx" ON "events"("organizationId", "eventStatus");
CREATE INDEX "events_organizationId_visibility_idx" ON "events"("organizationId", "visibility");
CREATE INDEX "events_organizationId_startDateTime_idx" ON "events"("organizationId", "startDateTime");
CREATE INDEX "events_organizationId_endDateTime_idx" ON "events"("organizationId", "endDateTime");
CREATE INDEX "events_categoryId_idx" ON "events"("categoryId");
CREATE INDEX "events_locationId_idx" ON "events"("locationId");
CREATE INDEX "events_parentEventId_idx" ON "events"("parentEventId");

CREATE INDEX "event_organizers_eventId_idx" ON "event_organizers"("eventId");
CREATE INDEX "event_organizers_userId_idx" ON "event_organizers"("userId");
CREATE INDEX "event_organizers_memberId_idx" ON "event_organizers"("memberId");

CREATE UNIQUE INDEX "event_ministries_eventId_ministryId_key" ON "event_ministries"("eventId", "ministryId");
CREATE INDEX "event_ministries_ministryId_idx" ON "event_ministries"("ministryId");

CREATE INDEX "member_attendances_eventId_idx" ON "member_attendances"("eventId");

-- Convert legacy text eventId to UUID before adding FK (safe: null or valid UUID text only)
ALTER TABLE "member_attendances"
  ALTER COLUMN "eventId" TYPE UUID USING (
    CASE
      WHEN "eventId" IS NULL OR btrim("eventId") = '' THEN NULL
      ELSE "eventId"::uuid
    END
  );

-- Foreign keys
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_locations" ADD CONSTRAINT "event_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events" ADD CONSTRAINT "events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "event_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "event_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_parentEventId_fkey" FOREIGN KEY ("parentEventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_organizers" ADD CONSTRAINT "event_organizers_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_organizers" ADD CONSTRAINT "event_organizers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_organizers" ADD CONSTRAINT "event_organizers_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_ministries" ADD CONSTRAINT "event_ministries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_ministries" ADD CONSTRAINT "event_ministries_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "ministries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "member_attendances" ADD CONSTRAINT "member_attendances_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
