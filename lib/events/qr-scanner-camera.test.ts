import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createQrBarcodeDetector,
  detectQrFromVideo,
  qrVideoMediaConstraints,
  stopMediaStream,
} from "@/lib/events/qr-scanner-camera";

describe("qr-scanner-camera", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests video without audio and prefers environment facing mode", () => {
    const constraints = qrVideoMediaConstraints();
    expect(constraints.audio).toBe(false);
    expect(constraints.video).toEqual({
      facingMode: { ideal: "environment" },
    });
  });

  it("stops every media track on cleanup", () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopA }, { stop: stopB }],
    } as unknown as MediaStream;
    stopMediaStream(stream);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).toHaveBeenCalledTimes(1);
  });

  it("latches the first decoded QR value and ignores later frames", async () => {
    const detect = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rawValue: "BITS-CI:once" }])
      .mockResolvedValue([{ rawValue: "BITS-CI:twice" }]);

    vi.stubGlobal("BarcodeDetector", class {
      detect = detect;
    });

    const detector = createQrBarcodeDetector();
    expect(detector).not.toBeNull();

    const video = {
      readyState: 2, // HAVE_CURRENT_DATA
    } as HTMLVideoElement;

    const value = await detectQrFromVideo({
      video,
      detector: detector!,
      shouldStop: () => false,
    });
    expect(value).toBe("BITS-CI:once");
    expect(detect.mock.calls.length).toBe(2);

    await expect(
      detectQrFromVideo({
        video,
        detector: detector!,
        shouldStop: () => true,
      }),
    ).resolves.toBeNull();
    // Already-stopped session must not call detect again.
    expect(detect.mock.calls.length).toBe(2);
  });

  it("returns null detector when BarcodeDetector is absent", () => {
    vi.stubGlobal("BarcodeDetector", undefined);
    expect(createQrBarcodeDetector()).toBeNull();
  });
});
