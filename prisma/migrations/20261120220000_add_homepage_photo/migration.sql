CREATE TABLE "homepage_photos" (
  "organizationId" UUID NOT NULL PRIMARY KEY,
  "image" BYTEA NOT NULL,
  "alt" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "homepage_photos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "homepage_photos_image_size" CHECK (octet_length("image") <= 524288)
);
