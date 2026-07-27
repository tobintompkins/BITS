-- CreateEnum
CREATE TYPE "EventRegistrationVisibility" AS ENUM ('PUBLIC', 'MEMBERS_ONLY', 'STAFF_ONLY');
CREATE TYPE "EventWaitlistPromotionMode" AS ENUM ('AUTOMATIC', 'STAFF_APPROVAL');
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED', 'CHECKED_IN', 'NO_SHOW', 'EXPIRED');
CREATE TYPE "EventAttendeeStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CONFIRMED', 'CANCELLED', 'CHECKED_IN', 'NO_SHOW');

-- CreateTable
CREATE TABLE "event_registration_settings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "EventRegistrationVisibility" NOT NULL DEFAULT 'PUBLIC',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "waitlistCapacity" INTEGER,
    "promotionMode" "EventWaitlistPromotionMode" NOT NULL DEFAULT 'AUTOMATIC',
    "maxAttendeesPerRegistration" INTEGER NOT NULL DEFAULT 1,
    "allowHouseholdRegistration" BOOLEAN NOT NULL DEFAULT true,
    "allowGuestRegistration" BOOLEAN NOT NULL DEFAULT true,
    "requireAuthentication" BOOLEAN NOT NULL DEFAULT false,
    "requireEmail" BOOLEAN NOT NULL DEFAULT true,
    "requirePhone" BOOLEAN NOT NULL DEFAULT false,
    "requireDateOfBirth" BOOLEAN NOT NULL DEFAULT false,
    "requireEmergencyContact" BOOLEAN NOT NULL DEFAULT false,
    "requireGuardianForMinors" BOOLEAN NOT NULL DEFAULT false,
    "allowCancellation" BOOLEAN NOT NULL DEFAULT true,
    "cancellationDeadline" TIMESTAMP(3),
    "confirmationMessage" TEXT,
    "instructions" TEXT,
    "checkInEnabled" BOOLEAN NOT NULL DEFAULT true,
    "qrCheckInEnabled" BOOLEAN NOT NULL DEFAULT false,
    "showCapacityPublicly" BOOLEAN NOT NULL DEFAULT true,
    "showWaitlistPublicly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_registration_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "confirmationCode" TEXT NOT NULL,
    "memberId" UUID,
    "householdId" UUID,
    "registeredByUserId" UUID,
    "primaryContactName" TEXT NOT NULL,
    "primaryContactEmail" TEXT,
    "primaryContactPhone" TEXT,
    "notes" TEXT,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "waitlistPosition" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_attendees" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "registrationId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "status" "EventAttendeeStatus" NOT NULL DEFAULT 'REGISTERED',
    "memberId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" DATE,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "isMinor" BOOLEAN NOT NULL DEFAULT false,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "waitlistPosition" INTEGER,
    "checkedInAt" TIMESTAMP(3),
    "checkedInByUserId" UUID,
    "checkInToken" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_attendees_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "event_registration_settings_eventId_key" ON "event_registration_settings"("eventId");
CREATE INDEX "event_registration_settings_organizationId_isEnabled_idx" ON "event_registration_settings"("organizationId", "isEnabled");

CREATE UNIQUE INDEX "event_registrations_organizationId_confirmationCode_key" ON "event_registrations"("organizationId", "confirmationCode");
CREATE INDEX "event_registrations_organizationId_eventId_status_idx" ON "event_registrations"("organizationId", "eventId", "status");
CREATE INDEX "event_registrations_eventId_waitlistPosition_idx" ON "event_registrations"("eventId", "waitlistPosition");
CREATE INDEX "event_registrations_memberId_idx" ON "event_registrations"("memberId");

CREATE UNIQUE INDEX "event_attendees_eventId_checkInToken_key" ON "event_attendees"("eventId", "checkInToken");
CREATE INDEX "event_attendees_organizationId_eventId_status_idx" ON "event_attendees"("organizationId", "eventId", "status");
CREATE INDEX "event_attendees_registrationId_idx" ON "event_attendees"("registrationId");
CREATE INDEX "event_attendees_memberId_idx" ON "event_attendees"("memberId");

-- Foreign keys
ALTER TABLE "event_registration_settings" ADD CONSTRAINT "event_registration_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registration_settings" ADD CONSTRAINT "event_registration_settings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "member_household_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_checkedInByUserId_fkey" FOREIGN KEY ("checkedInByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill settings from existing Event registration fields
INSERT INTO "event_registration_settings" (
  "id", "organizationId", "eventId", "isEnabled", "visibility", "opensAt", "closesAt",
  "capacity", "waitlistEnabled", "promotionMode", "maxAttendeesPerRegistration",
  "allowHouseholdRegistration", "allowGuestRegistration", "requireAuthentication",
  "requireEmail", "requirePhone", "requireDateOfBirth", "requireEmergencyContact",
  "requireGuardianForMinors", "allowCancellation", "confirmationMessage", "instructions",
  "checkInEnabled", "qrCheckInEnabled", "showCapacityPublicly", "showWaitlistPublicly",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  e."organizationId",
  e."id",
  e."registrationRequired",
  'PUBLIC'::"EventRegistrationVisibility",
  e."registrationOpenDate",
  e."registrationCloseDate",
  e."registrationCapacity",
  e."waitlistEnabled",
  'AUTOMATIC'::"EventWaitlistPromotionMode",
  1,
  true,
  true,
  false,
  true,
  false,
  false,
  false,
  false,
  true,
  NULL,
  e."registrationInstructions",
  true,
  false,
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "events" e
WHERE NOT EXISTS (
  SELECT 1 FROM "event_registration_settings" s WHERE s."eventId" = e."id"
);
