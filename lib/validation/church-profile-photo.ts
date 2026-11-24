import sharp from "sharp";

export const MAX_CHURCH_PROFILE_UPLOAD = 5 * 1024 * 1024;
export const MAX_CHURCH_PROFILE_STORED = 400 * 1024;

export async function prepareChurchProfilePhoto(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_CHURCH_PROFILE_UPLOAD) {
    throw new Error("Choose a photo smaller than 5 MB.");
  }
  const input = sharp(bytes, { limitInputPixels: 48_000_000, animated: false });
  const metadata = await input.metadata().catch(() => null);
  if (!metadata) throw new Error("Choose a still JPEG, PNG, or WebP photo.");
  if (
    !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
    (metadata.pages ?? 1) > 1
  ) {
    throw new Error("Choose a still JPEG, PNG, or WebP photo.");
  }
  const image = await input
    .rotate()
    .resize({ width: 512, height: 512, fit: "cover", position: "centre" })
    .webp({ quality: 80 })
    .toBuffer();
  if (image.length > MAX_CHURCH_PROFILE_STORED) {
    throw new Error("This photo is too detailed. Please choose a smaller photo.");
  }
  return { image: new Uint8Array(image), contentType: "image/webp" };
}
