"use client";

import { useRef, useState } from "react";

export function ProfilePhotoControls({
  rosterKey,
  hasPhoto,
}: {
  rosterKey: string;
  hasPhoto: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  async function saveCrop() {
    const image = imageRef.current;
    if (!image) return;
    setBusy(true);
    setMessage(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo could not be prepared.");
      const base = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
      const sourceX = (image.naturalWidth - base) / 2 - offset.x;
      const sourceY = (image.naturalHeight - base) / 2 - offset.y;
      context.drawImage(image, sourceX, sourceY, base, base, 0, 0, 512, 512);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("Photo could not be prepared."))),
          "image/webp",
          0.8,
        );
      });
      const response = await fetch(`/api/church-profile-photo/${rosterKey}`, {
        method: "POST",
        body: blob,
        headers: { "content-type": "image/webp" },
      });
      setMessage(response.ok ? "Photo saved." : "Photo was not saved.");
      if (response.ok) setPreview(null);
    } catch {
      setMessage("Photo was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    const response = await fetch(`/api/church-profile-photo/${rosterKey}`, { method: "DELETE" });
    setBusy(false);
    setMessage(response.ok ? "Photo removed." : "Photo was not removed.");
  }

  return (
    <div className="grid gap-3">
      <label className="text-sm font-medium text-[var(--bits-navy)]">
        Profile photo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="mt-1 block w-full text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setPreview(URL.createObjectURL(file));
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
        />
      </label>
      {preview ? (
        <div className="grid max-w-xs gap-2">
          <div
            className="h-40 w-40 overflow-hidden rounded-full border-2 border-[var(--bits-gold)]"
            onPointerDown={(event) => {
              drag.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              setOffset((current) => ({
                x: current.x + event.clientX - drag.current!.x,
                y: current.y + event.clientY - drag.current!.y,
              }));
              drag.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          >
            {/* The preview is a local object URL chosen by this person. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={preview}
              alt=""
              className="h-full w-full object-cover"
              style={{ transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px)` }}
            />
          </div>
          <label className="text-sm text-[var(--bits-navy)]">
            Zoom
            <input
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-1 block w-full"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={saveCrop}
            className="rounded-xl bg-[var(--bits-navy)] px-4 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
          >
            Save photo
          </button>
        </div>
      ) : null}
      {hasPhoto ? (
        <button
          type="button"
          disabled={busy}
          onClick={removePhoto}
          className="w-fit text-sm font-semibold text-[var(--bits-navy)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        >
          Remove photo
        </button>
      ) : null}
      {message ? <p className="text-sm text-[var(--bits-navy)]">{message}</p> : null}
    </div>
  );
}
