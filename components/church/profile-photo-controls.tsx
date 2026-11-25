"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function ProfilePhotoControls({
  rosterKey,
  hasPhoto,
  initials,
  label,
  title,
  subtitle,
  profileHref,
}: {
  rosterKey: string;
  hasPhoto: boolean;
  initials: string;
  label: "Change photo" | "Edit photo";
  title?: string;
  subtitle?: string;
  profileHref?: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(
    hasPhoto ? `/api/church-profile-photo/${rosterKey}` : null,
  );
  const [photoPresent, setPhotoPresent] = useState(hasPhoto);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  function chooseFile() {
    fileRef.current?.click();
  }

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
      if (!response.ok) {
        setMessage("Photo was not saved.");
        return;
      }
      setShown(URL.createObjectURL(blob));
      setPhotoPresent(true);
      setPreview(null);
      setMessage("Photo saved. Who can see it was not changed.");
      router.refresh();
    } catch {
      setMessage("Photo was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/church-profile-photo/${rosterKey}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      setMessage("Photo was not removed.");
      return;
    }
    setShown(null);
    setPhotoPresent(false);
    setPreview(null);
    setMessage("Photo removed. Initials are shown until you add another photo.");
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {shown ? (
          // Profile bytes are served by an authorized route, or a local preview after save.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt=""
            className={`${title ? "h-14 w-14" : "h-20 w-20"} shrink-0 rounded-full border-2 border-[var(--bits-gold)] object-cover`}
            onError={() => {
              setShown(null);
              setPhotoPresent(false);
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            className={`grid ${title ? "h-14 w-14 text-sm" : "h-20 w-20 text-lg"} shrink-0 place-items-center rounded-full border-2 border-[var(--bits-gold)] bg-[var(--bits-navy)] font-semibold text-[var(--bits-gold)]`}
          >
            {initials || "•"}
          </span>
        )}
        {title ? (
          <span className="min-w-0 flex-1">
            {profileHref ? (
              <Link
                href={profileHref}
                className="block break-words text-base font-semibold leading-snug text-[var(--bits-navy)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
              >
                {title}
              </Link>
            ) : (
              <span className="block break-words text-base font-semibold leading-snug text-[var(--bits-navy)]">
                {title}
              </span>
            )}
            {subtitle ? (
              <span className="mt-1 block text-sm text-[var(--bits-muted)]">{subtitle}</span>
            ) : null}
          </span>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={chooseFile}
            className="bits-button rounded-xl border border-[var(--bits-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--bits-navy)]"
          >
            {label}
          </button>
          {photoPresent ? (
            <button
              type="button"
              disabled={busy}
              onClick={removePhoto}
              className="rounded-xl border border-[var(--bits-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--bits-navy)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
            >
              Remove photo
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={label}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setPreview(URL.createObjectURL(file));
          setZoom(1);
          setOffset({ x: 0, y: 0 });
          setMessage(null);
        }}
      />
      {preview ? (
        <div className="grid max-w-xs gap-2">
          <p className="text-sm text-[var(--bits-navy)]">Drag the photo to crop it, then save.</p>
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
              aria-label="Zoom photo"
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
      {message ? <p className="text-sm text-[var(--bits-navy)]">{message}</p> : null}
    </div>
  );
}
