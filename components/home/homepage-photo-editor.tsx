"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function HomepagePhotoEditor({ version, description }: { version: number; description: string }) {
  const router = useRouter();
  const details = useRef<HTMLDetailsElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <details ref={details} className="border-t border-white/20 bg-[var(--bits-navy)] p-3 text-white">
      <summary className="min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-[var(--bits-gold)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bits-gold)]">
        {version ? "Change photo" : "Add photo"}
      </summary>
      <form className="space-y-3 p-2" onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        if (!file) { setError("Choose a photo first."); return; }
        const form = event.currentTarget;
        const alt = String(new FormData(form).get("description") ?? "");
        setBusy(true); setError(""); setMessage("");
        try {
          const response = await fetch("/api/homepage-photo", { method: "POST", body: file, headers: {
            "Content-Type": file.type || "application/octet-stream",
            "x-photo-description": encodeURIComponent(alt), "x-photo-version": String(version),
          } });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Photo could not be saved.");
          setFile(null); setPreview(null); form.reset(); setMessage("Photo saved. It is now visible to visitors.");
          router.refresh();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Photo could not be saved. Try again.");
        } finally { setBusy(false); }
      }}>
        <p className="text-sm text-white/80">Choose a church photo you have permission to share publicly. JPEG, PNG, or WebP, up to 5 MB.</p>
        <label className="block text-sm font-medium">Photo
          <input type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy}
            className="mt-1 block w-full rounded-lg border border-white/30 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-[var(--bits-navy)]"
            onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); setPreview(selected ? URL.createObjectURL(selected) : null); setError(""); setMessage(""); }} />
        </label>
        <label className="block text-sm font-medium">Photo description
          <input name="description" required maxLength={200} defaultValue={description} disabled={busy}
            placeholder="For example: Our church family gathered outside"
            className="mt-1 block w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-[var(--bits-navy)]" />
        </label>
        {preview ? <Image src={preview} alt="Selected photo preview" width={480} height={270} unoptimized className="max-h-48 w-full rounded-lg object-contain" /> : null}
        {error ? <p role="alert" className="text-sm text-white">{error}</p> : null}
        <p role="status" className="text-sm text-white">{message}</p>
        <div className="flex gap-3">
          <button disabled={busy} type="submit" className="min-h-11 rounded-lg bg-[var(--bits-gold)] px-4 py-2 text-sm font-bold text-[var(--bits-navy)] disabled:opacity-60">{busy ? "Saving…" : "Save photo"}</button>
          <button disabled={busy} type="button" className="min-h-11 rounded-lg border border-white/40 px-4 py-2 text-sm" onClick={() => { setFile(null); setPreview(null); if (details.current) details.current.open = false; }}>Close</button>
        </div>
      </form>
    </details>
  );
}
