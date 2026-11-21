"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type SlideshowPhotoRecord = {
  id: string;
  alt: string;
  sortOrder: number;
};

async function readResult(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The slideshow could not be changed.");
  return result;
}

export function HomepageSlideshowManager({ photos }: { photos: SlideshowPhotoRecord[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The slideshow could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-3 rounded-2xl border border-white/20 bg-[var(--bits-navy)] p-3 text-white">
      <summary className="min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-[var(--bits-gold)]">
        Manage slideshow
      </summary>
      <div className="space-y-4 p-2">
        <p className="text-sm text-white/80">Add photos of our church family. Visitors see one photo at a time. JPEG, PNG, or WebP, up to 12 MB. Twelve photos is the limit.</p>
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const selected = (form.elements.namedItem("photo") as HTMLInputElement).files?.[0];
          const description = String(new FormData(form).get("description") ?? "");
          if (!selected) { setError("Choose a photo first."); return; }
          void run(async () => {
            const response = await fetch("/api/homepage-slideshow", {
              method: "POST",
              body: selected,
              headers: { "Content-Type": selected.type || "application/octet-stream", "x-photo-description": encodeURIComponent(description) },
            });
            await readResult(response);
            form.reset();
            setPreview(null);
            setMessage("Photo added to the slideshow.");
          });
        }}>
          <label className="block text-sm font-medium">Photo
            <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy}
              className="mt-1 block w-full rounded-lg border border-white/30 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-[var(--bits-navy)]"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                setPreview(selected ? URL.createObjectURL(selected) : null);
                setError("");
              }} />
          </label>
          {preview ? (
            // Local preview of a file the administrator just chose. It is not a remote image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-40 w-full rounded-lg object-contain" />
          ) : null}
          <label className="block text-sm font-medium">Photo description
            <input name="description" required maxLength={200} disabled={busy} placeholder="For example: Fellowship lunch after service"
              className="mt-1 block w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-[var(--bits-navy)]" />
          </label>
          <button disabled={busy} type="submit" className="min-h-11 rounded-lg bg-[var(--bits-gold)] px-4 py-2 text-sm font-bold text-[var(--bits-navy)] disabled:opacity-60">
            {busy ? "Saving…" : "Add to slideshow"}
          </button>
        </form>
        {photos.length === 0 ? <p className="text-sm text-white/80">No church family photos yet. Visitors will not see an empty slideshow.</p> : null}
        <ul className="space-y-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex gap-3 rounded-xl border border-white/15 p-2">
              <Image src={`/api/homepage-slideshow/${photo.id}`} alt="" width={96} height={64} unoptimized className="h-16 w-24 rounded-md object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{photo.alt}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={busy || index === 0} className="min-h-11 rounded-lg border border-white/40 px-3 text-sm disabled:opacity-40" onClick={() => {
                    const ids = photos.map((item) => item.id);
                    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                    void run(async () => { await readResult(await fetch("/api/homepage-slideshow", { method: "POST", headers: { "Content-Type": "application/json", "x-slideshow-action": "reorder" }, body: JSON.stringify({ ids }) })); setMessage("Slideshow order saved."); });
                  }}>Move earlier</button>
                  <button type="button" disabled={busy || index === photos.length - 1} className="min-h-11 rounded-lg border border-white/40 px-3 text-sm disabled:opacity-40" onClick={() => {
                    const ids = photos.map((item) => item.id);
                    [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                    void run(async () => { await readResult(await fetch("/api/homepage-slideshow", { method: "POST", headers: { "Content-Type": "application/json", "x-slideshow-action": "reorder" }, body: JSON.stringify({ ids }) })); setMessage("Slideshow order saved."); });
                  }}>Move later</button>
                  <button type="button" disabled={busy} className="min-h-11 rounded-lg border border-white/40 px-3 text-sm" onClick={() => {
                    if (!window.confirm("Remove this photo from the slideshow?")) return;
                    void run(async () => { await readResult(await fetch(`/api/homepage-slideshow/${photo.id}`, { method: "DELETE" })); setMessage("Photo removed."); });
                  }}>Remove</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {error ? <p role="alert" className="text-sm">{error}</p> : null}
        <p role="status" className="text-sm">{message}</p>
      </div>
    </details>
  );
}
