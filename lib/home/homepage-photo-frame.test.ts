import { describe, expect, it } from "vitest";

import {
  HOMEPAGE_PHOTO_ASPECT,
  homepagePhotoDisplay,
  homepagePhotoWindow,
  initialHomepagePhotoFrame,
  panHomepagePhoto,
} from "./homepage-photo-frame";

describe("homepage photo frame", () => {
  it("starts centered and shows as much of a wide photo as the frame allows", () => {
    const frame = initialHomepagePhotoFrame(2000, 1000);
    const window = homepagePhotoWindow(2000, 1000, frame);
    expect(window.zoom).toBe(1);
    expect(window.height).toBe(1000);
    expect(window.width).toBeCloseTo(1000 * HOMEPAGE_PHOTO_ASPECT);
    expect(window.x).toBeGreaterThan(0);
    expect(window.x + window.width).toBeLessThanOrEqual(2000);
    expect(window.centerX).toBeCloseTo(1000);
  });

  it("starts centered and shows as much of a tall photo as the frame allows", () => {
    const window = homepagePhotoWindow(900, 1600, initialHomepagePhotoFrame(900, 1600));
    expect(window.width).toBe(900);
    expect(window.height).toBeCloseTo(900 / HOMEPAGE_PHOTO_ASPECT);
    expect(window.y).toBeGreaterThan(0);
    expect(window.y + window.height).toBeLessThanOrEqual(1600);
  });

  it("crops closer without leaving the photo", () => {
    const closer = homepagePhotoWindow(2000, 1000, { zoom: 2, centerX: 1000, centerY: 500 });
    const fitted = homepagePhotoWindow(2000, 1000, initialHomepagePhotoFrame(2000, 1000));
    expect(closer.width).toBeCloseTo(fitted.width / 2);
    expect(closer.height).toBeCloseTo(fitted.height / 2);
    expect(closer.x).toBeGreaterThanOrEqual(0);
    expect(closer.y).toBeGreaterThanOrEqual(0);
    expect(closer.x + closer.width).toBeLessThanOrEqual(2000);
    expect(closer.y + closer.height).toBeLessThanOrEqual(1000);
  });

  it("keeps a dragged photo covering the frame", () => {
    const start = initialHomepagePhotoFrame(2000, 1000);
    const moved = panHomepagePhoto(2000, 1000, 320, 180, start, 5000, 5000);
    const window = homepagePhotoWindow(2000, 1000, moved);
    expect(window.x).toBeCloseTo(0);
    expect(window.y).toBeCloseTo(0);
    const display = homepagePhotoDisplay(2000, 1000, 320, 180, moved);
    expect(display.x).toBeLessThanOrEqual(0);
    expect(display.y).toBeLessThanOrEqual(0);
    expect(display.x + display.width).toBeGreaterThanOrEqual(320);
    expect(display.y + display.height).toBeGreaterThanOrEqual(180);
  });

  it("maps an already matching photo onto the whole frame", () => {
    const display = homepagePhotoDisplay(1600, 900, 320, 180, initialHomepagePhotoFrame(1600, 900));
    expect(display.x).toBeCloseTo(0);
    expect(display.y).toBeCloseTo(0);
    expect(display.width).toBeCloseTo(320);
    expect(display.height).toBeCloseTo(180);
  });
});
