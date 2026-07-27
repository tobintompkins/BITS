-- Blueprint 7.3I: harden EventCheckInStation foundation constraints/indexes.
-- Reuses existing event_check_in_stations from Blueprint 7.3 ops; no backfill of new stations.

-- Normalized name for case-insensitive ACTIVE uniqueness + stable listing
ALTER TABLE "event_check_in_stations"
  ADD COLUMN IF NOT EXISTS "nameNormalized" VARCHAR(80);

UPDATE "event_check_in_stations"
SET "nameNormalized" = lower(btrim("name"))
WHERE "nameNormalized" IS NULL OR "nameNormalized" = '';

-- Bound name / deviceLabel lengths to match validation conventions
ALTER TABLE "event_check_in_stations"
  ALTER COLUMN "name" TYPE VARCHAR(80),
  ALTER COLUMN "deviceLabel" TYPE VARCHAR(80);

ALTER TABLE "event_check_in_stations"
  ALTER COLUMN "nameNormalized" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "event_check_in_stations"
    ADD CONSTRAINT "event_check_in_stations_status_close_fields_check"
    CHECK (
      (
        "status" = 'ACTIVE'
        AND "closedAt" IS NULL
        AND "closedByUserId" IS NULL
      )
      OR (
        "status" = 'CLOSED'
        AND "closedAt" IS NOT NULL
        AND "closedByUserId" IS NOT NULL
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_check_in_stations"
    ADD CONSTRAINT "event_check_in_stations_closed_after_opened_check"
    CHECK ("closedAt" IS NULL OR "closedAt" >= "openedAt");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_check_in_stations"
    ADD CONSTRAINT "event_check_in_stations_activity_after_opened_check"
    CHECK ("lastActivityAt" IS NULL OR "lastActivityAt" >= "openedAt");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_check_in_stations"
    ADD CONSTRAINT "event_check_in_stations_name_length_check"
    CHECK (char_length(btrim("name")) >= 1 AND char_length("name") <= 80);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_check_in_stations"
    ADD CONSTRAINT "event_check_in_stations_device_label_length_check"
    CHECK ("deviceLabel" IS NULL OR char_length("deviceLabel") <= 80);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Case-normalized uniqueness among ACTIVE stations only (closed names may be reused)
CREATE UNIQUE INDEX IF NOT EXISTS "event_check_in_stations_active_name_key"
  ON "event_check_in_stations"("organizationId", "eventId", "nameNormalized")
  WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "event_check_in_stations_organizationId_eventId_nameNormalized_idx"
  ON "event_check_in_stations"("organizationId", "eventId", "nameNormalized");

CREATE INDEX IF NOT EXISTS "event_check_in_stations_organizationId_openedByUserId_idx"
  ON "event_check_in_stations"("organizationId", "openedByUserId");

CREATE INDEX IF NOT EXISTS "event_check_in_stations_active_by_event_idx"
  ON "event_check_in_stations"("organizationId", "eventId")
  WHERE "status" = 'ACTIVE';
