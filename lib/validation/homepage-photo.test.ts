import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { MAX_HOMEPAGE_STORED, MAX_HOMEPAGE_UPLOAD, prepareHomepagePhoto } from "./homepage-photo";

describe("homepage photo upload", () => {
  it("normalizes raster data, bounds dimensions and strips metadata", async () => {
    const input = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "navy" } }).jpeg().withMetadata().toBuffer();
    const result = await prepareHomepagePhoto(input, " Church family ");
    const metadata = await sharp(result.image).metadata();
    expect(result.alt).toBe("Church family");
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(2000);
    expect(metadata.exif).toBeUndefined();
    expect(result.image.length).toBeLessThanOrEqual(MAX_HOMEPAGE_STORED);
  });
  it("rejects SVG even when it can be decoded", async () => {
    await expect(prepareHomepagePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), "Test")).rejects.toThrow();
  });
  it("rejects malformed or oversized uploads and missing descriptions", async () => {
    await expect(prepareHomepagePhoto(Buffer.from("not a picture"), "Test")).rejects.toThrow();
    await expect(prepareHomepagePhoto(new Uint8Array(MAX_HOMEPAGE_UPLOAD + 1), "Test")).rejects.toThrow();
    await expect(prepareHomepagePhoto(new Uint8Array(2), " ")).rejects.toThrow();
  });
});
