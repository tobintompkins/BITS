CREATE TYPE "HouseholdRelationship" AS ENUM (
  'SELF',
  'SPOUSE',
  'CHILD',
  'PARENT',
  'GRANDPARENT',
  'SIBLING',
  'OTHER_RELATIVE',
  'ROOMMATE',
  'OTHER'
);

ALTER TABLE "member_households"
ALTER COLUMN "relationshipToHousehold" TYPE "HouseholdRelationship"
USING (
  CASE
    WHEN "relationshipToHousehold" IS NULL THEN NULL
    WHEN "relationshipToHousehold" IN (
      'SELF', 'SPOUSE', 'CHILD', 'PARENT', 'GRANDPARENT',
      'SIBLING', 'OTHER_RELATIVE', 'ROOMMATE', 'OTHER'
    ) THEN "relationshipToHousehold"::"HouseholdRelationship"
    ELSE 'OTHER'::"HouseholdRelationship"
  END
);
