-- Blueprint 7.3B: harden attendance foundation constraints
-- Expected-attendance rows are created lazily by later services/tests; no backfill.

-- Allow null source until a check-in/correction action occurs
ALTER TABLE "event_attendance_records"
  ALTER COLUMN "source" DROP NOT NULL;

ALTER TABLE "event_attendance_records"
  ALTER COLUMN "source" DROP DEFAULT;

-- Prefer tenant-scoped uniqueness for attendee attendance
DROP INDEX IF EXISTS "event_attendance_records_eventId_attendeeId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "event_attendance_records_organizationId_eventId_attendeeId_key"
  ON "event_attendance_records"("organizationId", "eventId", "attendeeId");

DO $$ BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_check_in_count_nonnegative"
    CHECK ("checkInCount" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
