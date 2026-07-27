-- Blueprint 7.3M: tenant+event-aware station attribution constraints/indexes.
-- stationId columns already exist from 7.3 ops; historical rows remain NULL.

-- Unique target for composite FKs (id is already PK; this scopes by tenant+event).
CREATE UNIQUE INDEX IF NOT EXISTS "event_check_in_stations_organizationId_eventId_id_key"
  ON "event_check_in_stations"("organizationId", "eventId", "id");

-- Index for station activity/history queries on append-only actions.
CREATE INDEX IF NOT EXISTS "event_attendance_actions_organizationId_eventId_stationId_occurredAt_idx"
  ON "event_attendance_actions"("organizationId", "eventId", "stationId", "occurredAt");

-- Replace single-column station FKs with tenant+event composite FKs.
ALTER TABLE "event_attendance_records"
  DROP CONSTRAINT IF EXISTS "event_attendance_records_stationId_fkey";

ALTER TABLE "event_attendance_actions"
  DROP CONSTRAINT IF EXISTS "event_attendance_actions_stationId_fkey";

DO $$
BEGIN
  ALTER TABLE "event_attendance_records"
    ADD CONSTRAINT "event_attendance_records_organizationId_eventId_stationId_fkey"
    FOREIGN KEY ("organizationId", "eventId", "stationId")
    REFERENCES "event_check_in_stations"("organizationId", "eventId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "event_attendance_actions"
    ADD CONSTRAINT "event_attendance_actions_organizationId_eventId_stationId_fkey"
    FOREIGN KEY ("organizationId", "eventId", "stationId")
    REFERENCES "event_check_in_stations"("organizationId", "eventId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
