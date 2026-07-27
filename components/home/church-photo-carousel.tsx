"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export type ChurchPhoto = {
  src: string;
  alt: string;
};

export function ChurchPhotoCarousel({
  photos,
}: {
  photos: ChurchPhoto[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (photos.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % photos.length);
    }, 5500);

    return () => window.clearInterval(timer);
  }, [photos.length]);

  if (photos.length === 0) {
    return (
      <div className="grid h-full min-h-36 place-items-center bg-gradient-to-br from-white/15 to-white/5 p-4 text-center">
        <div>
          <span
            aria-hidden="true"
            className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[var(--bits-gold)] text-2xl text-[var(--bits-gold)]"
          >
            ✦
          </span>
          <p className="mt-3 font-semibold text-white">Church Family Photos</p>
          <p className="mt-1 text-xs leading-5 text-white/65">
            Add your congregation pictures to begin the rotating slideshow.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-full min-h-36 overflow-hidden"
      aria-roledescription="carousel"
      aria-label="Church family photos"
    >
      {photos.map((photo, index) => (
        <div
          key={photo.src}
          aria-hidden={index !== activeIndex}
          className={`absolute inset-0 transition-opacity duration-700 ${
            index === activeIndex ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(min-width: 1024px) 38vw, 100vw"
            className="object-cover"
            priority={index === 0}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bits-navy-deep)]/60 to-transparent" />
        </div>
      ))}

      {photos.length > 1 ? (
        <div className="absolute bottom-3 left-0 right-0 z-10 flex justify-center gap-2">
          {photos.map((photo, index) => (
            <button
              key={photo.src}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Show church photo ${index + 1}`}
              aria-current={index === activeIndex}
              className={`h-2.5 rounded-full transition-all ${
                index === activeIndex
                  ? "w-7 bg-[var(--bits-gold)]"
                  : "w-2.5 bg-white/70 hover:bg-white"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
