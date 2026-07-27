"use client";

import Link from "next/link";
import { useState } from "react";

export default function PublicPrayerRequestPage() {
  const [anonymous, setAnonymous] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitPrayerRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/public/prayer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          contact: String(form.get("replyTo") ?? ""),
          request: String(form.get("request") ?? ""),
          anonymous,
          sharePublicly: form.get("visibility") === "public",
          website: String(form.get("website") ?? ""),
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Unable to send request.");
      setMessage(result.message || "Prayer request sent.");
      formElement.reset();
      setAnonymous(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send request.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-full border-2 border-[var(--bits-gold)] text-xl text-[var(--bits-gold)]"
            >
              ✝
            </span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
                First UPC of Saco
              </span>
              <span className="block font-semibold">Prayer Request</span>
            </span>
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold transition hover:bg-white hover:text-[var(--bits-navy)]"
          >
            Back Home
          </Link>
        </div>
      </header>

      <section className="bg-[var(--bits-navy-deep)] px-4 py-9 text-center text-white sm:px-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--bits-gold)]">
          How can we pray for you?
        </p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
          Submit a Prayer Request
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/75">
          Share as much or as little as you feel comfortable sharing.
        </p>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <form
          onSubmit={submitPrayerRequest}
          className="space-y-6 rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm sm:p-8"
        >
          {message ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          <input
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />
          <label className="flex items-start gap-3 rounded-xl bg-[var(--bits-page)] p-4">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--bits-navy)]"
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--bits-navy)]">
                Submit anonymously
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--bits-muted)]">
                Your name will not be included with the request.
              </span>
            </span>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Your name <span className="font-normal text-[var(--bits-muted)]">(optional)</span>
            </span>
            <input
              name="name"
              type="text"
              disabled={anonymous}
              className="w-full rounded-xl border border-[var(--bits-border)] bg-white px-4 py-3 text-[var(--foreground)] disabled:bg-slate-100"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Email or phone <span className="font-normal text-[var(--bits-muted)]">(optional)</span>
            </span>
            <input
              name="replyTo"
              type="text"
              className="w-full rounded-xl border border-[var(--bits-border)] bg-white px-4 py-3 text-[var(--foreground)]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Who may see this request?
            </span>
            <select
              name="visibility"
              defaultValue="private"
              className="w-full rounded-xl border border-[var(--bits-border)] bg-white px-4 py-3 text-[var(--foreground)]"
            >
              <option value="private">
                Send privately to church leadership
              </option>
              <option value="public">
                Share on the public Prayer Wall now
              </option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Prayer request
            </span>
            <textarea
              name="request"
              required
              rows={6}
              className="w-full resize-y rounded-xl border border-[var(--bits-border)] bg-white px-4 py-3 text-[var(--foreground)]"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-[var(--bits-gold)] px-6 py-3 font-bold text-[var(--bits-navy-deep)] shadow-sm transition hover:bg-[var(--bits-gold-hover)] hover:text-white"
          >
            {pending ? "Sending..." : "Send Prayer Request"}
          </button>

          <p className="text-center text-xs leading-5 text-[var(--bits-muted)]">
            Public requests appear immediately for 14 days. Your contact
            information is never shown publicly, and leadership can remove a
            public request at any time.
          </p>
        </form>
      </section>
    </main>
  );
}
