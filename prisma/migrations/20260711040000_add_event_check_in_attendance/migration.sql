-- Blueprint 7.3: event check-in settings, stations, attendance, QR passes

DO $$ BEGIN
  CREATE TYPE "EventCheckInStationStatus" AS ENUM ('ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventAttendanceStatus" AS ENUM ('EXPECTED', 'PRESENT', 'CHECKED_OUT', 'NO_SHOW', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventAttendanceSource" AS ENUM ('STAFF_SEARCH', 'STAFF_QR', 'SELF_QR', 'WALK_IN', 'IMPORT', 'ADMIN_CORRECTION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EventAttendanceActionType" AS ENUM ('CHECKED_IN', 'CHECKED_OUT', 'REENTERED', 'MARKED_NO_SHOW', 'UNDO_CHECK_IN', 'STATUS_CORRECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "event_check_in_settings" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "checkInEnabled" BOOLEAN NOT NULL DEFAULT false,
  "checkInOpensAt" TIMESTAMP(3),
  "checkInClosesAt" TIMESTAMP(3),
  "allowSelfCheckIn" BOOLEAN NOT NULL DEFAULT false,
  "allowWalkIns" BOOLEAN NOT NULL DEFAULT false,
  "allowCheckOut" BOOLEAN NOT NULL DEFAULT false,
  "allowReentry" BOOLEAN NOT NULL DEFAULT false,
  "requireRegistration" BOOLEAN NOT NULL DEFAULT true,
  "qrPassEnabled" BOOLEAN NOT NULL DEFAULT true,
  "stationNameRequired" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_check_in_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_check_in_settings_eventId_key" ON "event_check_in_settings"("eventId");
CREATE INDEX IF NOT EXISTS "event_check_in_settings_organizationId_checkInEnabled_idx"
  ON "event_check_in_settings"("organizationId", "checkInEnabled");

DO $$ BEGIN
  ALTER TABLE "event_check_in_settings"
    ADD CONSTRAINT "event_check_in_settings_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_check_in_settings"
    ADD CONSTRAINT "event_check_in_settings_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "event_check_in_stations" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" "EventCheckInStationStatus" NOT NULL DEFAULT 'ACTIVE',
  "deviceLabel" TEXT,
  "openedByUserId" UUID NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedByUserId" UUID,
  "closedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_check_in_stations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "event_check_in_stations_organizationId_eventId_status_idx"
  ON "event_check_in_stations"("organizationId", "eventId", "status");

DO $$ BEGIN
  ALTER TABLE "event_check_in_stations"
    ADD CONSTRAINT "event_check_in_stations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_check_in_stations"
    ADD CONSTRAINT "event_check_in_stations_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_check_in_stations"
    ADD CONSTRAINT "event_check_in_stations_openedByUserId_fkey"
    FOREIGN KEY ("openedByUserId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_check_in_stations"
    ADD CONSTRAINT "event_check_in_stations_closedByUserId_fkey"
    FOREIGN KEY ("closedByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "event_attendance_records" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "registrationId" UUID,
  "attendeeId" UUID,
  "memberId" UUID,
  "status" "EventAttendanceStatus" NOT NULL DEFAULT 'EXPECTED',
  "source" "EventAttendanceSource" NOT NULL DEFAULT 'STAFF_SEARCH',
  "firstCheckedInAt" TIMESTAMP(3),
  "lastCheckedInAt" TIMESTAMP(3),
  "checkedOutAt" TIMESTAMP(3),
  "checkInCount" INTEGER NOT NULL DEFAULT 0,
  "stationId" UUID,
  "checkedInByUserId" UUID,
  "checkedOutByUserId" UUID,
  "walkInFirstName" TEXT,
  "walkInLastName" TEXT,
  "walkInEmail" TEXT,
  "walkInPhone" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_attendance_records_eventId_attendeeId_key"
  ON "event_attendance_records"("eventId", "attendeeId");
CREATE INDEX IF NOT EXISTS "event_attendance_records_organizationId_eventId_status_idx"
  ON "event_attendance_records"("organizationId", "eventId", "status");
CREATE INDEX IF NOT EXISTS "event_attendance_records_organizationId_eventId_memberId_idx"
  ON "event_attendance_records"("organizationId", "eventId", "memberId");
CREATE INDEX IF NOT EXISTS "event_attendance_records_organizationId_eventId_registrationId_idx"
  ON "event_attendance_records"("organizationId", "eventId", "registrationId");
CREATE INDEX IF NOT EXISTS "event_attendance_records_organizationId_eventId_stationId_idx"
  ON "event_attendance_records"("organizationId", "eventId", "stationId");
CREATE INDEX IF NOT EXISTS "event_attendance_records_organizationId_eventId_lastCheckedInAt_idx"
  ON "event_attendance_records"("organizationId", "eventId", "lastCheckedInAt");
CREATE INDEX IF NOT EXISTS "event_attendance_records_organizationId_eventId_walkInLastName_walkInFirstName_idx"
  ON "event_attendance_records"("organizationId", "eventId", "walkInLastName", "walkInFirstName");

DO $$ BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_attendeeId_fkey"
    FOREIGN KEY ("attendeeId") REFERENCES "event_attendees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_stationId_fkey"
    FOREIGN KEY ("stationId") REFERENCES "event_check_in_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_checkedInByUserId_fkey"
    FOREIGN KEY ("checkedInByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_checkedOutByUserId_fkey"
    FOREIGN KEY ("checkedOutByUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "event_attendance_actions" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "attendanceId" UUID NOT NULL,
  "action" "EventAttendanceActionType" NOT NULL,
  "source" "EventAttendanceSource" NOT NULL,
  "stationId" UUID,
  "actorUserId" UUID,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_attendance_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "event_attendance_actions_organizationId_eventId_occurredAt_idx"
  ON "event_attendance_actions"("organizationId", "eventId", "occurredAt");
CREATE INDEX IF NOT EXISTS "event_attendance_actions_attendanceId_occurredAt_idx"
  ON "event_attendance_actions"("attendanceId", "occurredAt");

DO $$ BEGIN
  ALTER TABLE "event_attendance_actions"
    ADD CONSTRAINT "event_attendance_actions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_actions"
    ADD CONSTRAINT "event_attendance_actions_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_actions"
    ADD CONSTRAINT "event_attendance_actions_attendanceId_fkey"
    FOREIGN KEY ("attendanceId") REFERENCES "event_attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_actions"
    ADD CONSTRAINT "event_attendance_actions_stationId_fkey"
    FOREIGN KEY ("stationId") REFERENCES "event_check_in_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_attendance_actions"
    ADD CONSTRAINT "event_attendance_actions_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "event_qr_passes" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "attendeeId" UUID,
  "tokenHash" TEXT NOT NULL,
  "fallbackCode" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'EVENT_CHECK_IN',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_qr_passes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "event_qr_passes_organizationId_tokenHash_idx"
  ON "event_qr_passes"("organizationId", "tokenHash");
CREATE INDEX IF NOT EXISTS "event_qr_passes_organizationId_fallbackCode_idx"
  ON "event_qr_passes"("organizationId", "fallbackCode");
CREATE INDEX IF NOT EXISTS "event_qr_passes_registrationId_idx" ON "event_qr_passes"("registrationId");
CREATE INDEX IF NOT EXISTS "event_qr_passes_eventId_revokedAt_expiresAt_idx"
  ON "event_qr_passes"("eventId", "revokedAt", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "event_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_qr_passes"
    ADD CONSTRAINT "event_qr_passes_attendeeId_fkey"
    FOREIGN KEY ("attendeeId") REFERENCES "event_attendees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "event_check_in_idempotency" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "operationKey" TEXT NOT NULL,
  "attendanceId" UUID,
  "resultSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_check_in_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_check_in_idempotency_organizationId_eventId_operationKey_key"
  ON "event_check_in_idempotency"("organizationId", "eventId", "operationKey");
CREATE INDEX IF NOT EXISTS "event_check_in_idempotency_eventId_createdAt_idx"
  ON "event_check_in_idempotency"("eventId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "event_check_in_idempotency"
    ADD CONSTRAINT "event_check_in_idempotency_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_check_in_idempotency"
    ADD CONSTRAINT "event_check_in_idempotency_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing events get disabled check-in settings (safe default)
INSERT INTO "event_check_in_settings" (
  "id", "organizationId", "eventId", "checkInEnabled", "qrPassEnabled",
  "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), e."organizationId", e."id", false, true, NOW(), NOW()
FROM "events" e
WHERE NOT EXISTS (
  SELECT 1 FROM "event_check_in_settings" s WHERE s."eventId" = e."id"
);
