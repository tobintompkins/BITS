ALTER TABLE "homepage_photos" DROP CONSTRAINT "homepage_photos_image_size";
ALTER TABLE "homepage_photos" ADD CONSTRAINT "homepage_photos_image_size" CHECK (octet_length("image") <= 1572864);
