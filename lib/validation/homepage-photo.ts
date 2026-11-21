import sharp from "sharp";

export const MAX_HOMEPAGE_UPLOAD = 12 * 1024 * 1024;
export const MAX_HOMEPAGE_STORED = 1572864;

export async function prepareHomepagePhoto(bytes: Uint8Array, description: string) {
  const alt = description.trim();
  if (!alt || alt.length > 200) throw new Error("Add a photo description of 1–200 characters.");
  if (!bytes.length || bytes.length > MAX_HOMEPAGE_UPLOAD) throw new Error("Choose a photo smaller than 12 MB.");
  const input = sharp(bytes, { limitInputPixels: 48_000_000, animated: false });
  const metadata = await input.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
    throw new Error("Choose a still JPEG, PNG, or WebP photo.");
  }
  // Re-encode to a bounded raster, stripping EXIF/location and other metadata.
  const image = await input.rotate().resize({ width: 2000, height: 1500, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer();
  if (image.length > MAX_HOMEPAGE_STORED) throw new Error("This photo is too detailed. Please choose a smaller photo.");
  return { image: new Uint8Array(image), alt };
}
