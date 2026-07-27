"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

const churchEmail = "firstupcsaco@hotmail.com";
const currentYear = new Date().getFullYear();

export default function GivingStatementsPage() {
  function requestStatement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = encodeURIComponent("Giving Statement Request");
    const body = encodeURIComponent(
      [
        "Giving statement request from the BITS guest page",
        "",
        `Name: ${data.get("name")}`,
        `Email: ${data.get("email")}`,
        `Phone: ${data.get("phone") || "Not provided"}`,
        `Statement year: ${data.get("year")}`,
        `Preferred delivery: ${data.get("delivery")}`,
        "",
        "Additional information:",
        String(data.get("notes") || "None"),
      ].join("\n"),
    );
    window.location.href = `mailto:${churchEmail}?subject=${subject}&body=${body}`;
  }

  const fieldClass =
    "w-full rounded-xl border border-[var(--bits-border)] bg-white px-4 py-3 text-[var(--foreground)]";

  return (
    <main className="min-h-screen bg-[var(--bits-page)]">
      <header className="border-b-4 border-[var(--bits-gold)] bg-[var(--bits-navy)] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="font-semibold">
            <span className="mr-2 text-[var(--bits-gold)]">✝</span>
            First UPC of Saco
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold"
          >
            Back Home
          </Link>
        </div>
      </header>

      <section className="bg-[var(--bits-navy-deep)] px-4 py-9 text-center text-white">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--bits-gold)]">
          Giving Records
        </p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
          Giving Statements
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/75">
          Request a contribution statement or enter the secure portal.
        </p>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.7fr]">
        <form
          onSubmit={requestStatement}
          className="grid gap-5 rounded-2xl border border-[var(--bits-border)] bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8"
        >
          <h2 className="text-xl font-semibold text-[var(--bits-navy)] sm:col-span-2">
            Request Your Statement
          </h2>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Full name
            </span>
            <input name="name" required className={fieldClass} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Email
            </span>
            <input name="email" type="email" required className={fieldClass} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Phone <span className="font-normal text-[var(--bits-muted)]">(optional)</span>
            </span>
            <input name="phone" type="tel" className={fieldClass} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Statement year
            </span>
            <select name="year" defaultValue={String(currentYear - 1)} className={fieldClass}>
              {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(
                (year) => (
                  <option key={year}>{year}</option>
                ),
              )}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Preferred delivery
            </span>
            <select name="delivery" defaultValue="Email" className={fieldClass}>
              <option>Email</option>
              <option>Postal mail</option>
              <option>Pick up at church</option>
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-[var(--bits-navy)]">
              Additional information <span className="font-normal text-[var(--bits-muted)]">(optional)</span>
            </span>
            <textarea name="notes" rows={3} className={fieldClass} />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[var(--bits-gold)] px-6 py-3 font-bold text-[var(--bits-navy-deep)] sm:col-span-2"
          >
            Request Giving Statement
          </button>
          <p className="text-center text-xs leading-5 text-[var(--bits-muted)] sm:col-span-2">
            This opens your email app with the request addressed to {churchEmail}.
            Never include bank, card, or Social Security information.
          </p>
        </form>

        <aside className="h-fit rounded-2xl bg-[var(--bits-navy)] p-7 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bits-gold)]">
            Secure Access
          </p>
          <h2 className="mt-2 text-xl font-semibold">Already have access?</h2>
          <p className="mt-2 text-sm leading-6 text-white/75">
            Sign in to reach the secure area available for your approved church
            role.
          </p>
          <Show when="signed-out">
            <SignInButton mode="redirect">
              <button
                type="button"
                className="mt-5 w-full rounded-xl bg-white px-5 py-3 text-sm font-bold text-[var(--bits-navy)]"
              >
                Sign In
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/statements"
              className="mt-5 inline-flex w-full justify-center rounded-xl bg-white px-5 py-3 text-sm font-bold text-[var(--bits-navy)]"
            >
              Open Statements
            </Link>
          </Show>
        </aside>
      </section>
    </main>
  );
}
