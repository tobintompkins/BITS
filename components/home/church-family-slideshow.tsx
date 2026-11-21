"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { DISPLAY_PREFERENCES_CHANGE_EVENT } from "@/lib/accessibility/display-preferences";

export type ChurchFamilySlide = {
  src: string;
  alt: string;
};

function prefersReducedMotion() {
  return document.documentElement.getAttribute("data-bits-reduce-motion") === "true"
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ChurchFamilySlideshow({ photos }: { photos: ChurchFamilySlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const count = photos.length;
  const active = photos[index] ?? photos[0];

  useEffect(() => {
    const sync = () => setReducedMotion(prefersReducedMotion());
    sync();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", sync);
    window.addEventListener(DISPLAY_PREFERENCES_CHANGE_EVENT, sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener(DISPLAY_PREFERENCES_CHANGE_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [count, paused, reducedMotion]);

  function show(next: number) {
    if (count < 1) return;
    setIndex((next + count) % count);
  }

  if (!active) return null;

  return (
    <div className="min-w-0">
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Our Church Family"
        tabIndex={0}
        className="overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]"
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft") { event.preventDefault(); show(index - 1); }
          else if (event.key === "ArrowRight") { event.preventDefault(); show(index + 1); }
          else if ((event.key === " " || event.key === "Spacebar") && !reducedMotion && count > 1) {
            event.preventDefault();
            setPaused((current) => !current);
          }
        }}
      >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--bits-navy)]">
          {photos.map((photo, photoIndex) => (
            <div
              key={photo.src}
              aria-hidden={photoIndex !== index}
              className={`absolute inset-0 ${reducedMotion ? "" : "transition-opacity duration-700"} ${
                photoIndex === index ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                unoptimized={photo.src.startsWith("/api/homepage-slideshow")}
                sizes="(min-width: 1024px) 34vw, 100vw"
                className="object-cover"
                priority={photoIndex === 0}
              />
            </div>
          ))}
        </div>
        <p className="px-3 py-2 text-sm font-semibold text-[var(--bits-gold)]">Our Church Family</p>
        <p className="sr-only" aria-live="polite">
          {`Photo ${index + 1} of ${count}: ${active.alt}`}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className="min-h-11 rounded-lg border border-white/40 px-3 text-sm font-semibold disabled:opacity-40" aria-label="Previous church family photo" disabled={count < 2} onClick={() => show(index - 1)}>Previous</button>
          <button type="button" className="min-h-11 rounded-lg border border-white/40 px-3 text-sm font-semibold disabled:opacity-40" aria-label={paused ? "Play church family slideshow" : "Pause church family slideshow"} aria-pressed={paused || reducedMotion} disabled={count < 2 || reducedMotion} onClick={() => setPaused((current) => !current)}>
            {paused || reducedMotion ? "Play" : "Pause"}
          </button>
          <button type="button" className="min-h-11 rounded-lg border border-white/40 px-3 text-sm font-semibold disabled:opacity-40" aria-label="Next church family photo" disabled={count < 2} onClick={() => show(index + 1)}>Next</button>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Choose a church family photo">
          {photos.map((photo, photoIndex) => (
            <button
              key={photo.src}
              type="button"
              aria-label={`Show photo ${photoIndex + 1}: ${photo.alt}`}
              aria-current={photoIndex === index}
              className={`h-2.5 rounded-full ${photoIndex === index ? "w-7 bg-[var(--bits-gold)]" : "w-2.5 bg-white/70"}`}
              onClick={() => show(photoIndex)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
