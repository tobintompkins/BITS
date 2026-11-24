import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  MAX_CHURCH_PROFILE_UPLOAD,
  prepareChurchProfilePhoto,
} from "@/lib/validation/church-profile-photo";

describe("church profile photo", () => {
  it("stores a square image without location metadata", async () => {
    const input = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "navy" },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { ImageDescription: "home" } } })
      .toBuffer();
    const result = await prepareChurchProfilePhoto(input);
    const metadata = await sharp(result.image).metadata();
    expect(result.contentType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects a file that is not a still photo", async () => {
    await expect(
      prepareChurchProfilePhoto(Buffer.from("not-a-photo")),
    ).rejects.toThrow(/JPEG, PNG, or WebP/);
    await expect(
      prepareChurchProfilePhoto(new Uint8Array(MAX_CHURCH_PROFILE_UPLOAD + 1)),
    ).rejects.toThrow(/5 MB/);
  });
});
