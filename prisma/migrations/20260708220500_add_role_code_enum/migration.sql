DO $$
BEGIN
  CREATE TYPE "RoleCode" AS ENUM (
    'ORG_ADMIN',
    'TREASURER',
    'DATA_ENTRY',
    'REPORT_VIEWER',
    'DONOR'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "role_types"
ALTER COLUMN "code" TYPE "RoleCode"
USING "code"::"RoleCode";
