-- Blueprint 7.3A: database invariants for event check-in settings

-- Normalize any rows that violate dependent-flag rules before adding CHECKs
UPDATE "event_check_in_settings"
SET
  "allowSelfCheckIn" = CASE WHEN "checkInEnabled" THEN "allowSelfCheckIn" ELSE false END,
  "allowWalkIns" = CASE
    WHEN "checkInEnabled" AND NOT "requireRegistration" THEN "allowWalkIns"
    ELSE false
  END,
  "allowCheckOut" = CASE WHEN "checkInEnabled" THEN "allowCheckOut" ELSE false END,
  "allowReentry" = CASE
    WHEN "checkInEnabled" AND "allowCheckOut" THEN "allowReentry"
    ELSE false
  END;

DO $$ BEGIN
  ALTER TABLE "event_check_in_settings"
    ADD CONSTRAINT "event_check_in_settings_window_check"
    CHECK (
      "checkInClosesAt" IS NULL
      OR "checkInOpensAt" IS NULL
      OR "checkInClosesAt" > "checkInOpensAt"
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_check_in_settings"
    ADD CONSTRAINT "event_check_in_settings_flag_invariants_check"
    CHECK (
      (
        "checkInEnabled" = true
        OR (
          "allowSelfCheckIn" = false
          AND "allowWalkIns" = false
          AND "allowCheckOut" = false
          AND "allowReentry" = false
        )
      )
      AND ("allowCheckOut" = true OR "allowReentry" = false)
      AND ("requireRegistration" = false OR "allowWalkIns" = false)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
