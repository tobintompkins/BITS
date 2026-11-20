import sharp from "sharp";

export const MAX_HOMEPAGE_UPLOAD = 5 * 1024 * 1024;

export async function prepareHomepagePhoto(bytes: Uint8Array, description: string) {
  const alt = description.trim();
  if (!alt || alt.length > 200) throw new Error("Add a photo description of 1–200 characters.");
  if (!bytes.length || bytes.length > MAX_HOMEPAGE_UPLOAD) throw new Error("Choose a photo smaller than 5 MB.");
  const input = sharp(bytes, { limitInputPixels: 25_000_000, animated: false });
  const metadata = await input.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
    throw new Error("Choose a still JPEG, PNG, or WebP photo.");
  }
  // Re-encode to a bounded raster, stripping EXIF/location and other metadata.
  const image = await input.rotate().resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 }).toBuffer();
  if (image.length > 512 * 1024) throw new Error("This photo is too detailed. Please choose a smaller photo.");
  return { image: new Uint8Array(image), alt };
}
