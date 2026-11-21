"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  HOMEPAGE_PHOTO_EXPORT_HEIGHT,
  HOMEPAGE_PHOTO_EXPORT_WIDTH,
  HOMEPAGE_PHOTO_MAX_ZOOM,
  HOMEPAGE_PHOTO_MIN_ZOOM,
  homepagePhotoDisplay,
  homepagePhotoWindow,
  initialHomepagePhotoFrame,
  panHomepagePhoto,
  type HomepagePhotoFrame,
} from "@/lib/home/homepage-photo-frame";

export type HomepagePhotoCropperHandle = {
  exportCrop: () => Promise<Blob>;
};

export const HomepagePhotoCropper = forwardRef<
  HomepagePhotoCropperHandle,
  { src: string; disabled?: boolean }
>(function HomepagePhotoCropper({ src, disabled }, ref) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [frame, setFrame] = useState<HomepagePhotoFrame | null>(null);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImageSize(null);
    setFrame(null);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const measure = () => setBox({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [src]);

  useImperativeHandle(ref, () => ({
    exportCrop: () =>
      new Promise((resolve, reject) => {
        const image = imageRef.current;
        if (!image || !imageSize || !frame) {
          reject(new Error("Wait for the photo preview, then try again."));
          return;
        }
        const crop = homepagePhotoWindow(imageSize.width, imageSize.height, frame);
        const canvas = document.createElement("canvas");
        canvas.width = HOMEPAGE_PHOTO_EXPORT_WIDTH;
        canvas.height = HOMEPAGE_PHOTO_EXPORT_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Photo could not be prepared."));
          return;
        }
        context.drawImage(
          image,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          HOMEPAGE_PHOTO_EXPORT_WIDTH,
          HOMEPAGE_PHOTO_EXPORT_HEIGHT,
        );
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Photo could not be prepared."))),
          "image/jpeg",
          0.92,
        );
      }),
  }));

  const display =
    imageSize && frame && box.width > 0 && box.height > 0
      ? homepagePhotoDisplay(imageSize.width, imageSize.height, box.width, box.height, frame)
      : null;

  function move(deltaX: number, deltaY: number) {
    if (!imageSize || !frame || box.width <= 0 || box.height <= 0 || disabled) return;
    setFrame(
      panHomepagePhoto(imageSize.width, imageSize.height, box.width, box.height, frame, deltaX, deltaY),
    );
  }

  function setZoom(nextZoom: number) {
    if (!imageSize || !frame) return;
    setFrame(homepagePhotoWindow(imageSize.width, imageSize.height, { ...frame, zoom: nextZoom }));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-[var(--bits-gold)]">Position photo</p>
      <div
        ref={frameRef}
        role="application"
        aria-label="Photo position. Drag to move the picture inside the frame. Arrow keys move it too."
        tabIndex={disabled ? -1 : 0}
        className="relative aspect-[16/9] w-full cursor-grab touch-none overflow-hidden rounded-lg border-2 border-[var(--bits-gold)] bg-[var(--bits-navy-deep)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:cursor-grabbing"
        onPointerDown={(event) => {
          if (disabled || !imageSize) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          move(event.clientX - drag.current.x, event.clientY - drag.current.y);
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 40 : 12;
          if (event.key === "ArrowLeft") move(-step, 0);
          else if (event.key === "ArrowRight") move(step, 0);
          else if (event.key === "ArrowUp") move(0, -step);
          else if (event.key === "ArrowDown") move(0, step);
          else return;
          event.preventDefault();
        }}
      >
        {failed ? (
          <p className="grid h-full place-items-center px-4 text-center text-sm">This photo could not be previewed.</p>
        ) : (
          // The preview is positioned by the crop math. The description field is the public alt text.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={src}
            alt=""
            draggable={false}
            className="absolute max-w-none select-none"
            style={
              display
                ? { width: display.width, height: display.height, left: display.x, top: display.y }
                : { visibility: "hidden" }
            }
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (!naturalWidth || !naturalHeight) {
                setFailed(true);
                return;
              }
              setImageSize({ width: naturalWidth, height: naturalHeight });
              setFrame(initialHomepagePhotoFrame(naturalWidth, naturalHeight));
            }}
            onError={() => setFailed(true)}
          />
        )}
        {imageSize && !dragging ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white">
              Drag to reposition
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Zoom out"
          disabled={disabled || !frame || frame.zoom <= HOMEPAGE_PHOTO_MIN_ZOOM}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/40 text-lg font-semibold disabled:opacity-40"
          onClick={() => frame && setZoom(frame.zoom - 0.1)}
        >
          −
        </button>
        <label className="block min-w-0 flex-1 text-sm font-medium">
          Zoom
          <input
            type="range"
            min={HOMEPAGE_PHOTO_MIN_ZOOM}
            max={HOMEPAGE_PHOTO_MAX_ZOOM}
            step={0.01}
            value={frame?.zoom ?? HOMEPAGE_PHOTO_MIN_ZOOM}
            disabled={disabled || !frame}
            aria-valuetext={frame ? `${Math.round(frame.zoom * 100)} percent` : "Fit"}
            className="mt-1 block w-full accent-[var(--bits-gold)]"
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={disabled || !frame || frame.zoom >= HOMEPAGE_PHOTO_MAX_ZOOM}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/40 text-lg font-semibold disabled:opacity-40"
          onClick={() => frame && setZoom(frame.zoom + 0.1)}
        >
          +
        </button>
      </div>
      <button
        type="button"
        disabled={disabled || !imageSize}
        className="min-h-11 rounded-lg border border-white/40 px-4 py-2 text-sm"
        onClick={() => {
          if (!imageSize) return;
          setFrame(initialHomepagePhotoFrame(imageSize.width, imageSize.height));
        }}
      >
        Fit photo
      </button>
    </div>
  );
});
