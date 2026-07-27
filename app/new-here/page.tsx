"use client";

import Link from "next/link";

const churchEmail = "firstupcsaco@hotmail.com";

export default function NewHerePage() {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = encodeURIComponent("I'm New Here — First UPC of Saco");
    const body = encodeURIComponent(
      [
        "New guest connection form",
        "",
        `Name: ${data.get("name")}`,
        `Phone: ${data.get("phone") || "Not provided"}`,
        `Email: ${data.get("email") || "Not provided"}`,
        `Family members attending: ${data.get("familyCount") || "Not provided"}`,
        `How they heard about us: ${data.get("heardAbout") || "Not provided"}`,
        `Would like contact: ${data.get("contactRequested") === "yes" ? "Yes" : "No"}`,
        "",
        "Message:",
        String(data.get("message") || "None"),
      ].join("\n"),
    );
    window.location.href = `mailto:${churchEmail}?subject=${subject}&body=${body}`;
  }

  const input =
    "w-full rounded-xl border border-[var(--bits-border)] bg-white px-4 py-3 text-[var(--foreground)]";

  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="font-semibold">
            <span className="mr-2 text-[var(--bits-gold)]">✝</span>
            First UPC of Saco
          </Link>
          <Link href="/" className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold">
            Back Home
          </Link>
        </div>
      </header>

      <section className="bg-[var(--bits-navy-deep)] px-4 py-9 text-center text-white">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--bits-gold)]">
          Welcome
        </p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">I’m New Here</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/75">
          We would love to meet you and help you feel at home.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <form onSubmit={submit} className="grid gap-5 rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8">
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">Name</span>
            <input name="name" required className={input} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">Phone</span>
            <input name="phone" type="tel" className={input} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">Email</span>
            <input name="email" type="email" className={input} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">Number of family members</span>
            <input name="familyCount" type="number" min="1" className={input} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">How did you hear about us?</span>
            <select name="heardAbout" className={input} defaultValue="">
              <option value="">Select one</option>
              <option>Friend or family</option>
              <option>Social media</option>
              <option>Online search</option>
              <option>Community event</option>
              <option>Other</option>
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">Would you like someone to contact you?</span>
            <select name="contactRequested" className={input} defaultValue="yes">
              <option value="yes">Yes, please contact me</option>
              <option value="no">No, thank you</option>
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">How can we help?</span>
            <textarea name="message" rows={4} className={input} />
          </label>
          <button type="submit" className="rounded-xl bg-[var(--bits-gold)] px-6 py-3 font-bold text-[var(--bits-navy-deep)] sm:col-span-2">
            Send Connection Form
          </button>
          <p className="text-center text-xs text-[var(--bits-muted)] sm:col-span-2">
            This opens your email app with the form addressed to {churchEmail}.
          </p>
        </form>
      </section>
    </main>
  );
}
