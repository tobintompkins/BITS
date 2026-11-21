export const HOMEPAGE_PHOTO_ASPECT = 16 / 9;
export const HOMEPAGE_PHOTO_EXPORT_WIDTH = 2000;
export const HOMEPAGE_PHOTO_EXPORT_HEIGHT = 1125;
export const HOMEPAGE_PHOTO_MIN_ZOOM = 1;
export const HOMEPAGE_PHOTO_MAX_ZOOM = 3;

export type HomepagePhotoFrame = {
  zoom: number;
  centerX: number;
  centerY: number;
};

export type HomepagePhotoWindow = {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  centerX: number;
  centerY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function initialHomepagePhotoFrame(
  imageWidth: number,
  imageHeight: number,
): HomepagePhotoFrame {
  return { zoom: HOMEPAGE_PHOTO_MIN_ZOOM, centerX: imageWidth / 2, centerY: imageHeight / 2 };
}

/** The part of the original photo that fills the homepage frame. */
export function homepagePhotoWindow(
  imageWidth: number,
  imageHeight: number,
  frame: HomepagePhotoFrame,
): HomepagePhotoWindow {
  const zoom = clamp(frame.zoom, HOMEPAGE_PHOTO_MIN_ZOOM, HOMEPAGE_PHOTO_MAX_ZOOM);
  let width: number;
  let height: number;
  if (imageWidth / imageHeight > HOMEPAGE_PHOTO_ASPECT) {
    height = imageHeight / zoom;
    width = height * HOMEPAGE_PHOTO_ASPECT;
  } else {
    width = imageWidth / zoom;
    height = width / HOMEPAGE_PHOTO_ASPECT;
  }
  const centerX = clamp(frame.centerX, width / 2, imageWidth - width / 2);
  const centerY = clamp(frame.centerY, height / 2, imageHeight - height / 2);
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    zoom,
    centerX,
    centerY,
  };
}

export function panHomepagePhoto(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  frame: HomepagePhotoFrame,
  deltaX: number,
  deltaY: number,
): HomepagePhotoFrame {
  const current = homepagePhotoWindow(imageWidth, imageHeight, frame);
  const scale = frameWidth / current.width;
  return homepagePhotoWindow(imageWidth, imageHeight, {
    zoom: current.zoom,
    centerX: current.centerX - deltaX / scale,
    centerY: current.centerY - deltaY / scale,
  });
}

export function homepagePhotoDisplay(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  frame: HomepagePhotoFrame,
) {
  const window = homepagePhotoWindow(imageWidth, imageHeight, frame);
  const scale = frameWidth / window.width;
  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    x: -window.x * scale,
    y: -window.y * scale,
  };
}
