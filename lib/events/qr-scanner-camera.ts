/**
 * Blueprint 7.3V — camera helpers for staff QR scanning.
 * Uses browser BarcodeDetector when present (no new npm decoder dependency).
 * Always stop tracks on capture/close/unmount — never retain frames.
 */

export type QrCameraPermissionState =
  | "idle"
  | "pending"
  | "granted"
  | "denied"
  | "unavailable"
  | "error";

type BarcodeDetectorLike = {
  detect: (
    source: HTMLVideoElement,
  ) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

export function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
}

export function detachVideoStream(video: HTMLVideoElement | null) {
  if (!video) return;
  video.pause();
  video.srcObject = null;
}

/** Video-only constraints; prefer rear/environment camera when the UA supports it. */
export function qrVideoMediaConstraints(): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
    },
  };
}

/** Video-only; prefer rear/environment camera when the UA supports it. */
export async function startQrVideoStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera is unavailable in this browser.");
  }
  return navigator.mediaDevices.getUserMedia(qrVideoMediaConstraints());
}

export function createQrBarcodeDetector(): BarcodeDetectorLike | null {
  const Ctor = (
    globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

/**
 * Run a detect loop until a QR value is found or `shouldStop` returns true.
 * Callers must stop the stream after a value is returned.
 */
export async function detectQrFromVideo(input: {
  video: HTMLVideoElement;
  detector: BarcodeDetectorLike;
  shouldStop: () => boolean;
  onFrameError?: (error: unknown) => void;
}): Promise<string | null> {
  while (!input.shouldStop()) {
    // HAVE_CURRENT_DATA === 2 (avoid HTMLMediaElement global for Node tests)
    if (input.video.readyState < 2) {
      await wait(80);
      continue;
    }
    try {
      const codes = await input.detector.detect(input.video);
      const value = codes.find((row) => row.rawValue)?.rawValue;
      if (value) return value;
    } catch (error) {
      input.onFrameError?.(error);
    }
    await wait(120);
  }
  return null;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}
