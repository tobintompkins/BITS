CREATE TABLE "homepage_slideshow_photos" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "image" BYTEA NOT NULL,
  "alt" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "homepage_slideshow_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homepage_slideshow_photos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "homepage_slideshow_photos_image_size" CHECK (octet_length("image") <= 1572864)
);

CREATE INDEX "homepage_slideshow_photos_organizationId_sortOrder_idx" ON "homepage_slideshow_photos"("organizationId", "sortOrder");
