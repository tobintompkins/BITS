-- Fail loudly if more than one open giving-household membership exists for a
-- donor in the same church. Do not delete or auto-repair historical rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM household_memberships
    WHERE "endDate" IS NULL
    GROUP BY "organizationId", "donorId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add household_memberships_one_open_per_donor: duplicate open memberships exist. Review household_memberships grouped by organizationId and donorId where endDate is null.';
  END IF;
END $$;

CREATE UNIQUE INDEX "household_memberships_one_open_per_donor"
ON "household_memberships" ("organizationId", "donorId")
WHERE "endDate" IS NULL;
